import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ApiStore, IdempotencyRecord } from "./store.js";

export type ApiErrorCode =
  | "ACTION_TEMPORARILY_BLOCKED"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "PAYMENT_REQUIRED"
  | "RATE_LIMIT_EXCEEDED"
  | "SPAM_DETECTED"
  | "SUSPICIOUS_ACTIVITY"
  | "UNAUTHORIZED"
  | "UNPROCESSABLE_ENTITY"
  | "VALIDATION_ERROR";

export type ApiError = Error & {
  code: ApiErrorCode;
  details?: unknown;
  statusCode: number;
};

export type ApiErrorShape = {
  code: ApiErrorCode;
  details?: unknown;
  message: string;
  requestId: string;
};

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value)) as T;
    }
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

const normalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = normalizeValue(record[key]);
        return accumulator;
      }, {});
  }

  return value;
};

const hashValue = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(normalizeValue(value)) ?? "").digest("hex");

const errorWith = (statusCode: number, code: ApiErrorCode, message: string, details?: unknown): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  error.details = details;
  return error;
};

export const badRequest = (message: string, details?: unknown) =>
  errorWith(400, "BAD_REQUEST", message, details);

export const conflict = (message: string, details?: unknown) =>
  errorWith(409, "CONFLICT", message, details);

export const forbidden = (message: string, details?: unknown) =>
  errorWith(403, "FORBIDDEN", message, details);

export const actionTemporarilyBlocked = (message: string, details?: unknown) =>
  errorWith(429, "ACTION_TEMPORARILY_BLOCKED", message, details);

export const notFound = (message: string, details?: unknown) =>
  errorWith(404, "NOT_FOUND", message, details);

export const paymentRequired = (message: string, details?: unknown) =>
  errorWith(402, "PAYMENT_REQUIRED", message, details);

export const rateLimitExceeded = (message: string, details?: unknown) =>
  errorWith(429, "RATE_LIMIT_EXCEEDED", message, details);

export const suspiciousActivity = (message: string, details?: unknown) =>
  errorWith(409, "SUSPICIOUS_ACTIVITY", message, details);

export const spamDetected = (message: string, details?: unknown) =>
  errorWith(409, "SPAM_DETECTED", message, details);

export const unauthorized = (message: string, details?: unknown) =>
  errorWith(401, "UNAUTHORIZED", message, details);

export const validationError = (message: string, details?: unknown) =>
  errorWith(422, "VALIDATION_ERROR", message, details);

export const isApiError = (error: unknown): error is ApiError =>
  typeof error === "object" &&
  error !== null &&
  "statusCode" in error &&
  "code" in error &&
  typeof (error as ApiError).statusCode === "number" &&
  typeof (error as ApiError).code === "string";

export const normalizeError = (error: unknown, requestId: string): ApiErrorShape => {
  if (isApiError(error)) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
      requestId,
    };
  }

  if (error instanceof Error) {
    return {
      code: "BAD_REQUEST",
      message: error.message || "Unexpected error",
      requestId,
    };
  }

  return {
    code: "BAD_REQUEST",
    message: "Unexpected error",
    requestId,
  };
};

export const installHttpGuards = (app: FastifyInstance) => {
  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeError(error, request.id);
    const statusCode = isApiError(error) ? error.statusCode : 400;

    request.log[statusCode >= 500 ? "error" : "warn"](
      {
        error: normalized,
        method: request.method.toUpperCase(),
        requestId: request.id,
        route: (request.routeOptions as { url?: string } | undefined)?.url ?? request.url.split("?")[0],
        statusCode,
      },
      "request.failed"
    );

    reply.status(statusCode).send({
      ok: false,
      error: normalized,
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      ok: false,
      error: {
        code: "NOT_FOUND" as const,
        message: `Route not found: ${request.method} ${request.url}`,
        requestId: request.id,
      },
    });
  });
};

export const getHeaderValue = (header: string | string[] | undefined) => {
  if (Array.isArray(header)) {
    return header[0];
  }

  return header;
};

export const getIdempotencyKey = (header: string | string[] | undefined) => {
  const value = getHeaderValue(header);
  return value?.trim() || "";
};

export const getIdempotencyRecord = <T>(
  store: ApiStore,
  scope: string,
  idempotencyKey: string,
  body: unknown
): { record: IdempotencyRecord; response: T } | null => {
  const key = `${scope}:${idempotencyKey}`;
  const record = store.idempotencyRecords[key];
  if (!record) {
    return null;
  }

  if (record.bodySignature !== hashValue(body)) {
    throw conflict("Idempotency key already used with a different payload.", {
      scope,
      idempotencyKey,
    });
  }

  return {
    record,
    response: clone(record.response) as T,
  };
};

export const storeIdempotencyRecord = <T>(
  store: ApiStore,
  scope: string,
  idempotencyKey: string,
  body: unknown,
  statusCode: number,
  response: T
) => {
  const key = `${scope}:${idempotencyKey}`;
  store.idempotencyRecords[key] = {
    id: key,
    scope,
    idempotencyKey,
    bodySignature: hashValue(body),
    statusCode,
    response: clone(response),
    createdAt: new Date().toISOString(),
  };
};

export const maybeReplayedResponse = <T>(
  store: ApiStore,
  scope: string,
  idempotencyKey: string,
  body: unknown
): { statusCode: number; response: T } | null => {
  const replay = getIdempotencyRecord<T>(store, scope, idempotencyKey, body);
  if (!replay) {
    return null;
  }

  return {
    statusCode: replay.record.statusCode,
    response: replay.response,
  };
};

export const sendIdempotentResponse = <T>(
  store: ApiStore,
  scope: string,
  idempotencyKey: string,
  body: unknown,
  statusCode: number,
  response: T
) => {
  storeIdempotencyRecord(store, scope, idempotencyKey, body, statusCode, response);
  return response;
};

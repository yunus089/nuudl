import { createHash } from "node:crypto";
import Fastify from "fastify";
import { registerRoutes } from "./routes.js";

const requestStartTimes = new Map<string, bigint>();

const hashValue = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);

const headerValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
};

export const buildApp = async () => {
  const app = Fastify({
    logger: {
      base: {
        environment: process.env.NODE_ENV ?? "development",
        service: "nuudl-api",
      },
      level: process.env.API_LOG_LEVEL?.trim() || process.env.LOG_LEVEL?.trim() || "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.x-install-token",
          "req.headers.x-admin-id",
          "req.headers.x-backoffice-id",
          "req.headers.x-backoffice-secret",
          "req.headers.x-backoffice-session-id",
        ],
        remove: true,
      },
    },
  });

  app.addContentTypeParser(/^image\/.+$/, { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  app.addHook("onRequest", async (request, reply) => {
    requestStartTimes.set(request.id, process.hrtime.bigint());
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header(
      "Access-Control-Allow-Headers",
      "accept, authorization, content-type, idempotency-key, x-admin-id, x-admin-role, x-backoffice-id, x-backoffice-role, x-backoffice-secret, x-backoffice-session-id, x-install-token, x-upload-filename"
    );

    if (request.method === "OPTIONS") {
      return reply.code(204).send();
    }

    request.log.info(
      {
        event: "request.received",
        method: request.method.toUpperCase(),
        requestId: request.id,
        route: (request.routeOptions as { url?: string } | undefined)?.url ?? request.url.split("?")[0],
      },
      "request.received"
    );
  });

  app.addHook("onResponse", async (request, reply) => {
    const startedAt = requestStartTimes.get(request.id);
    requestStartTimes.delete(request.id);

    const durationMs = startedAt ? Number(process.hrtime.bigint() - startedAt) / 1_000_000 : undefined;
    const forwardedFor = headerValue(request.headers["x-forwarded-for"]).split(",")[0]?.trim();
    const clientIp = (forwardedFor || request.ip || "unknown").toLowerCase();
    const backofficeId = headerValue(request.headers["x-backoffice-id"] || request.headers["x-admin-id"]);
    const backofficeRole = headerValue(request.headers["x-backoffice-role"] || request.headers["x-admin-role"]);
    const hasInstallAuth = Boolean(
      headerValue(request.headers.authorization) || headerValue(request.headers["x-install-token"])
    );

    request.log.info(
      {
        actorType: backofficeId ? "backoffice" : hasInstallAuth ? "install" : "public",
        backofficeId: backofficeId || undefined,
        backofficeRole: backofficeRole || undefined,
        durationMs: durationMs !== undefined ? Number(durationMs.toFixed(2)) : undefined,
        ipHash: hashValue(clientIp),
        method: request.method.toUpperCase(),
        requestId: request.id,
        route: (request.routeOptions as { url?: string } | undefined)?.url ?? request.url.split("?")[0],
        statusCode: reply.statusCode,
      },
      "request.complete"
    );
  });

  await registerRoutes(app);
  return app;
};

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API_BASE_URL = "http://localhost:4000";
const BACKOFFICE_SESSION_COOKIE_NAME = "nuudl_backoffice_session";
const BACKOFFICE_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;
type BackofficeRole = "moderator" | "admin" | "owner";

const normalizeHost = (request: NextRequest) =>
  (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .split(":")[0]
    .trim()
    .toLowerCase();

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

const normalizeBackofficeRole = (value: string | null | undefined): BackofficeRole | null => {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "moderator" || normalized === "admin" || normalized === "owner") {
    return normalized;
  }

  return null;
};

const normalizeBackofficeSessionId = (value: string | null | undefined) => {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return /^[a-zA-Z0-9:_-]{8,120}$/.test(normalized) ? normalized : null;
};

const createBackofficeSessionId = () => `backoffice-session-${crypto.randomUUID()}`;

const resolveApiBaseUrl = (request: NextRequest) => {
  const configured = process.env.NUUDL_API_BASE_URL?.trim();
  if (configured) {
    return configured;
  }

  if (isLoopbackHost(normalizeHost(request))) {
    return DEFAULT_API_BASE_URL;
  }

  return "";
};

const resolveConfiguredBackofficeActor = () => {
  const id = process.env.NUUDL_BACKOFFICE_ID?.trim();
  const role = normalizeBackofficeRole(process.env.NUUDL_BACKOFFICE_ROLE);
  const sharedSecret = (process.env.NUUDL_BACKOFFICE_SHARED_SECRET ?? process.env.BACKOFFICE_SHARED_SECRET ?? "").trim();

  if (!id && !role && !sharedSecret) {
    return null;
  }

  if (!id || !role || !sharedSecret) {
    throw new Error(
      "NUUDL_BACKOFFICE_ID, NUUDL_BACKOFFICE_ROLE und NUUDL_BACKOFFICE_SHARED_SECRET muessen gemeinsam gesetzt sein.",
    );
  }

  return {
    id,
    role,
    sharedSecret,
  };
};

const resolveLoopbackDebugActor = (request: NextRequest) => {
  const requestedId =
    request.headers.get("x-backoffice-id")?.trim() ?? request.headers.get("x-admin-id")?.trim() ?? "admin-ops";
  const requestedRole =
    normalizeBackofficeRole(request.headers.get("x-backoffice-role") ?? request.headers.get("x-admin-role")) ?? "admin";

  return {
    id: requestedId,
    role: requestedRole,
  };
};

const buildTargetUrl = (request: NextRequest, path: string[]) => {
  const apiBaseUrl = resolveApiBaseUrl(request);
  if (!apiBaseUrl) {
    throw new Error("NUUDL_API_BASE_URL is not configured for the admin backoffice.");
  }

  const target = new URL(`${apiBaseUrl}/${path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return target;
};

const resolveBackofficeSession = (request: NextRequest) => {
  const existingSessionId = normalizeBackofficeSessionId(request.cookies.get(BACKOFFICE_SESSION_COOKIE_NAME)?.value);
  if (existingSessionId) {
    return {
      sessionId: existingSessionId,
      shouldSetCookie: false,
    };
  }

  return {
    sessionId: createBackofficeSessionId(),
    shouldSetCookie: true,
  };
};

const toHeaders = async (request: NextRequest) => {
  const headers = new Headers();
  headers.set("accept", "application/json");
  const session = resolveBackofficeSession(request);

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const configuredActor = resolveConfiguredBackofficeActor();
  if (configuredActor) {
    headers.set("x-admin-id", configuredActor.id);
    headers.set("x-admin-role", configuredActor.role);
    headers.set("x-backoffice-secret", configuredActor.sharedSecret);
    headers.set("x-backoffice-auth-mode", "trusted_proxy");
    headers.set("x-backoffice-session-id", session.sessionId);
  } else if (isLoopbackHost(normalizeHost(request))) {
    const actor = resolveLoopbackDebugActor(request);
    headers.set("x-admin-id", actor.id);
    headers.set("x-admin-role", actor.role);
    headers.set("x-backoffice-auth-mode", "loopback_dev_headers");
    headers.set("x-backoffice-session-id", session.sessionId);
  } else {
    throw new Error(
      "Backoffice actor ist fuer diesen Host nicht konfiguriert. Setze NUUDL_BACKOFFICE_ID, NUUDL_BACKOFFICE_ROLE und NUUDL_BACKOFFICE_SHARED_SECRET.",
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    headers.set("idempotency-key", idempotencyKey);
  }

  return {
    headers,
    session,
  };
};

const proxy = async (request: NextRequest, context: { params: Promise<{ path: string[] }> }) => {
  try {
    const { path } = await context.params;
    const targetUrl = buildTargetUrl(request, path);
    const { headers, session } = await toHeaders(request);

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });

    const body = await response.text();

    const proxiedResponse = new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });

    if (session.shouldSetCookie) {
      proxiedResponse.cookies.set({
        httpOnly: true,
        maxAge: BACKOFFICE_SESSION_COOKIE_MAX_AGE_SECONDS,
        name: BACKOFFICE_SESSION_COOKIE_NAME,
        path: "/",
        sameSite: "lax",
        secure: !isLoopbackHost(normalizeHost(request)),
        value: session.sessionId,
      });
    }

    return proxiedResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Backoffice proxy failed.";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "BACKOFFICE_PROXY_UNAVAILABLE",
          message,
        },
      },
      {
        status: 500,
      },
    );
  }
};

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, context);
}

import { NextRequest, NextResponse } from "next/server";

const DEFAULT_API_BASE_URL = "http://localhost:4000";

const normalizeHost = (request: NextRequest) =>
  (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .split(":")[0]
    .trim()
    .toLowerCase();

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

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

const toHeaders = async (request: NextRequest) => {
  const headers = new Headers();
  headers.set("accept", "application/json");

  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }

  const adminId = request.headers.get("x-backoffice-id");
  const adminRole = request.headers.get("x-backoffice-role");

  if (adminId) {
    headers.set("x-admin-id", adminId);
  }

  if (adminRole) {
    headers.set("x-admin-role", adminRole);
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (idempotencyKey) {
    headers.set("idempotency-key", idempotencyKey);
  }

  return headers;
};

const proxy = async (request: NextRequest, context: { params: Promise<{ path: string[] }> }) => {
  try {
    const { path } = await context.params;
    const targetUrl = buildTargetUrl(request, path);
    const headers = await toHeaders(request);

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });

    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json; charset=utf-8",
      },
    });
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

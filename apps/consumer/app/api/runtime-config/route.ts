import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const LOCAL_API_BASE_URL = "http://localhost:4000";

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isTruthy(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function GET() {
  const requestHeaders = await headers();
  const hostHeader = requestHeaders.get("host") ?? "";
  const hostname = hostHeader.split(":")[0].trim().toLowerCase();
  const loopback = isLoopbackHost(hostname);
  const apiBaseUrl = process.env.NUUDL_API_BASE_URL ?? (loopback ? LOCAL_API_BASE_URL : "");

  if (!apiBaseUrl) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "RUNTIME_CONFIG_MISSING",
          message: "NUUDL_API_BASE_URL is not configured for this environment.",
        },
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return Response.json(
    {
      allowLocalFallbacks: process.env.ALLOW_LOCAL_FALLBACKS === "true" && loopback,
      apiBaseUrl,
      betaInviteRequired: isTruthy(process.env.BETA_INVITE_REQUIRED),
      enableFakePayments: process.env.ALLOW_FAKE_PAYMENTS === "true" && loopback,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

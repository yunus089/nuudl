const apiBaseUrl = (process.env.NUUDL_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const consumerBaseUrl = (process.env.NUUDL_CONSUMER_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const adminBaseUrl = (process.env.NUUDL_ADMIN_BASE_URL || "").replace(/\/$/, "");
const args = process.argv.slice(2);
const expectEmpty =
  args.includes("--expect-empty") || process.env.BETA_EXPECT_EMPTY?.trim().toLowerCase() === "true";
const requireRedisRateLimit =
  args.includes("--require-redis-rate-limit") ||
  process.env.BETA_REQUIRE_REDIS_RATE_LIMIT?.trim().toLowerCase() === "true";

const allowedProfiles = new Set(["local-demo", "private-beta", "soft-launch"]);

const getArgValue = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = args.indexOf(name);
  if (index >= 0) {
    return args[index + 1];
  }

  return undefined;
};

const normalizeProfile = (value) => {
  const normalized = (value || "private-beta").trim().toLowerCase();
  if (allowedProfiles.has(normalized)) {
    return normalized;
  }

  return "invalid";
};

const preflightProfile = normalizeProfile(getArgValue("--profile") || process.env.BETA_PREFLIGHT_PROFILE);
const backofficeSharedSecret = (
  process.env.NUUDL_BACKOFFICE_SHARED_SECRET ||
  process.env.BACKOFFICE_SHARED_SECRET ||
  ""
).trim();

const adminHeaders = {
  "x-admin-id": process.env.NUUDL_BACKOFFICE_ID || "owner-root",
  "x-admin-role": process.env.NUUDL_BACKOFFICE_ROLE || "owner",
  ...(backofficeSharedSecret
    ? {
        "x-backoffice-secret": backofficeSharedSecret,
        "x-backoffice-session-id": "preflight-backoffice-session",
      }
    : {}),
};

const failures = [];
const warnings = [];

const isLoopbackUrl = (value) => {
  const url = new URL(value);
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
};

const assertHttpsOrLoopback = (label, value) => {
  const url = new URL(value);
  if (url.protocol !== "https:" && !isLoopbackUrl(value)) {
    failures.push(`${label} must use HTTPS outside local loopback: ${value}`);
  }
};

const request = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json,text/html",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") && text ? JSON.parse(text) : null;

  return {
    body,
    ok: response.ok,
    status: response.status,
    text,
  };
};

const requestJson = async (url, init = {}) => {
  const response = await request(url, init);
  if (!response.ok) {
    throw new Error(`${response.status} ${url} ${response.text}`);
  }

  return response.body;
};

const requestStatus = async (url) => {
  const response = await request(url);
  return response.status;
};

const normalizedText = (value) => (typeof value === "string" ? value.trim() : "");

const main = async () => {
  if (preflightProfile === "invalid") {
    failures.push(
      `Invalid preflight profile. Use one of: ${[...allowedProfiles].sort().join(", ")}.`,
    );
  }

  assertHttpsOrLoopback("NUUDL_API_BASE_URL", apiBaseUrl);
  assertHttpsOrLoopback("NUUDL_CONSUMER_BASE_URL", consumerBaseUrl);
  if (adminBaseUrl) {
    assertHttpsOrLoopback("NUUDL_ADMIN_BASE_URL", adminBaseUrl);
  }

  const apiHealth = await requestJson(`${apiBaseUrl}/health`);
  if (apiHealth?.ok !== true) {
    failures.push("API health did not return ok=true.");
  }

  const consumerRootStatus = await requestStatus(`${consumerBaseUrl}/`);
  if (consumerRootStatus >= 500) {
    failures.push(`Consumer root returned ${consumerRootStatus}.`);
  }
  const consumerRuntime = await request(`${consumerBaseUrl}/api/runtime-config`);
  if (!consumerRuntime.ok) {
    failures.push(`Consumer runtime config returned ${consumerRuntime.status}.`);
  }

  const adminRootStatus = adminBaseUrl ? await requestStatus(`${adminBaseUrl}/`) : null;
  const adminSession = adminBaseUrl ? await request(`${adminBaseUrl}/api/backoffice/admin/backoffice/session`) : null;
  if (adminRootStatus !== null && adminRootStatus >= 500) {
    failures.push(`Admin root returned ${adminRootStatus}.`);
  }
  if (adminSession && !adminSession.ok) {
    failures.push(`Admin backoffice session returned ${adminSession.status}.`);
  }

  const adminOps = await requestJson(`${apiBaseUrl}/admin/ops`, {
    headers: adminHeaders,
  });
  const beta = adminOps?.ops?.beta;
  const rateLimitReadiness = adminOps?.ops?.storage?.persistence?.rateLimit ?? null;
  const uploadsReadiness = adminOps?.ops?.storage?.uploadsDirectory ?? null;
  if (!beta) {
    failures.push("Admin ops response is missing ops.beta readiness.");
  } else {
    beta.checks.forEach((check) => {
      if (check.ok) {
        return;
      }

      if (check.id === "beta-invite-gate" && preflightProfile !== "private-beta") {
        return;
      }

      const message = `${check.label}: ${check.detail}`;
      if (check.severity === "error") {
        failures.push(message);
      } else {
        warnings.push(message);
      }
    });

    if (expectEmpty && beta.mutableRecordCount > 0) {
      failures.push(
        `Expected empty beta state, but found ${beta.mutableRecordCount} mutable records: ${JSON.stringify(
          beta.contentCounts,
        )}`,
      );
    }

    if (consumerRuntime.body?.betaInviteRequired !== beta.env.betaInviteRequired) {
      failures.push(
        `Consumer/API invite gate mismatch: consumer=${String(
          consumerRuntime.body?.betaInviteRequired,
        )}, api=${String(beta.env.betaInviteRequired)}.`,
      );
    }

    if (preflightProfile === "private-beta") {
      if (!beta.env.betaInviteRequired) {
        failures.push("Private beta profile requires BETA_INVITE_REQUIRED=true in the API.");
      }

      if (beta.env.betaInviteCodeCount <= 0) {
        failures.push("Private beta profile requires at least one BETA_INVITE_CODES entry in the API.");
      }

      if (consumerRuntime.body?.betaInviteRequired !== true) {
        failures.push("Private beta profile requires BETA_INVITE_REQUIRED=true in the Consumer.");
      }
    }

    if (preflightProfile === "soft-launch") {
      if (beta.env.betaInviteRequired) {
        failures.push("Soft launch profile requires BETA_INVITE_REQUIRED=false in the API.");
      }

      if (consumerRuntime.body?.betaInviteRequired !== false) {
        failures.push("Soft launch profile requires BETA_INVITE_REQUIRED=false in the Consumer.");
      }
    }

    if (preflightProfile === "local-demo") {
      if (!isLoopbackUrl(apiBaseUrl) || !isLoopbackUrl(consumerBaseUrl)) {
        failures.push("Local demo profile must only be used with loopback API and Consumer URLs.");
      }
    }
  }

  if (!rateLimitReadiness) {
    warnings.push("Admin ops response is missing storage.persistence.rateLimit readiness.");
  } else {
    const rateLimitStatus = String(rateLimitReadiness.status ?? "unknown");
    if (requireRedisRateLimit && rateLimitStatus !== "redis_active") {
      failures.push(
        `Redis-backed rate limits are required for this preflight, but storage.persistence.rateLimit.status=${rateLimitStatus}.`,
      );
    } else if (preflightProfile !== "local-demo" && rateLimitStatus !== "redis_active") {
      warnings.push(
        `Rate limits are not Redis-backed yet (storage.persistence.rateLimit.status=${rateLimitStatus}). This is fine for local/internal checks, but not the final multi-process beta target.`,
      );
    }
  }

  if (!uploadsReadiness) {
    warnings.push("Admin ops response is missing storage.uploadsDirectory readiness.");
  } else {
    const uploadsPublicBaseUrl = normalizedText(uploadsReadiness.publicBaseUrl);
    const uploadsPath = normalizedText(uploadsReadiness.path);
    const uploadsPathSource = normalizedText(uploadsReadiness.pathSource) || "unknown";
    const uploadsUsesDefaultPath = uploadsPathSource === "default";

    if (preflightProfile !== "local-demo" && !isLoopbackUrl(apiBaseUrl) && !uploadsPublicBaseUrl) {
      failures.push(
        "Non-loopback beta deploys require storage.uploadsDirectory.publicBaseUrl. Set API_PUBLIC_BASE_URL so uploaded media resolve to the public HTTPS origin.",
      );
    }

    if (preflightProfile !== "local-demo" && uploadsUsesDefaultPath) {
      warnings.push(
        `Uploads still use the default path (${uploadsPath || "unknown"}). Set API_UPLOADS_DIR consciously and align it with the mounted persistent volume before inviting testers.`,
      );
    }
  }

  if (adminSession?.ok && adminSession.body) {
    if (!adminBaseUrl || isLoopbackUrl(adminBaseUrl)) {
      // loopback is allowed to keep the local dev fallback
    } else if (!["trusted_proxy", "trusted_proxy_session"].includes(String(adminSession.body?.authMode))) {
      failures.push(
        `Admin session must use trusted_proxy or trusted_proxy_session on non-loopback deploys, but authMode=${String(adminSession.body?.authMode)}.`,
      );
    }
  }

  const result = {
    adminSession: adminSession?.body
      ? {
          actor: adminSession.body.actor,
          authMode: adminSession.body.authMode,
          roleLevel: adminSession.body.roleLevel,
        }
      : null,
    adminRootStatus,
    apiHealth,
    beta: beta
      ? {
          contentCounts: beta.contentCounts,
          env: beta.env,
          mutableRecordCount: beta.mutableRecordCount,
          status: beta.status,
        }
      : null,
    consumerRuntime: consumerRuntime.body
      ? {
          betaInviteRequired: consumerRuntime.body.betaInviteRequired,
        }
      : null,
    consumerRootStatus,
    expectEmpty,
    failures,
    profile: preflightProfile,
    rateLimit: rateLimitReadiness
      ? {
          activeBackend: rateLimitReadiness.activeBackend,
          note: rateLimitReadiness.note,
          requestedBackend: rateLimitReadiness.requestedBackend,
        status: rateLimitReadiness.status,
      }
      : null,
    uploads: uploadsReadiness
      ? {
          exists: uploadsReadiness.exists,
          fileCount: uploadsReadiness.fileCount,
          maxUploadBytes: uploadsReadiness.maxUploadBytes,
          path: uploadsReadiness.path,
          pathSource: uploadsReadiness.pathSource,
          publicBaseUrl: uploadsReadiness.publicBaseUrl,
          urlStrategy: uploadsReadiness.urlStrategy,
        }
      : null,
    requireRedisRateLimit,
    warnings,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (failures.length > 0) {
    process.exit(1);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

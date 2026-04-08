const apiBaseUrl = (process.env.NUUDL_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
const consumerBaseUrl = (process.env.NUUDL_CONSUMER_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const adminBaseUrl = (process.env.NUUDL_ADMIN_BASE_URL || "http://localhost:3001").replace(/\/$/, "");

const adminHeaders = {
  "x-admin-id": process.env.NUUDL_BACKOFFICE_ID || "owner-root",
  "x-admin-role": process.env.NUUDL_BACKOFFICE_ROLE || "owner",
};
const smokeClientHeaders = {
  "user-agent": `nuudl-beta-smoke/${Date.now()}`,
  "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 20}`,
};

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnYjV0AAAAASUVORK5CYII=";

const isReusableWriteFailure = (response) =>
  response.status === 429 ||
  response.body?.error?.code === "SPAM_DETECTED" ||
  response.body?.error?.code === "ACTION_TEMPORARILY_BLOCKED";

const request = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

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
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/json",
    },
  });

  return response.status;
};

const main = async () => {
  const apiHealth = await requestJson(`${apiBaseUrl}/health`);
  const consumerRoot = await requestStatus(`${consumerBaseUrl}/`);
  const adminRoot = await requestStatus(`${adminBaseUrl}/`);

  const register = await requestJson(`${apiBaseUrl}/install/register`, {
    body: JSON.stringify({
      adultGateAccepted: true,
      cityId: "city-munich",
    }),
    headers: smokeClientHeaders,
    method: "POST",
  });

  const installToken = register.session.accessToken;
  const installHeaders = {
    authorization: `Bearer ${installToken}`,
    ...smokeClientHeaders,
  };

  await requestJson(`${apiBaseUrl}/admin/security/install-reset`, {
    body: JSON.stringify({
      installIdentityId: register.installIdentity.id,
      note: "Reset for repeatable beta smoke",
    }),
    headers: {
      ...adminHeaders,
      ...smokeClientHeaders,
    },
    method: "POST",
  });

  const upload = await requestJson(`${apiBaseUrl}/media/uploads`, {
    body: JSON.stringify({
      base64: tinyPngBase64,
      contentType: "image/png",
      fileName: "smoke.png",
    }),
    headers: installHeaders,
    method: "POST",
  });

  const postAttempt = await request(`${apiBaseUrl}/posts`, {
    body: JSON.stringify({
      body: "Closed beta smoke post",
      channelId: "channel-main",
      cityId: register.cityContext.id,
      media: [{ kind: "image", url: upload.asset.url }],
      tags: ["smoke"],
    }),
    headers: {
      ...installHeaders,
      "idempotency-key": `smoke-post-${Date.now()}`,
    },
    method: "POST",
  });

  const feed = postAttempt.ok
    ? null
    : isReusableWriteFailure(postAttempt)
      ? await requestJson(`${apiBaseUrl}/feed`, {
          headers: installHeaders,
        })
      : null;

  const post = postAttempt.ok ? postAttempt.body : feed?.posts?.[0];
  if (!post) {
    throw new Error(`post smoke failed: ${postAttempt.text}`);
  }

  const replyAttempt = await request(`${apiBaseUrl}/replies`, {
    body: JSON.stringify({
      body: "Closed beta smoke reply",
      postId: post.id,
    }),
    headers: {
      ...installHeaders,
      "idempotency-key": `smoke-reply-${Date.now()}`,
    },
    method: "POST",
  });

  const postDetail = replyAttempt.ok
    ? null
    : isReusableWriteFailure(replyAttempt)
      ? await requestJson(`${apiBaseUrl}/posts/${post.id}`, {
          headers: installHeaders,
        })
      : null;

  const reply = replyAttempt.ok ? replyAttempt.body : postDetail?.replies?.[0];
  if (!reply) {
    throw new Error(`reply smoke failed: ${replyAttempt.text}`);
  }

  const report = await requestJson(`${apiBaseUrl}/reports`, {
    body: JSON.stringify({
      reason: "Closed beta smoke report",
      targetId: post.id,
      targetType: "post",
    }),
    headers: {
      ...installHeaders,
      "idempotency-key": `smoke-report-${Date.now()}`,
    },
    method: "POST",
  });

  const adminOverview = await requestJson(`${apiBaseUrl}/admin/overview`, {
    headers: {
      ...adminHeaders,
      ...smokeClientHeaders,
    },
  });
  const adminSecurity = await requestJson(`${apiBaseUrl}/admin/security`, {
    headers: {
      ...adminHeaders,
      ...smokeClientHeaders,
    },
  });
  const adminOps = await requestJson(`${apiBaseUrl}/admin/ops`, {
    headers: {
      ...adminHeaders,
      ...smokeClientHeaders,
    },
  });

  const result = {
    adminOpsSnapshotExists: adminOps.ops.storage.snapshotFile.exists,
    adminRoot,
    adminSecurityEvents: adminSecurity.counts.abuseEvents,
    apiHealth,
    consumerRoot,
    installIdentityId: register.installIdentity.id,
    postMode: postAttempt.ok ? "created" : "reused-latest",
    postId: post.id,
    replyMode: replyAttempt.ok ? "created" : "reused-latest",
    replyId: reply.id,
    reportId: report.report.id,
    uploadsStored: adminOps.ops.storage.uploadsDirectory.fileCount,
    viewerWallet: adminOverview.wallet.availableCents,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { registerRoutes } from "../src/routes.ts";
import {
  authenticateInstallSession,
  createInMemoryStoreForTests,
  issueInstallSession,
  rotateInstallRefreshToken,
  type ApiStore,
  type SessionTokenBundle,
} from "../src/store.ts";

type TestContext = {
  app: FastifyInstance;
  store: ApiStore;
};

const buildTestContext = async (): Promise<TestContext> => {
  const app = Fastify({ logger: false });
  const store = createInMemoryStoreForTests();
  await registerRoutes(app, store);
  await app.ready();
  return { app, store };
};

const closeTestContext = async ({ app }: TestContext) => {
  await app.close();
};

const sessionRecordFor = (store: ApiStore, bundle: SessionTokenBundle) => {
  const session = store.installSessions.find((entry) => entry.id === bundle.sessionId);
  assert.ok(session, `expected session ${bundle.sessionId} to exist`);
  return session;
};

describe("install session and refresh-token hardening", () => {
  test("refresh rotation replaces the access token and marks the previous refresh token used", () => {
    const store = createInMemoryStoreForTests();
    const installIdentityId = store.installIdentity.id;
    const initial = issueInstallSession(store, installIdentityId);

    const rotated = rotateInstallRefreshToken(store, initial.refreshToken);
    assert.equal(rotated.sessionId, initial.sessionId);
    assert.notEqual(rotated.accessToken, initial.accessToken);
    assert.notEqual(rotated.refreshToken, initial.refreshToken);
    assert.equal(authenticateInstallSession(store, initial.accessToken), null);
    assert.equal(authenticateInstallSession(store, rotated.accessToken)?.id, initial.sessionId);

    const previousRefreshToken = store.refreshTokens.find((entry) => entry.replacedByTokenId);
    assert.ok(previousRefreshToken);
    assert.ok(previousRefreshToken.usedAt);
    assert.equal(previousRefreshToken.installSessionId, initial.sessionId);
  });

  test("reusing an old refresh token resets the token family and records abuse context", async () => {
    const context = await buildTestContext();
    try {
      const installIdentityId = context.store.installIdentity.id;
      const initial = issueInstallSession(context.store, installIdentityId);
      const firstRefreshResponse = await context.app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: {
          refreshToken: initial.refreshToken,
        },
      });
      assert.equal(firstRefreshResponse.statusCode, 200);
      const firstRefreshBody = firstRefreshResponse.json();
      assert.equal(firstRefreshBody.session.sessionId, initial.sessionId);

      const reuseResponse = await context.app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: {
          refreshToken: initial.refreshToken,
        },
      });
      assert.equal(reuseResponse.statusCode, 401);

      const session = sessionRecordFor(context.store, initial);
      assert.equal(session.status, "revoked");
      assert.equal(session.revocationReason, "refresh_reuse");

      const familyTokens = context.store.refreshTokens.filter((entry) => entry.tokenFamilyId === session.tokenFamilyId);
      assert.ok(familyTokens.length >= 2);
      assert.ok(familyTokens.every((entry) => entry.revokedAt));
      assert.ok(familyTokens.every((entry) => entry.revocationReason === "refresh_reuse"));
      assert.equal(context.store.abuseEvents[0]?.kind, "refresh_reuse_detected");
      assert.equal(context.store.deviceRiskState[installIdentityId]?.score, 20);
    } finally {
      await closeTestContext(context);
    }
  });

  test("session limits revoke the oldest non-current token family and keep the newest sessions active", async () => {
    const context = await buildTestContext();
    try {
      const installIdentityId = context.store.installIdentity.id;
      const first = issueInstallSession(context.store, installIdentityId);
      sessionRecordFor(context.store, first).lastSeenAt = "2026-04-16T08:00:00.000Z";
      const second = issueInstallSession(context.store, installIdentityId);
      sessionRecordFor(context.store, second).lastSeenAt = "2026-04-16T08:05:00.000Z";
      const third = issueInstallSession(context.store, installIdentityId);
      sessionRecordFor(context.store, third).lastSeenAt = "2026-04-16T08:10:00.000Z";
      const fourth = issueInstallSession(context.store, installIdentityId);

      const firstSession = sessionRecordFor(context.store, first);
      const fourthSession = sessionRecordFor(context.store, fourth);
      const activeSessions = context.store.installSessions.filter(
        (entry) => entry.installIdentityId === installIdentityId && entry.status === "active",
      );

      assert.equal(activeSessions.length, 3);
      assert.equal(firstSession.status, "revoked");
      assert.equal(firstSession.revocationReason, "session_limit");
      assert.equal(fourthSession.status, "active");

      const limitedRefreshResponse = await context.app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: {
          refreshToken: first.refreshToken,
        },
      });
      assert.equal(limitedRefreshResponse.statusCode, 401);
      assert.equal(authenticateInstallSession(context.store, fourth.accessToken)?.id, fourth.sessionId);
    } finally {
      await closeTestContext(context);
    }
  });
});

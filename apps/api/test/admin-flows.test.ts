import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { registerRoutes } from "../src/routes.ts";
import {
  createInMemoryStoreForTests,
  issueInstallSession,
  recoverBackofficeOwner,
  type ApiStore,
  type BackofficeRole,
} from "../src/store.ts";

type TestContext = {
  app: FastifyInstance;
  store: ApiStore;
};

const adminHeaders = (role: BackofficeRole, id = `test-${role}`) => ({
  "x-admin-id": id,
  "x-admin-role": role,
});

const installHeaders = (accessToken: string) => ({
  authorization: `Bearer ${accessToken}`,
});

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

describe("admin and moderator flows", () => {
  test("moderator session is readable but admin-only sections stay protected", async () => {
    const context = await buildTestContext();
    try {
      const sessionResponse = await context.app.inject({
        method: "GET",
        url: "/admin/backoffice/session",
        headers: adminHeaders("moderator"),
      });
      assert.equal(sessionResponse.statusCode, 200);
      const sessionBody = sessionResponse.json();
      assert.equal(sessionBody.authMode, "loopback_dev_headers");
      assert.equal(sessionBody.actor.role, "moderator");
      assert.equal(sessionBody.user.id, "test-moderator");
      assert.equal(sessionBody.user.role, "moderator");
      assert.equal(sessionBody.session.status, "active");
      assert.deepEqual(sessionBody.permissions.sections, ["dashboard", "reports", "moderation", "audit"]);

      const channelsResponse = await context.app.inject({
        method: "GET",
        url: "/admin/channels",
        headers: adminHeaders("moderator"),
      });
      assert.equal(channelsResponse.statusCode, 403);

      const creatorResponse = await context.app.inject({
        method: "GET",
        url: "/admin/creator-applications",
        headers: adminHeaders("moderator"),
      });
      assert.equal(creatorResponse.statusCode, 403);
    } finally {
      await closeTestContext(context);
    }
  });

  test("configured backoffice shared secret is required for trusted operator sessions", async () => {
    const context = await buildTestContext();
    const previousSharedSecret = process.env.BACKOFFICE_SHARED_SECRET;

    process.env.BACKOFFICE_SHARED_SECRET = "test-backoffice-secret";

    try {
      const missingSecretResponse = await context.app.inject({
        method: "GET",
        url: "/admin/backoffice/session",
        headers: adminHeaders("admin", "trusted-admin"),
      });
      assert.equal(missingSecretResponse.statusCode, 401);

      const trustedSessionResponse = await context.app.inject({
        method: "GET",
        url: "/admin/backoffice/session",
        headers: {
          ...adminHeaders("admin", "trusted-admin"),
          "x-backoffice-secret": "test-backoffice-secret",
          "x-backoffice-session-id": "trusted-proxy-session-001",
        },
      });
      assert.equal(trustedSessionResponse.statusCode, 200);
      const trustedSessionBody = trustedSessionResponse.json();
      assert.equal(trustedSessionBody.actor.authMode, "trusted_proxy_session");
      assert.equal(trustedSessionBody.actor.id, "trusted-admin");
      assert.equal(trustedSessionBody.actor.role, "admin");
      assert.equal(trustedSessionBody.user.id, "trusted-admin");
      assert.equal(trustedSessionBody.session.id, "trusted-proxy-session-001");
      assert.equal(context.store.backofficeUsers[0]?.id, "trusted-admin");
      assert.equal(context.store.backofficeSessions[0]?.id, "trusted-proxy-session-001");
    } finally {
      if (previousSharedSecret === undefined) {
        delete process.env.BACKOFFICE_SHARED_SECRET;
      } else {
        process.env.BACKOFFICE_SHARED_SECRET = previousSharedSecret;
      }
      await closeTestContext(context);
    }
  });

  test("owner can manage backoffice users and stored roles cannot be elevated by headers", async () => {
    const context = await buildTestContext();
    try {
      const managedAdminSession = await context.app.inject({
        method: "GET",
        url: "/admin/backoffice/session",
        headers: adminHeaders("admin", "managed-admin"),
      });
      assert.equal(managedAdminSession.statusCode, 200);

      const ownerListResponse = await context.app.inject({
        method: "GET",
        url: "/admin/backoffice/users",
        headers: adminHeaders("owner", "owner-root"),
      });
      assert.equal(ownerListResponse.statusCode, 200);
      const ownerListBody = ownerListResponse.json();
      assert.ok(ownerListBody.users.some((user: { id: string; role: BackofficeRole }) => user.id === "managed-admin" && user.role === "admin"));
      assert.ok(ownerListBody.users.some((user: { id: string; role: BackofficeRole }) => user.id === "owner-root" && user.role === "owner"));

      const downgradeResponse = await context.app.inject({
        method: "PATCH",
        url: "/admin/backoffice/users/managed-admin",
        headers: adminHeaders("owner", "owner-root"),
        payload: {
          note: "Regression downgrade",
          role: "moderator",
        },
      });
      assert.equal(downgradeResponse.statusCode, 200);
      const downgradeBody = downgradeResponse.json();
      assert.equal(downgradeBody.user.role, "moderator");
      assert.equal(context.store.backofficeUsers.find((user) => user.id === "managed-admin")?.role, "moderator");
      assert.equal(context.store.auditLogs[0]?.action, "backoffice_user.update");
      assert.equal(context.store.backofficeActions[0]?.metadata.targetBackofficeUserId, "managed-admin");

      const spoofedAdminRouteResponse = await context.app.inject({
        method: "GET",
        url: "/admin/channels",
        headers: adminHeaders("owner", "managed-admin"),
      });
      assert.equal(spoofedAdminRouteResponse.statusCode, 403);

      const moderatorRouteResponse = await context.app.inject({
        method: "GET",
        url: "/admin/reports",
        headers: adminHeaders("owner", "managed-admin"),
      });
      assert.equal(moderatorRouteResponse.statusCode, 200);
      assert.equal(moderatorRouteResponse.json().actor.role, "moderator");
    } finally {
      await closeTestContext(context);
    }
  });

  test("owner disables revoke sessions and owner self-lockout is blocked", async () => {
    const context = await buildTestContext();
    try {
      const targetHeaders = {
        ...adminHeaders("admin", "target-admin"),
        "x-backoffice-session-id": "target-admin-session-001",
      };
      const targetSessionResponse = await context.app.inject({
        method: "GET",
        url: "/admin/backoffice/session",
        headers: targetHeaders,
      });
      assert.equal(targetSessionResponse.statusCode, 200);

      const ownerHeaders = adminHeaders("owner", "owner-root");
      const selfDisableResponse = await context.app.inject({
        method: "PATCH",
        url: "/admin/backoffice/users/owner-root",
        headers: ownerHeaders,
        payload: {
          disabled: true,
          note: "should be denied",
        },
      });
      assert.equal(selfDisableResponse.statusCode, 409);

      const disableResponse = await context.app.inject({
        method: "PATCH",
        url: "/admin/backoffice/users/target-admin",
        headers: ownerHeaders,
        payload: {
          disabled: true,
          note: "Disable regression operator",
        },
      });
      assert.equal(disableResponse.statusCode, 200);
      const disableBody = disableResponse.json();
      assert.equal(disableBody.user.status, "disabled");
      assert.equal(disableBody.revokedSessions.length, 1);
      assert.equal(disableBody.revokedSessions[0]?.id, "target-admin-session-001");
      assert.equal(context.store.backofficeSessions.find((session) => session.id === "target-admin-session-001")?.status, "revoked");

      const disabledSessionResponse = await context.app.inject({
        method: "GET",
        url: "/admin/backoffice/session",
        headers: targetHeaders,
      });
      assert.equal(disabledSessionResponse.statusCode, 403);
    } finally {
      await closeTestContext(context);
    }
  });

  test("break-glass recovery restores an owner and resets stale backoffice sessions", () => {
    const store = createInMemoryStoreForTests();
    const now = "2026-04-24T10:00:00.000Z";
    store.backofficeUsers = [
      {
        id: "owner-root",
        role: "admin",
        displayName: "Owner Root",
        disabledAt: "2026-04-24T09:00:00.000Z",
        createdAt: "2026-04-24T08:00:00.000Z",
        lastSeenAt: "2026-04-24T09:00:00.000Z",
      },
    ];
    store.backofficeSessions = [
      {
        id: "stale-owner-session",
        backofficeUserId: "owner-root",
        roleAtIssue: "owner",
        authMode: "trusted_proxy_session",
        status: "revoked",
        createdAt: "2026-04-24T08:30:00.000Z",
        lastSeenAt: "2026-04-24T09:00:00.000Z",
        revokedAt: "2026-04-24T09:00:00.000Z",
        revocationReason: "manual-disable",
      },
    ];

    const result = recoverBackofficeOwner(store, {
      actorId: "break-glass-test",
      ownerId: "owner-root",
      reason: "Regression recovery",
      now,
    });

    assert.equal(result.action, "updated");
    assert.equal(result.activeOwnerCountBefore, 0);
    assert.equal(result.activeOwnerCountAfter, 1);
    assert.equal(result.removedSessions.length, 1);
    assert.equal(store.backofficeUsers[0]?.id, "owner-root");
    assert.equal(store.backofficeUsers[0]?.role, "owner");
    assert.equal(store.backofficeUsers[0]?.disabledAt, undefined);
    assert.equal(store.backofficeUsers[0]?.lastSeenAt, now);
    assert.equal(store.backofficeSessions.length, 0);
    assert.equal(store.auditLogs[0]?.action, "backoffice_owner.break_glass_recover");
    assert.equal(store.backofficeActions[0]?.metadata.removedSessionCount, 1);
  });

  test("break-glass recovery can create the first owner without touching other sessions", () => {
    const store = createInMemoryStoreForTests();
    store.backofficeUsers = [];
    store.backofficeSessions = [
      {
        id: "other-session",
        backofficeUserId: "moderator-one",
        roleAtIssue: "moderator",
        authMode: "trusted_proxy_session",
        status: "active",
        createdAt: "2026-04-24T08:30:00.000Z",
        lastSeenAt: "2026-04-24T09:00:00.000Z",
      },
    ];

    const result = recoverBackofficeOwner(store, {
      actorId: "break-glass-test",
      displayName: "Recovered Owner",
      ownerId: "owner-new",
      reason: "Create first owner",
      resetSessions: false,
    });

    assert.equal(result.action, "created");
    assert.equal(result.activeOwnerCountBefore, 0);
    assert.equal(result.activeOwnerCountAfter, 1);
    assert.equal(result.removedSessions.length, 0);
    assert.equal(store.backofficeUsers[0]?.id, "owner-new");
    assert.equal(store.backofficeUsers[0]?.role, "owner");
    assert.equal(store.backofficeUsers[0]?.displayName, "Recovered Owner");
    assert.equal(store.backofficeSessions.length, 1);
  });

  test("moderator reports include content previews and moderation writes audit trails", async () => {
    const context = await buildTestContext();
    try {
      const post = context.store.posts[0];
      assert.ok(post, "seed store needs at least one post");
      const createdAt = new Date().toISOString();
      const caseId = "test-case-content-preview";

      context.store.moderationCases.unshift({
        id: caseId,
        cityId: post.cityId,
        targetType: "post",
        targetId: post.id,
        reason: "test report",
        status: "open",
        createdAt,
      });
      context.store.reports.unshift({
        id: "test-report-content-preview",
        reporterInstallIdentityId: context.store.installIdentity.id,
        cityId: post.cityId,
        targetType: "post",
        targetId: post.id,
        reason: "test report",
        moderationCaseId: caseId,
        status: "open",
        createdAt,
        updatedAt: createdAt,
      });

      const reportsResponse = await context.app.inject({
        method: "GET",
        url: "/admin/reports",
        headers: adminHeaders("moderator"),
      });
      assert.equal(reportsResponse.statusCode, 200);
      const reportsBody = reportsResponse.json();
      const reportItem = reportsBody.reportItems.find(
        (item: { report: { id: string } }) => item.report.id === "test-report-content-preview",
      );
      assert.ok(reportItem, "expected injected report to be returned");
      assert.equal(reportItem.targetPreview.targetId, post.id);
      assert.equal(reportItem.targetPreview.body, post.body);
      assert.equal(reportItem.targetPreview.title, "Gemeldeter Beitrag");

      const actionResponse = await context.app.inject({
        method: "POST",
        url: "/admin/moderation/actions",
        headers: {
          ...adminHeaders("moderator", "mod-content-review"),
          "x-backoffice-session-id": "moderation-session-001",
        },
        payload: {
          action: "block",
          caseId,
          note: "Regression test block",
        },
      });
      assert.equal(actionResponse.statusCode, 200);
      const actionBody = actionResponse.json();
      assert.equal(actionBody.caseItem.status, "actioned");
      assert.equal(context.store.posts.find((entry) => entry.id === post.id)?.moderation, "blocked");
      assert.equal(context.store.reports.find((entry) => entry.id === "test-report-content-preview")?.status, "actioned");
      assert.equal(context.store.auditLogs[0]?.action, "moderation.block");
      assert.equal(context.store.backofficeActions[0]?.action, "moderation.block");
      assert.equal(context.store.backofficeActions[0]?.actorRole, "moderator");
      assert.equal(context.store.auditLogs[0]?.metadata.backofficeUserId, "mod-content-review");
      assert.equal(context.store.auditLogs[0]?.metadata.backofficeSessionId, "moderation-session-001");
      assert.equal(context.store.auditLogs[0]?.metadata.authMode, "loopback_dev_headers");
      assert.equal(context.store.backofficeActions[0]?.metadata.backofficeSessionId, "moderation-session-001");
    } finally {
      await closeTestContext(context);
    }
  });

  test("admin audit logs resolve account and install context from entities", async () => {
    const context = await buildTestContext();
    try {
      const install = context.store.installIdentity;
      const initialSession = issueInstallSession(context.store, install.id);
      const authHeaders = installHeaders(initialSession.accessToken);
      const email = "audit-context@example.test";
      const username = "auditcontext";

      const startResponse = await context.app.inject({
        method: "POST",
        url: "/auth/email/start",
        headers: authHeaders,
        payload: {
          displayName: "Audit Context",
          email,
          username,
        },
      });
      assert.equal(startResponse.statusCode, 200);
      const startBody = startResponse.json();
      assert.equal(startBody.deliveryMode, "stub");
      assert.ok(startBody.codePreview);

      const verifyResponse = await context.app.inject({
        method: "POST",
        url: "/auth/email/verify",
        headers: authHeaders,
        payload: {
          code: startBody.codePreview,
          displayName: "Audit Context",
          email,
          username,
        },
      });
      assert.equal(verifyResponse.statusCode, 200);
      const verifyBody = verifyResponse.json();
      const accountId = verifyBody.account.id;
      const accountHeaders = installHeaders(verifyBody.session.accessToken);

      const postResponse = await context.app.inject({
        method: "POST",
        url: "/posts",
        headers: accountHeaders,
        payload: {
          body: "Audit context post",
          channelId: context.store.channels[0]?.id ?? null,
          cityId: install.cityId,
        },
      });
      assert.equal(postResponse.statusCode, 201);
      const postBody = postResponse.json();

      const reportResponse = await context.app.inject({
        method: "POST",
        url: "/reports",
        headers: accountHeaders,
        payload: {
          reason: "Audit context report",
          targetId: postBody.id,
          targetType: "post",
        },
      });
      assert.equal(reportResponse.statusCode, 201);
      const reportBody = reportResponse.json();

      const auditResponse = await context.app.inject({
        method: "GET",
        url: "/admin/audit-logs",
        headers: adminHeaders("moderator"),
      });
      assert.equal(auditResponse.statusCode, 200);
      const auditBody = auditResponse.json();

      const accountLinkEntry = auditBody.auditLogs.find((entry: { action: string }) => entry.action === "account.link");
      assert.ok(accountLinkEntry, "expected account link audit entry");
      assert.equal(accountLinkEntry.targetContext.accountId, accountId);
      assert.equal(accountLinkEntry.targetContext.accountUsername, username);

      const postCreateEntry = auditBody.auditLogs.find((entry: { entityId: string }) => entry.entityId === postBody.id);
      assert.ok(postCreateEntry, "expected post create audit entry");
      assert.equal(postCreateEntry.targetContext.accountId, accountId);
      assert.equal(postCreateEntry.targetContext.installIdentityId, install.id);

      const reportEntry = auditBody.auditLogs.find((entry: { entityId: string }) => entry.entityId === reportBody.report.id);
      assert.ok(reportEntry, "expected report create audit entry");
      assert.equal(reportEntry.targetContext.accountId, accountId);
      assert.equal(reportEntry.targetContext.installIdentityId, install.id);

      const filteredAuditResponse = await context.app.inject({
        method: "GET",
        url: `/admin/audit-logs?accountId=${encodeURIComponent(accountId)}&installIdentityId=${encodeURIComponent(
          install.id,
        )}&entityId=${encodeURIComponent(postBody.id)}&q=${encodeURIComponent(username)}`,
        headers: adminHeaders("moderator"),
      });
      assert.equal(filteredAuditResponse.statusCode, 200);
      const filteredAuditBody = filteredAuditResponse.json();
      assert.equal(filteredAuditBody.auditLogs.length, 1);
      assert.equal(filteredAuditBody.auditLogs[0]?.entityId, postBody.id);
      assert.equal(filteredAuditBody.auditLogs[0]?.targetContext.accountUsername, username);
      assert.equal(filteredAuditBody.backofficeActions.length, 0);
    } finally {
      await closeTestContext(context);
    }
  });

  test("admin audit route supports server filters and moderators stay capped to recent entries", async () => {
    const context = await buildTestContext();
    try {
      const channel = context.store.channels[0];
      assert.ok(channel, "seed store needs at least one channel");

      for (let index = 0; index < 9; index += 1) {
        const response = await context.app.inject({
          method: "PATCH",
          url: `/admin/channels/${channel.id}`,
          headers: adminHeaders("admin", "admin-audit-filter"),
          payload: {
            title: `Audit Filter ${index}`,
          },
        });
        assert.equal(response.statusCode, 200);
      }

      const needleTitle = "Unique Audit Filter Needle";
      const finalUpdateResponse = await context.app.inject({
        method: "PATCH",
        url: `/admin/channels/${channel.id}`,
        headers: adminHeaders("admin", "admin-audit-filter"),
        payload: {
          title: needleTitle,
        },
      });
      assert.equal(finalUpdateResponse.statusCode, 200);

      const adminAuditResponse = await context.app.inject({
        method: "GET",
        url: `/admin/audit-logs?entityType=channel&entityId=${encodeURIComponent(channel.id)}&action=channel.update&actorRole=admin&limit=20`,
        headers: adminHeaders("admin"),
      });
      assert.equal(adminAuditResponse.statusCode, 200);
      const adminAuditBody = adminAuditResponse.json();
      assert.equal(adminAuditBody.auditLogs.length, 10);
      assert.equal(adminAuditBody.backofficeActions.length, 10);

      const searchAuditResponse = await context.app.inject({
        method: "GET",
        url: `/admin/audit-logs?entityType=channel&entityId=${encodeURIComponent(channel.id)}&action=channel.update&actorRole=admin&q=${encodeURIComponent(needleTitle)}`,
        headers: adminHeaders("admin"),
      });
      assert.equal(searchAuditResponse.statusCode, 200);
      const searchAuditBody = searchAuditResponse.json();
      assert.equal(searchAuditBody.auditLogs.length, 1);
      assert.equal(searchAuditBody.backofficeActions.length, 1);
      assert.equal(searchAuditBody.auditLogs[0]?.entityId, channel.id);
      assert.equal(searchAuditBody.backofficeActions[0]?.entityId, channel.id);

      const moderatorAuditResponse = await context.app.inject({
        method: "GET",
        url: `/admin/audit-logs?entityType=channel&entityId=${encodeURIComponent(channel.id)}&action=channel.update&actorRole=admin&limit=20`,
        headers: adminHeaders("moderator"),
      });
      assert.equal(moderatorAuditResponse.statusCode, 200);
      const moderatorAuditBody = moderatorAuditResponse.json();
      assert.equal(moderatorAuditBody.auditLogs.length, 8);
      assert.equal(moderatorAuditBody.backofficeActions.length, 8);
    } finally {
      await closeTestContext(context);
    }
  });

  test("manual restrictions require admin and install security reset requires owner", async () => {
    const context = await buildTestContext();
    try {
      const installIdentityId = context.store.installIdentity.id;

      const moderatorApplyResponse = await context.app.inject({
        method: "POST",
        url: "/admin/security/restrictions",
        headers: adminHeaders("moderator"),
        payload: {
          action: "apply",
          installIdentityId,
          type: "read_only",
          note: "should be denied",
        },
      });
      assert.equal(moderatorApplyResponse.statusCode, 403);

      const adminApplyResponse = await context.app.inject({
        method: "POST",
        url: "/admin/security/restrictions",
        headers: adminHeaders("admin", "admin-security"),
        payload: {
          action: "apply",
          durationMinutes: 30,
          installIdentityId,
          type: "read_only",
          note: "manual regression restriction",
        },
      });
      assert.equal(adminApplyResponse.statusCode, 200);
      assert.equal(context.store.installRestrictions.length, 1);
      assert.equal(context.store.auditLogs[0]?.action, "security.restriction.apply");
      assert.equal(context.store.backofficeActions[0]?.actorRole, "admin");

      const adminResetResponse = await context.app.inject({
        method: "POST",
        url: "/admin/security/install-reset",
        headers: adminHeaders("admin", "admin-security"),
        payload: {
          installIdentityId,
          note: "should be owner only",
        },
      });
      assert.equal(adminResetResponse.statusCode, 403);

      const ownerResetResponse = await context.app.inject({
        method: "POST",
        url: "/admin/security/install-reset",
        headers: adminHeaders("owner", "owner-security"),
        payload: {
          installIdentityId,
          note: "clear regression restriction",
        },
      });
      assert.equal(ownerResetResponse.statusCode, 200);
      const ownerResetBody = ownerResetResponse.json();
      assert.equal(ownerResetBody.clearedRestrictions, 1);
      assert.equal(
        context.store.installRestrictions.filter((entry) => Date.parse(entry.endsAt) > Date.now()).length,
        0,
      );
      assert.equal(context.store.auditLogs[0]?.action, "security.install.reset");
    } finally {
      await closeTestContext(context);
    }
  });

  test("creator review and payout are admin-only and leave finance audit records", async () => {
    const context = await buildTestContext();
    try {
      const application = context.store.creatorApplication;
      application.status = "submitted";
      application.kycState = "pending";
      application.payoutState = "not_ready";
      application.submittedAt = new Date().toISOString();
      const payoutCountBefore = context.store.payouts.length;

      context.store.wallets[application.installIdentityId] = {
        currency: "EUR",
        availableCents: 0,
        pendingCents: 2500,
        lifetimeTippedCents: 0,
        lifetimeEarnedCents: 2500,
        lifetimePaidOutCents: 0,
      };

      const moderatorApprovalResponse = await context.app.inject({
        method: "POST",
        url: "/admin/creator-approvals",
        headers: adminHeaders("moderator"),
        payload: {
          action: "approve",
          applicationId: application.id,
          note: "should be denied",
        },
      });
      assert.equal(moderatorApprovalResponse.statusCode, 403);

      const approvalResponse = await context.app.inject({
        method: "POST",
        url: "/admin/creator-approvals",
        headers: adminHeaders("admin", "admin-creator"),
        payload: {
          action: "approve",
          applicationId: application.id,
          note: "approved in regression test",
        },
      });
      assert.equal(approvalResponse.statusCode, 200);
      const approvalBody = approvalResponse.json();
      assert.equal(approvalBody.application.status, "approved");
      assert.equal(approvalBody.application.kycState, "verified");
      assert.equal(approvalBody.application.payoutState, "ready");
      assert.equal(context.store.creatorReviews[0]?.decision, "approve");
      assert.equal(context.store.auditLogs[0]?.action, "creator.approve");

      const moderatorPayoutResponse = await context.app.inject({
        method: "POST",
        url: "/admin/payouts",
        headers: adminHeaders("moderator"),
        payload: {
          amountCents: 1200,
          applicationId: application.id,
        },
      });
      assert.equal(moderatorPayoutResponse.statusCode, 403);

      const payoutResponse = await context.app.inject({
        method: "POST",
        url: "/admin/payouts",
        headers: adminHeaders("admin", "admin-finance"),
        payload: {
          amountCents: 1200,
          applicationId: application.id,
        },
      });
      assert.equal(payoutResponse.statusCode, 201);
      const payoutBody = payoutResponse.json();
      assert.equal(payoutBody.payout.status, "paid");
      assert.equal(payoutBody.entry.kind, "payout");
      assert.equal(payoutBody.wallet.pendingCents, 1300);
      assert.equal(payoutBody.wallet.lifetimePaidOutCents, 1200);
      assert.equal(context.store.payouts.length, payoutCountBefore + 1);
      assert.equal(context.store.payouts[0]?.id, payoutBody.payout.id);
      assert.ok(context.store.payoutAccounts.some((entry) => entry.id === payoutBody.payoutAccount.id));
      assert.equal(context.store.auditLogs[0]?.action, "payout.create");
      assert.equal(context.store.backofficeActions[0]?.action, "payout.create");
    } finally {
      await closeTestContext(context);
    }
  });
});

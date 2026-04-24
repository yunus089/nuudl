import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Fastify, { type FastifyInstance } from "fastify";
import { registerRoutes } from "../src/routes.ts";
import {
  createInMemoryStoreForTests,
  ensureInstallIdentity,
  getWallet,
  issueInstallSession,
  type ApiStore,
  type SessionTokenBundle,
} from "../src/store.ts";

type TestContext = {
  app: FastifyInstance;
  store: ApiStore;
};

type AccountLoginResult = {
  account: {
    id: string;
    username: string;
  };
  session: SessionTokenBundle;
};

const authHeaders = (session: SessionTokenBundle) => ({
  authorization: `Bearer ${session.accessToken}`,
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

const linkInstallWithEmail = async (
  context: TestContext,
  session: SessionTokenBundle,
  params: {
    displayName?: string;
    email: string;
    username: string;
  },
) => {
  const startResponse = await context.app.inject({
    method: "POST",
    url: "/auth/email/start",
    headers: authHeaders(session),
    payload: params,
  });
  assert.equal(startResponse.statusCode, 200);
  const startBody = startResponse.json();
  const code = startBody.codePreview ?? context.store.accountLoginCodes[0]?.code;
  assert.ok(code, "expected login code preview or stored test code");

  const verifyResponse = await context.app.inject({
    method: "POST",
    url: "/auth/email/verify",
    headers: authHeaders(session),
    payload: {
      ...params,
      code,
    },
  });
  assert.equal(verifyResponse.statusCode, 200);
  return verifyResponse.json() as AccountLoginResult;
};

describe("account ownership flows", () => {
  test("wallet, notifications and channel preferences follow the account across installs", async () => {
    const context = await buildTestContext();
    try {
      const primaryInstall = context.store.installIdentity;
      const secondInstall = ensureInstallIdentity(context.store, "install-account-second-device");
      const primarySession = issueInstallSession(context.store, primaryInstall.id);
      const secondSession = issueInstallSession(context.store, secondInstall.id);
      const cityId = primaryInstall.cityId;
      const cityChannels = context.store.channels.filter((channel) => channel.cityId === cityId);
      assert.ok(cityChannels.length >= 2, "seed store needs at least two city channels");

      getWallet(context.store, primaryInstall.id).availableCents = 4200;
      context.store.notifications.unshift({
        id: "test-account-install-notification",
        installIdentityId: primaryInstall.id,
        kind: "system",
        message: "Install notification should become account-wide.",
        createdAt: new Date().toISOString(),
        read: false,
        targetRoute: "/me",
      });

      const primaryLogin = await linkInstallWithEmail(context, primarySession, {
        displayName: "Multi Device",
        email: "multi-device@example.test",
        username: "multidevice",
      });

      const primaryWalletResponse = await context.app.inject({
        method: "GET",
        url: "/wallet",
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(primaryWalletResponse.statusCode, 200);
      assert.equal(primaryWalletResponse.json().wallet.availableCents, 4200);
      assert.equal(getWallet(context.store, primaryInstall.id).availableCents, 0);

      const secondLogin = await linkInstallWithEmail(context, secondSession, {
        displayName: "Multi Device",
        email: "multi-device@example.test",
        username: "multidevice",
      });
      assert.equal(secondLogin.account.id, primaryLogin.account.id);

      const secondWalletResponse = await context.app.inject({
        method: "GET",
        url: "/wallet",
        headers: authHeaders(secondLogin.session),
      });
      assert.equal(secondWalletResponse.statusCode, 200);
      assert.equal(secondWalletResponse.json().wallet.availableCents, 4200);

      const preferencePatch = {
        cityId,
        favoriteChannelIds: [cityChannels[0].id],
        joinedChannelIds: [cityChannels[1].id],
        recentChannelIds: [cityChannels[1].id, cityChannels[0].id],
      };
      const patchResponse = await context.app.inject({
        method: "PATCH",
        url: "/account/channel-preferences",
        headers: authHeaders(secondLogin.session),
        payload: preferencePatch,
      });
      assert.equal(patchResponse.statusCode, 200);

      const primaryPreferencesResponse = await context.app.inject({
        method: "GET",
        url: `/account/channel-preferences?cityId=${cityId}`,
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(primaryPreferencesResponse.statusCode, 200);
      assert.deepEqual(primaryPreferencesResponse.json().preferences.favoriteChannelIds, preferencePatch.favoriteChannelIds);
      assert.deepEqual(primaryPreferencesResponse.json().preferences.joinedChannelIds, preferencePatch.joinedChannelIds);

      const notificationsResponse = await context.app.inject({
        method: "GET",
        url: "/notifications",
        headers: authHeaders(secondLogin.session),
      });
      assert.equal(notificationsResponse.statusCode, 200);
      assert.ok(
        notificationsResponse
          .json()
          .notifications.some((notification: { id: string }) => notification.id === "test-account-install-notification"),
        "second linked install should see the migrated account notification",
      );
    } finally {
      await closeTestContext(context);
    }
  });

  test("chat requests and messages stay visible when the requested account switches devices", async () => {
    const context = await buildTestContext();
    try {
      const primaryInstall = context.store.installIdentity;
      const secondInstall = ensureInstallIdentity(context.store, "install-chat-second-device");
      const strangerInstall = ensureInstallIdentity(context.store, "install-chat-stranger");
      const primarySession = issueInstallSession(context.store, primaryInstall.id);
      const secondSession = issueInstallSession(context.store, secondInstall.id);
      const strangerSession = issueInstallSession(context.store, strangerInstall.id);

      const primaryLogin = await linkInstallWithEmail(context, primarySession, {
        displayName: "Chat Owner",
        email: "chat-owner@example.test",
        username: "chatowner",
      });
      const secondLogin = await linkInstallWithEmail(context, secondSession, {
        displayName: "Chat Owner",
        email: "chat-owner@example.test",
        username: "chatowner",
      });
      assert.equal(secondLogin.account.id, primaryLogin.account.id);

      const post = context.store.posts[0];
      assert.ok(post, "seed store needs at least one post");

      const chatRequestResponse = await context.app.inject({
        method: "POST",
        url: "/chat/requests",
        headers: authHeaders(strangerSession),
        payload: {
          body: "Ping from a guest install.",
          postId: post.id,
          toInstallIdentityId: primaryInstall.id,
        },
      });
      assert.equal(chatRequestResponse.statusCode, 201);
      const chatRequest = chatRequestResponse.json();
      assert.equal(chatRequest.toAccountId, primaryLogin.account.id);

      const secondDeviceListResponse = await context.app.inject({
        method: "GET",
        url: "/chat/requests?status=pending",
        headers: authHeaders(secondLogin.session),
      });
      assert.equal(secondDeviceListResponse.statusCode, 200, secondDeviceListResponse.body);
      assert.ok(
        secondDeviceListResponse
          .json()
          .requests.some((request: { id: string }) => request.id === chatRequest.id),
        "second linked install should see incoming account chat request",
      );

      const acceptResponse = await context.app.inject({
        method: "POST",
        url: "/chat/requests/respond",
        headers: authHeaders(secondLogin.session),
        payload: {
          action: "accept",
          requestId: chatRequest.id,
        },
      });
      assert.equal(acceptResponse.statusCode, 200);
      assert.equal(acceptResponse.json().status, "accepted");

      const messageResponse = await context.app.inject({
        method: "POST",
        url: "/chat/messages",
        headers: authHeaders(secondLogin.session),
        payload: {
          body: "Reply from the second linked device.",
          chatRequestId: chatRequest.id,
        },
      });
      assert.equal(messageResponse.statusCode, 201);
      const message = messageResponse.json();
      assert.equal(message.accountId, primaryLogin.account.id);

      const primaryMessagesResponse = await context.app.inject({
        method: "GET",
        url: `/chat/messages?chatRequestId=${chatRequest.id}`,
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(primaryMessagesResponse.statusCode, 200);
      assert.ok(
        primaryMessagesResponse
          .json()
          .messages.some((entry: { id: string }) => entry.id === message.id),
        "primary linked install should see messages written by the second install",
      );

      const strangerMessagesResponse = await context.app.inject({
        method: "GET",
        url: `/chat/messages?chatRequestId=${chatRequest.id}`,
        headers: authHeaders(strangerSession),
      });
      assert.equal(strangerMessagesResponse.statusCode, 200);
      assert.ok(
        strangerMessagesResponse
          .json()
          .messages.some((entry: { id: string }) => entry.id === message.id),
        "the original requester should still see the accepted account chat",
      );
    } finally {
      await closeTestContext(context);
    }
  });

  test("creator status, votes and reports prefer account ownership over a single install", async () => {
    const context = await buildTestContext();
    try {
      const primaryInstall = context.store.installIdentity;
      const secondInstall = ensureInstallIdentity(context.store, "install-ownership-second-device");
      primaryInstall.adultGateAccepted = true;
      primaryInstall.adultVerified = true;
      secondInstall.adultGateAccepted = true;
      secondInstall.adultVerified = true;

      const primarySession = issueInstallSession(context.store, primaryInstall.id);
      const secondSession = issueInstallSession(context.store, secondInstall.id);
      const primaryLogin = await linkInstallWithEmail(context, primarySession, {
        displayName: "Creator Account",
        email: "creator-owner@example.test",
        username: "creatorowner",
      });
      const secondLogin = await linkInstallWithEmail(context, secondSession, {
        displayName: "Creator Account",
        email: "creator-owner@example.test",
        username: "creatorowner",
      });
      assert.equal(secondLogin.account.id, primaryLogin.account.id);

      const creatorResponse = await context.app.inject({
        method: "POST",
        url: "/creator/apply",
        headers: authHeaders(primaryLogin.session),
        payload: {
          adultVerified: true,
          displayName: "Creator Account",
        },
      });
      assert.equal(creatorResponse.statusCode, 201);
      assert.equal(creatorResponse.json().accountId, primaryLogin.account.id);

      const secondStatusResponse = await context.app.inject({
        method: "GET",
        url: "/creator/status",
        headers: authHeaders(secondLogin.session),
      });
      assert.equal(secondStatusResponse.statusCode, 200);
      assert.equal(secondStatusResponse.json().application.accountId, primaryLogin.account.id);

      const unrelatedInstall = ensureInstallIdentity(context.store, "install-ownership-unrelated");
      const unrelatedSession = issueInstallSession(context.store, unrelatedInstall.id);
      const unrelatedStatusResponse = await context.app.inject({
        method: "GET",
        url: "/creator/status",
        headers: authHeaders(unrelatedSession),
      });
      assert.equal(unrelatedStatusResponse.statusCode, 200);
      assert.equal(unrelatedStatusResponse.json().application.accountId, undefined);

      const targetPost = context.store.posts[0];
      assert.ok(targetPost, "seed store needs at least one post");
      const initialScore = targetPost.score;
      const votePayload = {
        targetId: targetPost.id,
        targetType: "post",
        value: 1,
      };

      const primaryVoteResponse = await context.app.inject({
        method: "POST",
        url: "/votes",
        headers: authHeaders(primaryLogin.session),
        payload: votePayload,
      });
      assert.equal(primaryVoteResponse.statusCode, 200);
      assert.equal(primaryVoteResponse.json().aggregateScore, initialScore + 1);

      const secondVoteResponse = await context.app.inject({
        method: "POST",
        url: "/votes",
        headers: authHeaders(secondLogin.session),
        payload: votePayload,
      });
      assert.equal(secondVoteResponse.statusCode, 200);
      assert.equal(secondVoteResponse.json().aggregateScore, initialScore + 1);
      assert.equal(targetPost.score, initialScore + 1);
      assert.equal(
        Object.values(context.store.votes).filter(
          (vote) => vote.accountId === primaryLogin.account.id && vote.targetId === targetPost.id && vote.targetType === "post",
        ).length,
        1,
      );

      const reportResponse = await context.app.inject({
        method: "POST",
        url: "/reports",
        headers: authHeaders(secondLogin.session),
        payload: {
          reason: "Ownership regression report.",
          targetId: targetPost.id,
          targetType: "post",
        },
      });
      assert.equal(reportResponse.statusCode, 201);
      assert.equal(reportResponse.json().report.accountId, primaryLogin.account.id);
      assert.equal(reportResponse.json().report.reporterInstallIdentityId, secondInstall.id);
      assert.equal(reportResponse.json().moderationCase.accountId, primaryLogin.account.id);
    } finally {
      await closeTestContext(context);
    }
  });

  test("public posts and replies hide account ids unless only creator identity is intentionally surfaced", async () => {
    const context = await buildTestContext();
    try {
      const install = context.store.installIdentity;
      const session = issueInstallSession(context.store, install.id);
      const login = await linkInstallWithEmail(context, session, {
        displayName: "Anon Account",
        email: "anon-public@example.test",
        username: "anonpublic",
      });

      const postResponse = await context.app.inject({
        method: "POST",
        url: "/posts",
        headers: authHeaders(login.session),
        payload: {
          body: "Account-linked post should stay public-anonymous.",
          cityId: install.cityId,
          tags: ["privacy"],
        },
      });
      assert.equal(postResponse.statusCode, 201);
      const publicPost = postResponse.json();
      assert.equal(publicPost.accountId, undefined);
      assert.equal(publicPost.accountUsername, undefined);
      assert.equal(publicPost.accountDisplayName, undefined);

      const storedPost = context.store.posts.find((post) => post.id === publicPost.id);
      assert.ok(storedPost, "created post should be stored internally");
      assert.equal(storedPost.accountId, login.account.id);
      assert.equal(storedPost.accountUsername, "anonpublic");

      const replyResponse = await context.app.inject({
        method: "POST",
        url: "/replies",
        headers: authHeaders(login.session),
        payload: {
          body: "Account-linked reply should stay public-anonymous.",
          postId: publicPost.id,
        },
      });
      assert.equal(replyResponse.statusCode, 201);
      const publicReply = replyResponse.json();
      assert.equal(publicReply.accountId, undefined);
      assert.equal(publicReply.accountUsername, undefined);
      assert.equal(publicReply.accountDisplayName, undefined);

      const profile = context.store.accountProfiles[login.account.id];
      assert.ok(profile, "account profile should exist");
      profile.isCreator = true;

      const threadResponse = await context.app.inject({
        method: "GET",
        url: `/posts/${publicPost.id}`,
        headers: authHeaders(login.session),
      });
      assert.equal(threadResponse.statusCode, 200);
      const threadBody = threadResponse.json();
      assert.equal(threadBody.post.accountId, undefined);
      assert.equal(threadBody.post.accountUsername, "anonpublic");
      assert.equal(threadBody.post.accountDisplayName, "Anon Account");
      assert.equal(threadBody.post.accountIsCreator, true);
      assert.equal(threadBody.replies[0].accountId, undefined);
      assert.equal(threadBody.replies[0].accountUsername, "anonpublic");
      assert.equal(threadBody.replies[0].accountDisplayName, "Anon Account");
      assert.equal(threadBody.replies[0].accountIsCreator, true);
    } finally {
      await closeTestContext(context);
    }
  });

  test("legacy guest posts stay anonymous after the install links a creator account", async () => {
    const context = await buildTestContext();
    try {
      const install = context.store.installIdentity;
      const guestSession = issueInstallSession(context.store, install.id);

      const guestPostResponse = await context.app.inject({
        method: "POST",
        url: "/posts",
        headers: authHeaders(guestSession),
        payload: {
          body: "Legacy guest post must stay anonymous after account linking.",
          cityId: install.cityId,
          tags: ["legacy"],
        },
      });
      assert.equal(guestPostResponse.statusCode, 201);
      const legacyPost = guestPostResponse.json();

      const guestReplyResponse = await context.app.inject({
        method: "POST",
        url: "/replies",
        headers: authHeaders(guestSession),
        payload: {
          body: "Legacy guest reply must stay anonymous after account linking.",
          postId: legacyPost.id,
        },
      });
      assert.equal(guestReplyResponse.statusCode, 201);
      const legacyReply = guestReplyResponse.json();

      const storedLegacyPost = context.store.posts.find((post) => post.id === legacyPost.id);
      const storedLegacyReply = context.store.replies.find((reply) => reply.id === legacyReply.id);
      assert.ok(storedLegacyPost, "legacy guest post should be stored");
      assert.ok(storedLegacyReply, "legacy guest reply should be stored");
      assert.equal(storedLegacyPost.accountId, undefined);
      assert.equal(storedLegacyReply.accountId, undefined);

      const login = await linkInstallWithEmail(context, guestSession, {
        displayName: "Legacy Creator",
        email: "legacy-creator@example.test",
        username: "legacycreator",
      });
      const profile = context.store.accountProfiles[login.account.id];
      assert.ok(profile, "linked account profile should exist");
      profile.isCreator = true;

      const legacyThreadResponse = await context.app.inject({
        method: "GET",
        url: `/posts/${legacyPost.id}`,
        headers: authHeaders(login.session),
      });
      assert.equal(legacyThreadResponse.statusCode, 200);
      const legacyThread = legacyThreadResponse.json();
      assert.equal(legacyThread.post.accountId, undefined);
      assert.equal(legacyThread.post.accountUsername, undefined);
      assert.equal(legacyThread.post.accountDisplayName, undefined);
      assert.equal(legacyThread.post.accountIsCreator, undefined);
      assert.equal(legacyThread.replies[0].accountId, undefined);
      assert.equal(legacyThread.replies[0].accountUsername, undefined);
      assert.equal(legacyThread.replies[0].accountDisplayName, undefined);
      assert.equal(legacyThread.replies[0].accountIsCreator, undefined);

      storedLegacyPost.createdAt = "2020-01-01T00:00:00.000Z";
      const creatorPostResponse = await context.app.inject({
        method: "POST",
        url: "/posts",
        headers: authHeaders(login.session),
        payload: {
          body: "New creator post may intentionally surface creator identity.",
          cityId: install.cityId,
          tags: ["creator"],
        },
      });
      assert.equal(creatorPostResponse.statusCode, 201);
      const creatorPost = creatorPostResponse.json();
      assert.equal(creatorPost.accountId, undefined);
      assert.equal(creatorPost.accountUsername, "legacycreator");
      assert.equal(creatorPost.accountDisplayName, "Legacy Creator");
      assert.equal(creatorPost.accountIsCreator, true);

      const storedCreatorPost = context.store.posts.find((post) => post.id === creatorPost.id);
      assert.ok(storedCreatorPost, "creator post should be stored");
      assert.equal(storedCreatorPost.accountId, login.account.id);
    } finally {
      await closeTestContext(context);
    }
  });

  test("email code verification re-checks username conflicts before linking installs", async () => {
    const context = await buildTestContext();
    try {
      const firstInstall = context.store.installIdentity;
      const secondInstall = ensureInstallIdentity(context.store, "install-username-race-second");
      const firstSession = issueInstallSession(context.store, firstInstall.id);
      const secondSession = issueInstallSession(context.store, secondInstall.id);

      const pendingStartResponse = await context.app.inject({
        method: "POST",
        url: "/auth/email/start",
        headers: authHeaders(secondSession),
        payload: {
          displayName: "Race Pending",
          email: "race-pending@example.test",
          username: "racehandle",
        },
      });
      assert.equal(pendingStartResponse.statusCode, 200);
      const pendingCode = pendingStartResponse.json().codePreview ?? context.store.accountLoginCodes[0]?.code;
      assert.ok(pendingCode, "expected pending verification code");

      await linkInstallWithEmail(context, firstSession, {
        displayName: "Race Owner",
        email: "race-owner@example.test",
        username: "racehandle",
      });

      const verifyResponse = await context.app.inject({
        method: "POST",
        url: "/auth/email/verify",
        headers: authHeaders(secondSession),
        payload: {
          code: pendingCode,
          displayName: "Race Pending",
          email: "race-pending@example.test",
          username: "racehandle",
        },
      });
      assert.equal(verifyResponse.statusCode, 409);
      assert.equal(verifyResponse.json().error.code, "CONFLICT");
      assert.equal(verifyResponse.json().error.message, "Username is already reserved.");
      assert.equal(secondInstall.accountId, undefined);
      assert.equal(
        context.store.accountLinks.some((link) => link.installIdentityId === secondInstall.id && link.unlinkedAt === null),
        false,
      );
    } finally {
      await closeTestContext(context);
    }
  });

  test("logout detaches only the current install while other linked devices stay connected", async () => {
    const context = await buildTestContext();
    try {
      const primaryInstall = context.store.installIdentity;
      const secondInstall = ensureInstallIdentity(context.store, "install-logout-second-device");
      const primarySession = issueInstallSession(context.store, primaryInstall.id);
      const secondSession = issueInstallSession(context.store, secondInstall.id);

      const primaryLogin = await linkInstallWithEmail(context, primarySession, {
        displayName: "Logout Owner",
        email: "logout-owner@example.test",
        username: "logoutowner",
      });
      const secondLogin = await linkInstallWithEmail(context, secondSession, {
        displayName: "Logout Owner",
        email: "logout-owner@example.test",
        username: "logoutowner",
      });
      assert.equal(secondLogin.account.id, primaryLogin.account.id);

      const accountBeforeLogoutResponse = await context.app.inject({
        method: "GET",
        url: "/account/me",
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(accountBeforeLogoutResponse.statusCode, 200);
      assert.equal(accountBeforeLogoutResponse.json().account.linkedInstallCount, 2);
      assert.ok(
        accountBeforeLogoutResponse
          .json()
          .account.linkedInstalls.some((entry: { current: boolean; installIdentityId: string }) => entry.current && entry.installIdentityId === primaryInstall.id),
        "account/me should mark the current linked install",
      );

      const logoutResponse = await context.app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(logoutResponse.statusCode, 200);
      assert.equal(logoutResponse.json().account, null);
      assert.equal(primaryInstall.accountId, undefined);
      assert.equal(primaryInstall.accountUsername, undefined);

      const guestAccountResponse = await context.app.inject({
        method: "GET",
        url: "/account/me",
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(guestAccountResponse.statusCode, 200);
      assert.equal(guestAccountResponse.json().account, null);

      const secondAccountResponse = await context.app.inject({
        method: "GET",
        url: "/account/me",
        headers: authHeaders(secondLogin.session),
      });
      assert.equal(secondAccountResponse.statusCode, 200);
      assert.equal(secondAccountResponse.json().account.id, primaryLogin.account.id);
      assert.equal(secondAccountResponse.json().account.linkedInstallCount, 1);
      assert.equal(
        context.store.accountLinks.filter((link) => link.installIdentityId === primaryInstall.id && link.unlinkedAt === null).length,
        0,
      );
      assert.equal(
        context.store.accountLinks.filter((link) => link.installIdentityId === secondInstall.id && link.unlinkedAt === null).length,
        1,
      );
    } finally {
      await closeTestContext(context);
    }
  });

  test("remote device logout revokes the target sessions and keeps the current device linked", async () => {
    const context = await buildTestContext();
    try {
      const primaryInstall = context.store.installIdentity;
      const secondInstall = ensureInstallIdentity(context.store, "install-remote-logout-second-device");
      const primarySession = issueInstallSession(context.store, primaryInstall.id);
      const secondSession = issueInstallSession(context.store, secondInstall.id);

      const primaryLogin = await linkInstallWithEmail(context, primarySession, {
        displayName: "Remote Logout Owner",
        email: "remote-logout@example.test",
        username: "remotelogout",
      });
      const secondLogin = await linkInstallWithEmail(context, secondSession, {
        displayName: "Remote Logout Owner",
        email: "remote-logout@example.test",
        username: "remotelogout",
      });
      assert.equal(secondLogin.account.id, primaryLogin.account.id);

      const accountBeforeLogoutResponse = await context.app.inject({
        method: "GET",
        url: "/account/me",
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(accountBeforeLogoutResponse.statusCode, 200);
      const linkedInstalls = accountBeforeLogoutResponse.json().account.linkedInstalls as {
        canRemoteLogout: boolean;
        current: boolean;
        deviceLabel: string;
        installIdentityId: string;
        sessionCount: number;
        status: string;
      }[];
      const targetDevice = linkedInstalls.find((entry) => entry.installIdentityId === secondInstall.id);
      const currentDevice = linkedInstalls.find((entry) => entry.installIdentityId === primaryInstall.id);
      assert.ok(targetDevice, "second linked install should be exposed as a device");
      assert.ok(currentDevice, "current install should be exposed as a device");
      assert.equal(targetDevice.current, false);
      assert.equal(targetDevice.canRemoteLogout, true);
      assert.equal(targetDevice.status, "active");
      assert.ok(targetDevice.deviceLabel.startsWith("Gerät "));
      assert.equal(currentDevice.current, true);
      assert.equal(currentDevice.deviceLabel, "Dieses Gerät");

      const remoteLogoutResponse = await context.app.inject({
        method: "POST",
        url: `/account/devices/${secondInstall.id}/logout`,
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(remoteLogoutResponse.statusCode, 200);
      assert.equal(remoteLogoutResponse.json().account.id, primaryLogin.account.id);
      assert.equal(remoteLogoutResponse.json().account.linkedInstallCount, 1);
      assert.equal(remoteLogoutResponse.json().revokedSessions > 0, true);
      assert.equal(secondInstall.accountId, undefined);
      assert.equal(
        context.store.installSessions.filter(
          (session) => session.installIdentityId === secondInstall.id && session.status === "active",
        ).length,
        0,
      );
      assert.equal(
        context.store.refreshTokens.filter((token) => token.installIdentityId === secondInstall.id && !token.revokedAt)
          .length,
        0,
      );

      const revokedDeviceAccountResponse = await context.app.inject({
        method: "GET",
        url: "/account/me",
        headers: authHeaders(secondLogin.session),
      });
      assert.equal(revokedDeviceAccountResponse.statusCode, 401);

      const currentDeviceAccountResponse = await context.app.inject({
        method: "GET",
        url: "/account/me",
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(currentDeviceAccountResponse.statusCode, 200);
      assert.equal(currentDeviceAccountResponse.json().account.linkedInstallCount, 1);
      assert.equal(
        context.store.auditLogs.some(
          (event) =>
            event.action === "account.device_logout" &&
            event.actorId === primaryInstall.id &&
            event.entityId === secondInstall.id,
        ),
        true,
      );

      const repeatedRemoteLogoutResponse = await context.app.inject({
        method: "POST",
        url: `/account/devices/${secondInstall.id}/logout`,
        headers: authHeaders(primaryLogin.session),
      });
      assert.equal(repeatedRemoteLogoutResponse.statusCode, 200);
      assert.equal(repeatedRemoteLogoutResponse.json().revokedSessions, 0);
    } finally {
      await closeTestContext(context);
    }
  });

  test("verified account switching and re-linking never leave two active account links on one install", async () => {
    const context = await buildTestContext();
    try {
      const firstInstall = context.store.installIdentity;
      const secondInstall = ensureInstallIdentity(context.store, "install-account-switch-target");
      const firstSession = issueInstallSession(context.store, firstInstall.id);
      const secondSession = issueInstallSession(context.store, secondInstall.id);

      const firstLogin = await linkInstallWithEmail(context, firstSession, {
        displayName: "First Account",
        email: "first-switch@example.test",
        username: "firstswitch",
      });
      const secondLogin = await linkInstallWithEmail(context, secondSession, {
        displayName: "Second Account",
        email: "second-switch@example.test",
        username: "secondswitch",
      });

      const switchStartResponse = await context.app.inject({
        method: "POST",
        url: "/auth/email/start",
        headers: authHeaders(firstLogin.session),
        payload: {
          displayName: "Second Account",
          email: "second-switch@example.test",
          username: "secondswitch",
        },
      });
      assert.equal(switchStartResponse.statusCode, 200);
      const switchCode = switchStartResponse.json().codePreview ?? context.store.accountLoginCodes[0]?.code;
      assert.ok(switchCode, "expected switch verification code");

      const switchResponse = await context.app.inject({
        method: "POST",
        url: "/auth/email/verify",
        headers: authHeaders(firstLogin.session),
        payload: {
          code: switchCode,
          displayName: "Second Account",
          email: "second-switch@example.test",
          username: "secondswitch",
        },
      });
      assert.equal(switchResponse.statusCode, 200);
      const switchedLogin = switchResponse.json() as AccountLoginResult;
      assert.equal(switchedLogin.account.id, secondLogin.account.id);
      assert.equal(firstInstall.accountId, secondLogin.account.id);
      assert.equal(
        context.store.accountLinks.filter((link) => link.installIdentityId === firstInstall.id && link.accountId === firstLogin.account.id && link.unlinkedAt === null).length,
        0,
      );
      assert.equal(
        context.store.accountLinks.filter((link) => link.installIdentityId === firstInstall.id && link.unlinkedAt === null).length,
        1,
      );

      const switchedAccountResponse = await context.app.inject({
        method: "GET",
        url: "/account/me",
        headers: authHeaders(switchedLogin.session),
      });
      assert.equal(switchedAccountResponse.statusCode, 200);
      assert.equal(switchedAccountResponse.json().account.id, secondLogin.account.id);
      assert.equal(switchedAccountResponse.json().account.linkedInstallCount, 2);
      assert.ok(
        switchedAccountResponse
          .json()
          .account.linkedInstalls.some((entry: { current: boolean; installIdentityId: string }) => entry.current && entry.installIdentityId === firstInstall.id),
        "switched account should expose the current install in the device list",
      );

      const logoutResponse = await context.app.inject({
        method: "POST",
        url: "/auth/logout",
        headers: authHeaders(switchedLogin.session),
      });
      assert.equal(logoutResponse.statusCode, 200);
      assert.equal(firstInstall.accountId, undefined);

      const relinkedLogin = await linkInstallWithEmail(context, switchedLogin.session, {
        displayName: "First Account",
        email: "first-switch@example.test",
        username: "firstswitch",
      });
      assert.equal(relinkedLogin.account.id, firstLogin.account.id);
      assert.equal(firstInstall.accountId, firstLogin.account.id);
      assert.equal(
        context.store.accountLinks.filter((link) => link.installIdentityId === firstInstall.id && link.accountId === secondLogin.account.id && link.unlinkedAt === null).length,
        0,
      );
      assert.equal(
        context.store.accountLinks.filter((link) => link.installIdentityId === firstInstall.id && link.unlinkedAt === null).length,
        1,
      );
    } finally {
      await closeTestContext(context);
    }
  });
});

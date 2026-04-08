import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type {
  Account,
  AccountProfile,
  ChatMessage,
  ChatRequest,
  Channel,
  LedgerEntry,
  ModerationCase,
  Post,
  Reply,
  NotificationItem,
  SearchResults,
  Tip,
  WalletBalance,
} from "@veil/shared";
import { createThreadAnonLabel } from "@veil/shared";
import {
  actionTemporarilyBlocked,
  badRequest,
  conflict,
  forbidden,
  getHeaderValue,
  getIdempotencyKey,
  maybeReplayedResponse,
  notFound,
  paymentRequired,
  rateLimitExceeded,
  spamDetected,
  suspiciousActivity,
  unauthorized,
  sendIdempotentResponse,
  validationError,
  installHttpGuards,
} from "./http.js";
import { getOpsStatus } from "./ops.js";
import {
  type BackofficeRole,
  applyInstallRestriction,
  authenticateInstallSession,
  clearInstallRestrictions,
  createAccountSession,
  createAnonLabel,
  createId,
  createReportRecord,
  createStore,
  ensureInstallIdentity,
  findAccountByEmail,
  findAccountByUsername,
  getActiveRestriction,
  getAccountById,
  getAccountForInstallIdentity,
  getAccountProfile,
  getInstallIdentityById,
  getOrCreateRiskState,
  getRateLimitCounter,
  getWallet,
  getWalletOwnerId,
  incrementRiskScore,
  issueInstallSession,
  isValidUsername,
  linkInstallIdentityToAccount,
  normalizeEmail,
  normalizeUsername,
  recordAbuseEvent,
  recordAudit,
  recordBackofficeAction,
  rotateInstallRefreshToken,
  startAccountLoginCode,
  setCurrentInstallIdentity,
  getAccountChannelPreferencesForCity,
  unlinkInstallIdentityFromAccount,
  updateAccountChannelPreferencesForCity,
  verifyAccountLoginCode,
  syncCurrentWallet,
  toPlusEntitlement,
  applyAccountChannelPreferencesToChannels,
  type ApiStore,
  type AccountLoginCodeRecord,
  type CreatorApplicationRecord,
  type ReportRecord,
  type SessionTokenBundle,
  voteKey,
} from "./store.js";

type MediaUploadJsonBody = {
  base64?: string;
  contentType?: string;
  fileName?: string;
};

type StoredMediaAsset = {
  byteLength: number;
  contentType: string;
  fileName: string;
  id: string;
  kind: "image";
  sourceFileName?: string;
  url: string;
};

type RegisterBody = {
  adultGateAccepted?: boolean;
  cityId?: string;
  citySlug?: string;
  lat?: number;
  lng?: number;
};

type ResolveBody = {
  cityQuery?: string;
  lat?: number;
  lng?: number;
};

type RefreshBody = {
  refreshToken?: string;
};

type AccountEmailStartBody = {
  displayName?: string;
  email?: string;
  username?: string;
};

type AccountEmailVerifyBody = {
  code?: string;
  displayName?: string;
  discoverable?: boolean;
  channelPreferences?: Array<{
    cityId?: string;
    favoriteChannelIds?: string[];
    joinedChannelIds?: string[];
    recentChannelIds?: string[];
  }>;
  email?: string;
  username?: string;
};

type AccountProfilePatchBody = {
  displayName?: string;
  discoverable?: boolean;
  channelPreferences?: Array<{
    cityId?: string;
    favoriteChannelIds?: string[];
    joinedChannelIds?: string[];
    recentChannelIds?: string[];
  }>;
};

type AccountChannelPreferencesPatchBody = {
  cityId?: string;
  favoriteChannelIds?: string[];
  joinedChannelIds?: string[];
  recentChannelIds?: string[];
};

type NotificationReadBody = {
  notificationId?: string;
};

type ChatMessagesReadBody = {
  chatRequestId?: string;
};

type CreatePostBody = {
  body: string;
  channelId?: string | null;
  cityId: string;
  media?: Array<{ kind: "image"; url: string }>;
  tags?: string[];
};

type CreateReplyBody = {
  body: string;
  postId: string;
};

type VoteBody = {
  targetId: string;
  targetType: "post" | "reply";
  value: -1 | 0 | 1;
};

type ChatRequestBody = {
  body?: string;
  postId?: string;
  toInstallIdentityId: string;
};

type ChatRequestRespondBody = {
  action: "accept" | "decline";
  requestId: string;
};

type ChatMessageBody = {
  body: string;
  chatRequestId: string;
  media?: Array<{ kind: "image"; url: string }>;
};

type ReportBody = {
  reason: string;
  targetId: string;
  targetType: ModerationCase["targetType"];
};

type WalletTopupBody = {
  amountCents: number;
  provider?: "fake" | "stripe";
};

type TipBody = {
  amountCents: number;
  recipientInstallIdentityId: string;
  targetId: string;
  targetType: "post" | "reply";
};

type CreatorApplyBody = {
  adultVerified?: boolean;
  displayName?: string;
};

type PlusCheckoutBody = {
  plan: "monthly" | "yearly";
  provider?: "fake" | "stripe";
};

const API_DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".data");
const MEDIA_UPLOADS_DIR = resolve(API_DATA_DIR, "uploads");

const MEDIA_EXTENSIONS: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

type ModerationActionBody = {
  action: "block" | "flag" | "restore" | "dismiss";
  caseId: string;
  note?: string;
};

type CreatorApprovalBody = {
  action: "approve" | "reject";
  applicationId: string;
  note?: string;
};

type PayoutBody = {
  amountCents: number;
  applicationId: string;
};

type SecurityRestrictionBody = {
  action: "apply" | "clear";
  durationMinutes?: number;
  installIdentityId: string;
  note?: string;
  type?: "posting_block" | "reply_block" | "vote_block" | "chat_request_block" | "geo_switch_block" | "read_only";
};

type SecurityInstallResetBody = {
  installIdentityId: string;
  note?: string;
};

type BackofficeActor = {
  id: string;
  role: BackofficeRole;
};

const clampText = (value: unknown, fallback = "") => {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim();
};

const positiveCents = (value: number | undefined, fieldName: string, minimum = 1) => {
  if (!Number.isFinite(value) || !value || value < minimum) {
    throw validationError(`${fieldName} must be at least ${minimum} cents.`, {
      fieldName,
      minimum,
      provided: value,
    });
  }

  return Math.trunc(value);
};

const requireInstallIdentityId = (value: string | undefined) => {
  const normalized = clampText(value);
  if (!normalized) {
    throw badRequest("install identity id is required.");
  }

  return normalized;
};

const getCityById = (store: ApiStore, cityId: string | undefined) =>
  store.cities.find((city) => city.id === cityId) ?? store.cities[0];

const getCityByQuery = (store: ApiStore, cityQuery: string | undefined) => {
  if (!cityQuery) {
    return store.cities[0];
  }

  const normalized = cityQuery.trim().toLowerCase();
  return (
    store.cities.find((city) => city.slug === normalized || city.label.toLowerCase() === normalized) ??
    store.cities[0]
  );
};

const resolveCityFromCoordinates = (store: ApiStore, lat: number | undefined, lng: number | undefined) => {
  const latValue = typeof lat === "number" && Number.isFinite(lat) ? lat : undefined;
  const lngValue = typeof lng === "number" && Number.isFinite(lng) ? lng : undefined;

  if (latValue === undefined || lngValue === undefined) {
    return store.cities[0];
  }

  return [...store.cities].sort((left, right) => {
    const leftDistance = (left.lat - latValue) ** 2 + (left.lng - lngValue) ** 2;
    const rightDistance = (right.lat - latValue) ** 2 + (right.lng - lngValue) ** 2;
    return leftDistance - rightDistance;
  })[0] ?? store.cities[0];
};

const feedForCity = (store: ApiStore, cityId: string) =>
  store.posts.filter((post) => post.cityId === cityId && post.moderation === "visible");

const replyCountForPost = (store: ApiStore, postId: string) =>
  store.replies.filter((reply) => reply.postId === postId && reply.moderation === "visible").length;

const visibleRepliesForPost = (store: ApiStore, postId: string) =>
  store.replies
    .filter((reply) => reply.postId === postId && reply.moderation === "visible")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

const notificationsForActor = (store: ApiStore, installIdentityId: string) => {
  const linkedInstallIds = new Set(getLinkedInstallIdentities(store, installIdentityId).map((entry) => entry.id));
  const account = getAccountForInstallIdentity(store, installIdentityId);
  const deduped = new Map<string, NotificationItem>();

  store.notifications.forEach((notification) => {
    const visibleForAccount = Boolean(account?.id && notification.accountId === account.id);
    const visibleForInstall =
      !notification.accountId &&
      Boolean(notification.installIdentityId) &&
      linkedInstallIds.has(notification.installIdentityId as string);

    if (!visibleForAccount && !visibleForInstall) {
      return;
    }

    const current = deduped.get(notification.id);
    if (!current || (!current.accountId && notification.accountId)) {
      deduped.set(notification.id, notification);
    }
  });

  return [...deduped.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

const latestNotifications = (store: ApiStore, installIdentityId: string) =>
  notificationsForActor(store, installIdentityId);

const unreadNotificationCount = (store: ApiStore, installIdentityId: string) =>
  notificationsForActor(store, installIdentityId).filter((notification) => !notification.read).length;

const resolveAccountInstallContext = (
  store: ApiStore,
  accountId?: string | null,
  installIdentityId?: string | null,
) => {
  const resolvedInstallIdentityId = installIdentityId ?? null;
  const resolvedAccountId = accountId ?? (resolvedInstallIdentityId ? getAccountForInstallIdentity(store, resolvedInstallIdentityId)?.id ?? null : null);
  const installIdentity = resolvedInstallIdentityId ? getInstallIdentityById(store, resolvedInstallIdentityId) ?? null : null;
  const account = resolvedAccountId ? getAccountById(store, resolvedAccountId) ?? null : null;
  const profile = resolvedAccountId ? getAccountProfile(store, resolvedAccountId) ?? null : null;

  return {
    accountDisplayName: profile?.displayName ?? null,
    accountId: resolvedAccountId,
    accountUsername: account?.username ?? null,
    installIdentityId: resolvedInstallIdentityId,
    installLabel: installIdentity ? createInstallAnonLabel(installIdentity.id) : null,
  };
};

const auditEntryContext = (store: ApiStore, entry: { actorType: string; actorId: string; metadata?: Record<string, unknown> }) => {
  const actorContext =
    entry.actorType === "install"
      ? resolveAccountInstallContext(store, null, entry.actorId)
      : entry.actorType === "admin"
        ? {
            accountDisplayName: null,
            accountId: null,
            accountUsername: null,
            installIdentityId: null,
            installLabel: null,
          }
        : {
            accountDisplayName: null,
            accountId: null,
            accountUsername: null,
            installIdentityId: null,
            installLabel: null,
          };

  const metadata = entry.metadata ?? {};
  const targetContexts = [
    {
      accountId:
        typeof metadata.targetAccountId === "string"
          ? metadata.targetAccountId
          : typeof metadata.accountId === "string"
            ? metadata.accountId
            : null,
      installIdentityId:
        typeof metadata.targetInstallIdentityId === "string"
          ? metadata.targetInstallIdentityId
          : typeof metadata.installIdentityId === "string"
            ? metadata.installIdentityId
            : null,
    },
    {
      accountId: typeof metadata.recipientAccountId === "string" ? metadata.recipientAccountId : null,
      installIdentityId: typeof metadata.recipientInstallIdentityId === "string" ? metadata.recipientInstallIdentityId : null,
    },
    {
      accountId: typeof metadata.fromAccountId === "string" ? metadata.fromAccountId : null,
      installIdentityId: typeof metadata.fromInstallIdentityId === "string" ? metadata.fromInstallIdentityId : null,
    },
    {
      accountId: typeof metadata.toAccountId === "string" ? metadata.toAccountId : null,
      installIdentityId: typeof metadata.toInstallIdentityId === "string" ? metadata.toInstallIdentityId : null,
    },
  ]
    .filter((candidate) => candidate.accountId || candidate.installIdentityId)
    .map((candidate) => resolveAccountInstallContext(store, candidate.accountId, candidate.installIdentityId))
    .filter((context, index, current) => {
      const key = `${context.accountId ?? ""}:${context.installIdentityId ?? ""}`;
      return current.findIndex((entry) => `${entry.accountId ?? ""}:${entry.installIdentityId ?? ""}` === key) === index;
    });
  const emptyContext = {
    accountDisplayName: null,
    accountId: null,
    accountUsername: null,
    installIdentityId: null,
    installLabel: null,
  };

  return {
    actorContext,
    targetContext: targetContexts[0] ?? emptyContext,
    relatedTargetContexts: targetContexts.slice(1),
  };
};

const isNotificationRecipientActor = (
  actor: { accountId?: string | null; installIdentityId: string },
  recipient: { accountId?: string | null; installIdentityId?: string | null },
) =>
  (Boolean(actor.accountId) && Boolean(recipient.accountId) && actor.accountId === recipient.accountId) ||
  recipient.installIdentityId === actor.installIdentityId;

const buildSearchResults = (
  store: ApiStore,
  cityId: string,
  query: string,
  accountId: string | null = null,
): SearchResults => {
  const normalized = query.trim().toLowerCase();
  const accountPreferences = accountId ? getAccountChannelPreferencesForCity(store, accountId, cityId) : null;
  const accounts = store.accounts
    .filter((account) => {
      const profile = getAccountProfile(store, account.id);
      return (
        (account.discoverable || profile?.isCreator) &&
        (!normalized ||
          account.username.includes(normalized) ||
          profile?.displayName.toLowerCase().includes(normalized))
      );
    })
    .map((account) => {
      const profile = getAccountProfile(store, account.id);
      const linkedInstall = getPrimaryLinkedInstallForAccountId(store, account.id);
      const city = linkedInstall ? getCityById(store, linkedInstall.cityId) : null;

      return {
        accountId: account.id,
        username: account.username,
        displayName: profile?.displayName ?? account.username,
        discoverable: account.discoverable,
        isCreator: profile?.isCreator ?? false,
        cityId: city?.id,
        cityLabel: city?.label,
      };
    });

  if (!normalized) {
    return {
      accounts,
      accountPreferences,
      channels: applyAccountChannelPreferencesToChannels(
        store.channels.filter((channel) => channel.cityId === cityId),
        accountPreferences,
      ),
      hashtags: [],
      posts: feedForCity(store, cityId),
    };
  }

  return {
    accounts,
    accountPreferences,
    channels: applyAccountChannelPreferencesToChannels(
      store.channels.filter((channel) =>
        channel.cityId === cityId &&
        [channel.slug, channel.title, channel.description].some((field) => field.toLowerCase().includes(normalized))
      ),
      accountPreferences,
    ),
    hashtags: Array.from(
      new Set(
        store.posts
          .filter((post) => post.cityId === cityId)
          .flatMap((post) => post.tags)
          .filter((tag) => tag.toLowerCase().includes(normalized))
      )
    ),
    posts: store.posts.filter((post) =>
      post.cityId === cityId &&
      (post.body.toLowerCase().includes(normalized) ||
        post.tags.some((tag) => tag.toLowerCase().includes(normalized)) ||
        post.authorLabel.toLowerCase().includes(normalized))
    ),
  };
};

const getTargetByType = (store: ApiStore, targetType: "post" | "reply", targetId: string) =>
  targetType === "post"
    ? store.posts.find((item) => item.id === targetId)
    : store.replies.find((item) => item.id === targetId);

const getChannelForPost = (store: ApiStore, post: Post): Channel | null =>
  store.channels.find((channel) => channel.id === post.channelId) ?? null;

const visibleMedia = (media?: Array<{ kind: "image"; url: string }>) =>
  (media ?? []).map((asset, index) => ({
    id: createId(`media-${index + 1}`),
    kind: asset.kind,
    url: clampText(asset.url),
  }));

const normalizeContentType = (value: string | undefined) => clampText(value).split(";")[0].toLowerCase();

const extensionForContentType = (contentType: string) => MEDIA_EXTENSIONS[normalizeContentType(contentType)] ?? "";

const createMediaUrl = (fileName: string) => `/media/${fileName}`;

const createAbsoluteMediaUrl = (request: FastifyRequest, fileName: string) => {
  const host = clampText(getHeaderValue(request.headers["host"]));
  if (!host) {
    return createMediaUrl(fileName);
  }

  return `${request.protocol}://${host}${createMediaUrl(fileName)}`;
};

const safeMediaFileName = (fileName: string) => {
  const baseName = basename(fileName);
  if (!baseName || baseName !== fileName || baseName.includes("..")) {
    throw badRequest("Invalid media file name.");
  }

  return baseName;
};

const parseBase64Media = (body: MediaUploadJsonBody) => {
  const normalized = clampText(body.base64);
  if (!normalized) {
    throw badRequest("base64 payload is required for JSON media uploads.");
  }

  const rawBase64 = normalized.includes(",") ? normalized.split(",").at(-1) ?? "" : normalized;
  const buffer = Buffer.from(rawBase64, "base64");
  if (!buffer.length) {
    throw badRequest("Uploaded media could not be decoded.");
  }

  return buffer;
};

const persistMediaUpload = async (input: {
  body: Buffer | MediaUploadJsonBody;
  contentType: string;
  originalFileName?: string;
}) => {
  const buffer = Buffer.isBuffer(input.body) ? input.body : parseBase64Media(input.body);
  if (!buffer.length) {
    throw badRequest("Uploaded media cannot be empty.");
  }

  const headerContentType = normalizeContentType(input.contentType);
  const embeddedContentType = Buffer.isBuffer(input.body) ? "" : normalizeContentType(input.body.contentType);
  const mimeType =
    headerContentType && headerContentType !== "application/json" && headerContentType !== "application/octet-stream"
      ? headerContentType
      : embeddedContentType;
  const extension = extensionForContentType(mimeType);
  if (!extension) {
    throw badRequest("Only image uploads are supported.");
  }

  const mediaId = createId("media");
  const fileName = `${mediaId}${extension}`;
  const filePath = resolve(MEDIA_UPLOADS_DIR, fileName);

  await mkdir(MEDIA_UPLOADS_DIR, { recursive: true });
  await writeFile(filePath, buffer);

  const asset: StoredMediaAsset = {
    id: mediaId,
    kind: "image",
    fileName,
    contentType: mimeType,
    byteLength: buffer.byteLength,
    sourceFileName: clampText(input.originalFileName) || undefined,
    url: createMediaUrl(fileName),
  };

  return asset;
};

const moderationLabel = (action: ModerationActionBody["action"]) => {
  if (action === "block") return "blocked";
  if (action === "flag") return "flagged";
  return "visible";
};

const compactMetadata = (metadata: Record<string, unknown>) =>
  Object.entries(metadata).reduce<Record<string, unknown>>((accumulator, [key, value]) => {
    if (value === "" || value === undefined || value === null) {
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});

const BACKOFFICE_ROLE_LEVEL: Record<BackofficeRole, number> = {
  moderator: 1,
  admin: 2,
  owner: 3,
};

const isLoopbackHost = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

const isLoopbackAddress = (address: string | undefined) =>
  address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";

const fakePaymentsEnabled = (request: FastifyRequest) => {
  const hostHeader = clampText(getHeaderValue(request.headers["host"]));
  const hostname = hostHeader.split(":")[0].trim().toLowerCase();

  return process.env.ALLOW_FAKE_PAYMENTS === "true" && (isLoopbackHost(hostname) || isLoopbackAddress(request.ip));
};

const assertProviderEnabled = (request: FastifyRequest, provider: "fake" | "stripe") => {
  if (provider === "fake" && !fakePaymentsEnabled(request)) {
    throw forbidden("Fake payments are disabled for this environment.");
  }
};

const BACKOFFICE_ROLE_PERMISSIONS: Record<
  BackofficeRole,
  {
    sections: string[];
    actions: string[];
  }
> = {
  moderator: {
    sections: ["dashboard", "reports", "moderation", "audit"],
    actions: ["reports.read", "moderation.review", "audit.read"],
  },
  admin: {
    sections: ["dashboard", "reports", "moderation", "audit", "creators", "ledger", "payouts", "channels", "flags"],
    actions: [
      "reports.read",
      "moderation.review",
      "audit.read",
      "creator.review",
      "ledger.read",
      "payout.create",
      "channel.manage",
      "flags.manage",
      "security.override",
    ],
  },
  owner: {
    sections: ["dashboard", "reports", "moderation", "audit", "creators", "ledger", "payouts", "channels", "flags", "roles"],
    actions: [
      "reports.read",
      "moderation.review",
      "audit.read",
      "creator.review",
      "ledger.read",
      "payout.create",
      "channel.manage",
      "flags.manage",
      "roles.manage",
      "security.override",
    ],
  },
};

const normalizeBackofficeRole = (value: string | undefined): BackofficeRole | null => {
  if (value === "moderator" || value === "admin" || value === "owner") {
    return value;
  }

  return null;
};

const requireBackofficeActor = (
  request: FastifyRequest,
  minimumRole: BackofficeRole = "moderator"
): BackofficeActor => {
  const id = clampText(getHeaderValue(request.headers["x-admin-id"] ?? request.headers["x-backoffice-id"]));
  const role = normalizeBackofficeRole(
    clampText(getHeaderValue(request.headers["x-admin-role"] ?? request.headers["x-backoffice-role"])).toLowerCase()
  );

  if (!id || !role) {
    throw unauthorized("Backoffice authentication headers are required.", {
      expectedHeaders: ["x-admin-id", "x-admin-role"],
      supportedAliases: ["x-backoffice-id", "x-backoffice-role"],
    });
  }

  if (BACKOFFICE_ROLE_LEVEL[role] < BACKOFFICE_ROLE_LEVEL[minimumRole]) {
    throw forbidden("Backoffice role is not allowed for this action.", {
      minimumRole,
      role,
    });
  }

  return { id, role };
};

const createBackofficeMetadata = (actor: BackofficeActor, metadata: Record<string, unknown>) =>
  compactMetadata({
    actorId: actor.id,
    actorRole: actor.role,
    ...metadata,
  });

const clearInstallSecurityState = (store: ApiStore, installIdentityId: string) => {
  const clearedRestrictions = clearInstallRestrictions(store, { installIdentityId }).length;
  let clearedRateLimitCounters = 0;

  for (const key of Object.keys(store.rateLimitCounters)) {
    if (!key.includes(`install:${installIdentityId}`)) {
      continue;
    }

    delete store.rateLimitCounters[key];
    clearedRateLimitCounters += 1;
  }

  const clearedRiskState = Boolean(store.deviceRiskState[installIdentityId]);
  delete store.deviceRiskState[installIdentityId];

  return {
    clearedRateLimitCounters,
    clearedRestrictions,
    clearedRiskState,
  };
};

const INSTALL_AUTH_ROUTE_PATHS = new Set([
  "/feed",
  "/channels",
  "/channels/:slug",
  "/search",
  "/account/me",
  "/account/profile",
  "/account/channel-preferences",
  "/me",
  "/notifications",
  "/notifications/read-all",
  "/media/uploads",
  "/posts",
  "/posts/:postId",
  "/replies",
  "/votes",
  "/chat/requests",
  "/chat/messages",
  "/chat/requests/respond",
  "/reports",
  "/wallet",
  "/wallet/topups",
  "/tips",
  "/plus/checkout",
  "/creator/apply",
  "/creator/status",
  "/earnings",
]);

const getRequestAccessToken = (request: FastifyRequest) => {
  const authorizationHeader = clampText(getHeaderValue(request.headers.authorization));
  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice(7).trim();
  }

  return clampText(getHeaderValue(request.headers["x-install-token"]));
};

const getRequestRoutePath = (request: FastifyRequest) =>
  clampText((request.routeOptions as { url?: string } | undefined)?.url).split("?")[0];

const requireInstallSession = (store: ApiStore, request: FastifyRequest) => {
  const accessToken = getRequestAccessToken(request);
  if (!accessToken) {
    throw unauthorized("Install authentication is required.", {
      expectedHeaders: ["x-install-token", "authorization"],
    });
  }

  const session = authenticateInstallSession(store, accessToken);
  if (!session) {
    throw unauthorized("Install session is invalid or expired.");
  }

  setCurrentInstallIdentity(store, session.installIdentityId);
  return session;
};

const maskEmail = (email: string) => {
  const [localPart, domainPart] = email.split("@");
  if (!localPart || !domainPart) {
    return email;
  }

  const visibleStart = localPart.slice(0, 2);
  return `${visibleStart}${"*".repeat(Math.max(localPart.length - 2, 1))}@${domainPart}`;
};

const getInstallIdentityForRequest = (store: ApiStore, request: FastifyRequest) => {
  const session = requireInstallSession(store, request);
  const installIdentity = getInstallIdentityById(store, session.installIdentityId);
  if (!installIdentity) {
    throw unauthorized("Install identity no longer exists.");
  }
  setCurrentInstallIdentity(store, installIdentity.id);

  return {
    account: getAccountById(store, installIdentity.accountId),
    installIdentity,
    session,
  };
};

const buildAccountIdentity = (store: ApiStore, account: Account, profile: AccountProfile) => ({
  id: account.id,
  channelPreferences: Object.values(store.accountChannelPreferences)
    .filter((entry) => entry.accountId === account.id)
    .sort((left, right) => left.cityId.localeCompare(right.cityId)),
  username: account.username,
  displayName: profile.displayName,
  discoverable: account.discoverable,
  emailMasked: maskEmail(account.emailNormalized),
  emailVerified: Boolean(account.emailVerifiedAt),
  linkedInstallCount: store.accountLinks.filter((link) => link.accountId === account.id && link.unlinkedAt === null).length,
  createdAt: account.createdAt,
  lastSeenAt: account.lastSeenAt,
});

const buildAccountIdentityForInstall = (store: ApiStore, installIdentityId: string) => {
  const account = getAccountForInstallIdentity(store, installIdentityId);
  if (!account) {
    return null;
  }

  const profile = getAccountProfile(store, account.id);
  if (!profile) {
    return null;
  }

  return buildAccountIdentity(store, account, profile);
};

const getLinkedInstallIdentities = (store: ApiStore, installIdentityId: string) => {
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  if (!installIdentity) {
    return [];
  }

  if (!installIdentity.accountId) {
    return [installIdentity];
  }

  return store.installIdentities.filter((entry) => entry.accountId === installIdentity.accountId);
};

const getPrimaryLinkedInstallForAccountId = (store: ApiStore, accountId: string) => {
  const latestLink =
    [...store.accountLinks]
      .filter((link) => link.accountId === accountId && link.unlinkedAt === null)
      .sort((left, right) => right.linkedAt.localeCompare(left.linkedAt))[0] ?? null;

  if (latestLink) {
    return getInstallIdentityById(store, latestLink.installIdentityId);
  }

  return store.installIdentities.find((entry) => entry.accountId === accountId) ?? null;
};

const createInstallAnonLabel = (installIdentityId: string) => {
  const normalized = installIdentityId.trim().toLowerCase();
  const digest = createHash("sha256").update(normalized).digest("hex");
  const suffix = (Number.parseInt(digest.slice(0, 8), 16) % 90) + 10;
  return `Anon ${String(suffix).padStart(2, "0")}`;
};

const getEffectivePlusEntitlement = (store: ApiStore, installIdentityId: string) => {
  const linkedInstalls = getLinkedInstallIdentities(store, installIdentityId);
  return linkedInstalls.find((entry) => entry.plus.active)?.plus ?? getInstallIdentityById(store, installIdentityId)?.plus ?? toPlusEntitlement(false);
};

const syncPlusAcrossLinkedInstalls = (store: ApiStore, installIdentityId: string, plus: ReturnType<typeof toPlusEntitlement>) => {
  getLinkedInstallIdentities(store, installIdentityId).forEach((entry) => {
    entry.plus = plus;
  });

  setCurrentInstallIdentity(store, installIdentityId);
  return plus;
};

const migrateInstallStateToAccount = (
  store: ApiStore,
  params: {
    account: Account;
    installIdentityId: string;
    profile: AccountProfile;
  }
) => {
  const { account, installIdentityId, profile } = params;
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  if (!installIdentity) {
    return;
  }

  const installWallet = getWallet(store, installIdentityId);
  const accountWallet = getWallet(store, getWalletOwnerId(store, installIdentityId));
  if (getWalletOwnerId(store, installIdentityId) !== installIdentityId) {
    accountWallet.availableCents += installWallet.availableCents;
    accountWallet.pendingCents += installWallet.pendingCents;
    accountWallet.lifetimeTippedCents += installWallet.lifetimeTippedCents;
    accountWallet.lifetimeEarnedCents += installWallet.lifetimeEarnedCents;
    accountWallet.lifetimePaidOutCents += installWallet.lifetimePaidOutCents;

    installWallet.availableCents = 0;
    installWallet.pendingCents = 0;
    installWallet.lifetimeTippedCents = 0;
    installWallet.lifetimeEarnedCents = 0;
    installWallet.lifetimePaidOutCents = 0;
  }

  store.ledger.forEach((entry) => {
    if (entry.installIdentityId === installIdentityId && entry.installIdentityId !== "platform" && !entry.accountId) {
      entry.accountId = account.id;
    }
  });

  store.walletTopups.forEach((entry) => {
    if (entry.installIdentityId === installIdentityId && !entry.accountId) {
      entry.accountId = account.id;
    }
  });

  store.tips.forEach((tip) => {
    if (tip.senderInstallIdentityId === installIdentityId && !tip.senderAccountId) {
      tip.senderAccountId = account.id;
    }
    if (tip.recipientInstallIdentityId === installIdentityId && !tip.recipientAccountId) {
      tip.recipientAccountId = account.id;
    }
  });

  store.posts.forEach((post) => {
    if (post.recipientInstallIdentityId === installIdentityId) {
      post.accountId = account.id;
      post.accountUsername = account.username;
      post.accountDisplayName = profile.displayName;
    }
  });

  store.replies.forEach((reply) => {
    if (reply.recipientInstallIdentityId === installIdentityId) {
      reply.accountId = account.id;
      reply.accountUsername = account.username;
      reply.accountDisplayName = profile.displayName;
    }
  });

  store.reports.forEach((report) => {
    if (report.reporterInstallIdentityId === installIdentityId && !report.accountId) {
      report.accountId = account.id;
    }
  });

  store.notifications.forEach((notification) => {
    if (notification.installIdentityId === installIdentityId && !notification.accountId) {
      notification.accountId = account.id;
    }
  });

  store.moderationCases.forEach((caseItem) => {
    if (!caseItem.accountId && store.reports.some((report) => report.moderationCaseId === caseItem.id && report.reporterInstallIdentityId === installIdentityId)) {
      caseItem.accountId = account.id;
    }
  });

  store.chatRequests.forEach((request) => {
    if (request.fromInstallIdentityId === installIdentityId && !request.fromAccountId) {
      request.fromAccountId = account.id;
    }
    if (request.toInstallIdentityId === installIdentityId && !request.toAccountId) {
      request.toAccountId = account.id;
    }
  });

  store.chatMessages.forEach((message) => {
    if (message.senderInstallIdentityId === installIdentityId && !message.accountId) {
      message.accountId = account.id;
    }
  });

  if (store.creatorApplication.installIdentityId === installIdentityId) {
    store.creatorApplication.accountId = account.id;
    store.creatorApplication.accountUsername = account.username;
    store.creatorApplication.accountDisplayName = profile.displayName;
  }

  const effectivePlus = getEffectivePlusEntitlement(store, installIdentityId);
  syncPlusAcrossLinkedInstalls(store, installIdentityId, effectivePlus);
  syncCurrentWallet(store);
};

const requireAccountForRequest = (store: ApiStore, request: FastifyRequest) => {
  const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
  if (!account) {
    throw unauthorized("Account link is required for this route.");
  }

  const profile = getAccountProfile(store, account.id);
  if (!profile) {
    throw unauthorized("Account profile is missing.");
  }

  return {
    account,
    accountIdentity: buildAccountIdentity(store, account, profile),
    installIdentity,
    profile,
    session,
  };
};

const resolveUsernameCandidate = (store: ApiStore, usernameOrEmail: string) => {
  const rawBase = normalizeUsername(usernameOrEmail) || "nuudl";
  const base = rawBase.length >= 3 ? rawBase.slice(0, 24) : `${rawBase}${"123".slice(rawBase.length)}`;
  let candidate = base;
  let suffix = 1;

  while (findAccountByUsername(store, candidate)) {
    const suffixValue = `${suffix}`;
    candidate = `${base.slice(0, Math.max(3, 24 - suffixValue.length - 1))}_${suffixValue}`;
    suffix += 1;
  }

  return candidate;
};

const resolveRequestedUsername = (
  store: ApiStore,
  params: { email: string; displayName?: string; username?: string }
) => {
  const normalizedRequested = normalizeUsername(clampText(params.username));
  if (normalizedRequested) {
    return normalizedRequested;
  }

  const normalizedDisplayName = normalizeUsername(clampText(params.displayName));
  if (normalizedDisplayName) {
    return resolveUsernameCandidate(store, normalizedDisplayName);
  }

  return resolveUsernameCandidate(store, params.email.split("@")[0] ?? params.email);
};

const getOwnerLedgerEntries = (store: ApiStore, installIdentityId: string) => {
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  const accountId = installIdentity?.accountId;

  return store.ledger.filter((entry) => {
    if (entry.installIdentityId === "platform") {
      return true;
    }

    if (accountId) {
      return entry.accountId === accountId || entry.installIdentityId === installIdentityId;
    }

    return entry.installIdentityId === installIdentityId;
  });
};

const getOwnerTips = (store: ApiStore, installIdentityId: string) => {
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  const accountId = installIdentity?.accountId;

  return store.tips.filter((tip) => {
    if (accountId) {
      return (
        tip.senderAccountId === accountId ||
        tip.recipientAccountId === accountId ||
        tip.senderInstallIdentityId === installIdentityId ||
        tip.recipientInstallIdentityId === installIdentityId
      );
    }

    return tip.senderInstallIdentityId === installIdentityId || tip.recipientInstallIdentityId === installIdentityId;
  });
};

const getOwnerTopups = (store: ApiStore, installIdentityId: string) => {
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  const accountId = installIdentity?.accountId;

  return store.walletTopups.filter((entry) => {
    if (accountId) {
      return entry.accountId === accountId || entry.installIdentityId === installIdentityId;
    }

    return entry.installIdentityId === installIdentityId;
  });
};

const areChatParticipantsVisibleToInstall = (store: ApiStore, installIdentityId: string, chatRequest: ChatRequest) => {
  if (chatRequest.fromInstallIdentityId === installIdentityId || chatRequest.toInstallIdentityId === installIdentityId) {
    return true;
  }

  const currentAccountId = getAccountForInstallIdentity(store, installIdentityId)?.id;
  if (!currentAccountId) {
    return false;
  }

  return [chatRequest.fromInstallIdentityId, chatRequest.toInstallIdentityId].some(
    (participantInstallIdentityId) => getAccountForInstallIdentity(store, participantInstallIdentityId)?.id === currentAccountId
  );
};

const isOwnChatMessageForViewer = (
  store: ApiStore,
  params: {
    accountId?: string | null;
    installIdentityId: string;
    message: ChatMessage;
  }
) => {
  if (params.message.senderInstallIdentityId === params.installIdentityId) {
    return true;
  }

  if (!params.accountId) {
    return false;
  }

  if (params.message.accountId === params.accountId) {
    return true;
  }

  return getAccountForInstallIdentity(store, params.message.senderInstallIdentityId)?.id === params.accountId;
};

const createChatMessagePreview = (message: ChatMessage | null) => {
  if (!message) {
    return undefined;
  }

  const trimmedBody = clampText(message.body);
  if (trimmedBody) {
    return truncatePreview(trimmedBody, 72);
  }

  if (message.media.length) {
    return message.media.length > 1 ? `${message.media.length} Bilder` : "Bild gesendet";
  }

  return "Neue Nachricht";
};

const decorateChatRequestForViewer = (
  store: ApiStore,
  params: {
    accountId?: string | null;
    installIdentityId: string;
    request: ChatRequest;
  }
): ChatRequest => {
  const relatedPost = store.posts.find((post) => post.id === params.request.postId) ?? null;
  const messages = store.chatMessages
    .filter((message) => message.chatRequestId === params.request.id)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const lastMessage = messages.at(-1) ?? null;
  const unreadCount = messages.filter(
    (message) =>
      !message.readAt &&
      !isOwnChatMessageForViewer(store, {
        accountId: params.accountId,
        installIdentityId: params.installIdentityId,
        message,
      })
  ).length;
  const isOutgoing =
    (Boolean(params.accountId) && params.request.fromAccountId === params.accountId) ||
    params.request.fromInstallIdentityId === params.installIdentityId;

  return {
    ...params.request,
    counterpartLabel: relatedPost?.authorLabel ?? (isOutgoing ? "Person" : "Nachricht"),
    lastActivityAt: lastMessage?.createdAt ?? params.request.createdAt,
    lastMessageAt: lastMessage?.createdAt ?? undefined,
    lastMessageOwn: lastMessage
      ? isOwnChatMessageForViewer(store, {
          accountId: params.accountId,
          installIdentityId: params.installIdentityId,
          message: lastMessage,
        })
      : undefined,
    lastMessagePreview: createChatMessagePreview(lastMessage),
    unreadCount,
  };
};

const getChatRequestActivityAt = (request: ChatRequest) => request.lastActivityAt ?? request.createdAt;

const sortChatRequestsByActivity = (requests: ChatRequest[]) =>
  [...requests].sort((left, right) => getChatRequestActivityAt(right).localeCompare(getChatRequestActivityAt(left)));

type RateLimitScope = "install" | "ip" | "ip_ua";

type RateLimitRule = {
  blockMs?: number;
  errorCode?: "ACTION_TEMPORARILY_BLOCKED" | "RATE_LIMIT_EXCEEDED";
  limit: number;
  restrictionDurationMs?: number;
  restrictionType?: "chat_request_block" | "geo_switch_block" | "posting_block" | "reply_block" | "vote_block";
  riskIncrement?: number;
  scope: RateLimitScope;
  windowMs: number;
};

const hashRateLimitValue = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 24);

const getClientIpHash = (request: FastifyRequest) => {
  const forwarded = clampText(getHeaderValue(request.headers["x-forwarded-for"]));
  const rawIp = forwarded ? forwarded.split(",")[0]?.trim() ?? forwarded : request.ip;
  return hashRateLimitValue(clampText(rawIp).toLowerCase() || "unknown");
};

const getRateLimitUserAgentHash = (request: FastifyRequest) =>
  hashRateLimitValue(clampText(getHeaderValue(request.headers["user-agent"])).toLowerCase() || "unknown");

const addDuration = (milliseconds: number) => new Date(Date.now() + milliseconds).toISOString();

const GLOBAL_RATE_LIMIT_RULES: RateLimitRule[] = [
  { limit: 240, scope: "ip", windowMs: 60 * 1000 },
  { limit: 120, scope: "install", windowMs: 60 * 1000 },
];

const ROUTE_RATE_LIMITS: Record<string, RateLimitRule[]> = {
  "GET /search": [
    { limit: 10, scope: "install", windowMs: 10 * 1000 },
    { limit: 30, scope: "install", windowMs: 60 * 1000, restrictionDurationMs: 15 * 60 * 1000 },
    { limit: 100, scope: "ip", windowMs: 60 * 1000 },
  ],
  "POST /auth/refresh": [
    { limit: 4, scope: "ip", windowMs: 60 * 1000 },
    { limit: 12, scope: "ip", windowMs: 10 * 60 * 1000, blockMs: 30 * 60 * 1000, riskIncrement: 8 },
  ],
  "POST /chat/requests": [
    { limit: 4, scope: "install", windowMs: 10 * 60 * 1000, restrictionDurationMs: 60 * 60 * 1000, restrictionType: "chat_request_block" },
    { limit: 10, scope: "install", windowMs: 60 * 60 * 1000, restrictionDurationMs: 60 * 60 * 1000, restrictionType: "chat_request_block" },
  ],
  "POST /geo/resolve": [
    { limit: 3, scope: "ip", windowMs: 30 * 1000 },
    { limit: 12, scope: "install", windowMs: 10 * 60 * 1000, restrictionDurationMs: 30 * 60 * 1000, restrictionType: "geo_switch_block", riskIncrement: 8 },
    { limit: 30, scope: "ip", windowMs: 10 * 60 * 1000 },
  ],
  "POST /install/register": [
    { limit: 2, scope: "ip", windowMs: 30 * 1000, blockMs: 30 * 60 * 1000 },
    { limit: 4, scope: "ip_ua", windowMs: 10 * 60 * 1000, blockMs: 30 * 60 * 1000 },
    { limit: 8, scope: "ip", windowMs: 10 * 60 * 1000, blockMs: 30 * 60 * 1000 },
  ],
  "POST /posts": [
    { errorCode: "ACTION_TEMPORARILY_BLOCKED", limit: 2, scope: "install", windowMs: 10 * 60 * 1000, restrictionDurationMs: 60 * 60 * 1000, restrictionType: "posting_block" },
    { errorCode: "ACTION_TEMPORARILY_BLOCKED", limit: 4, scope: "install", windowMs: 60 * 60 * 1000, restrictionDurationMs: 60 * 60 * 1000, restrictionType: "posting_block", riskIncrement: 10 },
    { errorCode: "ACTION_TEMPORARILY_BLOCKED", limit: 12, scope: "install", windowMs: 24 * 60 * 60 * 1000, restrictionDurationMs: 24 * 60 * 60 * 1000, restrictionType: "posting_block", riskIncrement: 15 },
  ],
  "POST /replies": [
    { errorCode: "ACTION_TEMPORARILY_BLOCKED", limit: 4, scope: "install", windowMs: 5 * 60 * 1000, restrictionDurationMs: 30 * 60 * 1000, restrictionType: "reply_block" },
    { errorCode: "ACTION_TEMPORARILY_BLOCKED", limit: 12, scope: "install", windowMs: 60 * 60 * 1000, restrictionDurationMs: 30 * 60 * 1000, restrictionType: "reply_block", riskIncrement: 8 },
    { errorCode: "ACTION_TEMPORARILY_BLOCKED", limit: 40, scope: "install", windowMs: 24 * 60 * 60 * 1000, restrictionDurationMs: 12 * 60 * 60 * 1000, restrictionType: "reply_block", riskIncrement: 12 },
  ],
  "POST /votes": [
    { limit: 10, scope: "install", windowMs: 60 * 1000, riskIncrement: 6 },
    { limit: 30, scope: "install", windowMs: 10 * 60 * 1000, restrictionDurationMs: 60 * 60 * 1000, restrictionType: "vote_block", riskIncrement: 12 },
    { limit: 120, scope: "install", windowMs: 60 * 60 * 1000, restrictionDurationMs: 60 * 60 * 1000, restrictionType: "vote_block", riskIncrement: 12 },
  ],
};

const consumeRateLimit = (
  store: ApiStore,
  params: {
    installIdentityId?: string;
    request: FastifyRequest;
    routeName: string;
    rule: RateLimitRule;
  },
) => {
  if (params.rule.scope === "install" && !params.installIdentityId) {
    return;
  }

  const now = new Date().toISOString();
  const ipHash = getClientIpHash(params.request);
  const userAgentHash = getRateLimitUserAgentHash(params.request);
  const scopeKey =
    params.rule.scope === "install"
      ? `install:${params.installIdentityId}`
      : params.rule.scope === "ip_ua"
        ? `ip_ua:${ipHash}:${userAgentHash}`
        : `ip:${ipHash}`;
  const counterKey = `rl:${params.routeName}:${scopeKey}:${params.rule.windowMs}`;
  const counter = getRateLimitCounter(store, counterKey, now, params.rule.windowMs);

  if (counter.blockedUntil && Date.parse(counter.blockedUntil) > Date.now()) {
    throw actionTemporarilyBlocked("Too many requests. Try again later.", {
      retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(counter.blockedUntil) - Date.now()) / 1000)),
      route: params.routeName,
    });
  }

  counter.count += 1;
  if (counter.count <= params.rule.limit) {
    return;
  }

  counter.lastExceededAt = now;
  if (params.rule.blockMs) {
    counter.blockedUntil = addDuration(params.rule.blockMs);
  }

  recordAbuseEvent(store, {
    installIdentityId: params.installIdentityId,
    ipHash,
    routeName: params.routeName,
    kind: "rate_limit_exceeded",
    metadata: {
      limit: params.rule.limit,
      scope: params.rule.scope,
      windowMs: params.rule.windowMs,
    },
  });

  if (params.installIdentityId && params.rule.riskIncrement) {
    incrementRiskScore(store, params.installIdentityId, params.rule.riskIncrement, {
      routeName: params.routeName,
      scope: params.rule.scope,
    });
  }

  if (params.installIdentityId && params.rule.restrictionType && params.rule.restrictionDurationMs) {
    applyInstallRestriction(store, {
      installIdentityId: params.installIdentityId,
      type: params.rule.restrictionType,
      reasonCode: "rate_limit_exceeded",
      triggerSource: params.routeName,
      durationMs: params.rule.restrictionDurationMs,
      metadata: {
        limit: params.rule.limit,
        scope: params.rule.scope,
        windowMs: params.rule.windowMs,
      },
    });
  }

  const retryAfterSeconds = counter.blockedUntil
    ? Math.max(1, Math.ceil((Date.parse(counter.blockedUntil) - Date.now()) / 1000))
    : Math.max(1, Math.ceil((Date.parse(counter.windowEndsAt) - Date.now()) / 1000));

  if (params.rule.errorCode === "ACTION_TEMPORARILY_BLOCKED") {
    throw actionTemporarilyBlocked("Too many requests. Try again later.", {
      retryAfterSeconds,
      route: params.routeName,
    });
  }

  throw rateLimitExceeded("Too many requests. Try again later.", {
    retryAfterSeconds,
    route: params.routeName,
  });
};

const enforceRateLimits = (store: ApiStore, request: FastifyRequest, routeName: string, installIdentityId?: string) => {
  for (const rule of GLOBAL_RATE_LIMIT_RULES) {
    consumeRateLimit(store, { installIdentityId, request, routeName: "GLOBAL", rule });
  }

  for (const rule of ROUTE_RATE_LIMITS[routeName] ?? []) {
    consumeRateLimit(store, { installIdentityId, request, routeName, rule });
  }
};

const assertInstallRestriction = (
  store: ApiStore,
  installIdentityId: string,
  type: "chat_request_block" | "geo_switch_block" | "posting_block" | "read_only" | "reply_block" | "vote_block",
  routeName: string,
) => {
  const readOnly = getActiveRestriction(store, installIdentityId, "read_only");
  if (readOnly) {
    throw actionTemporarilyBlocked("This install is temporarily read-only.", {
      endsAt: readOnly.endsAt,
      route: routeName,
      type: "read_only",
    });
  }

  if (type === "read_only") {
    return;
  }

  const specificRestriction = getActiveRestriction(store, installIdentityId, type);
  if (!specificRestriction) {
    return;
  }

  throw actionTemporarilyBlocked("This action is temporarily blocked.", {
    endsAt: specificRestriction.endsAt,
    route: routeName,
    type,
  });
};

const assertInstallNotReadOnly = (store: ApiStore, installIdentityId: string, routeName: string) => {
  const readOnly = getActiveRestriction(store, installIdentityId, "read_only");
  if (readOnly) {
    throw actionTemporarilyBlocked("This install is temporarily read-only.", {
      endsAt: readOnly.endsAt,
      route: routeName,
      type: "read_only",
    });
  }
};

const getCurrentInstallIdentity = (store: ApiStore) => store.installIdentity;

const getCurrentWallet = (store: ApiStore) => {
  const wallet = getWallet(store, getWalletOwnerId(store, getCurrentInstallIdentity(store).id));
  store.wallet = wallet;
  return wallet;
};

const ONE_MINUTE_MS = 1000 * 60;
const ONE_HOUR_MS = ONE_MINUTE_MS * 60;
const ONE_DAY_MS = ONE_HOUR_MS * 24;

const hashValue = (value: string) => createHash("sha256").update(value).digest("hex");

const getRequestIpHash = (request: FastifyRequest) => {
  const forwarded = clampText(getHeaderValue(request.headers["x-forwarded-for"]));
  const ip = forwarded.split(",")[0]?.trim() || request.ip || "unknown";
  return hashValue(ip.toLowerCase());
};

const getRequestUserAgentHash = (request: FastifyRequest) => {
  const userAgent = clampText(getHeaderValue(request.headers["user-agent"])) || "unknown";
  return hashValue(userAgent.toLowerCase());
};

const normalizeContentForSpam = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/([!?.,])\1+/g, "$1");

const countUrls = (value: string) => (value.match(/https?:\/\/\S+/gi) ?? []).length;

const buildRateLimitKey = (routeName: string, dimension: string, identity: string, windowName: string) =>
  `rl:${routeName}:${dimension}:${identity}:${windowName}`;

const hitRateLimit = (
  store: ApiStore,
  routeName: string,
  dimension: string,
  identity: string,
  windowName: string,
  windowMs: number,
  limit: number,
) => {
  const nowIso = new Date().toISOString();
  const counter = getRateLimitCounter(store, buildRateLimitKey(routeName, dimension, identity, windowName), nowIso, windowMs);

  if (counter.blockedUntil && Date.parse(counter.blockedUntil) > Date.now()) {
    return {
      blocked: true,
      count: counter.count,
      retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(counter.blockedUntil) - Date.now()) / 1000)),
    };
  }

  counter.count += 1;
  if (counter.count <= limit) {
    return { blocked: false, count: counter.count, retryAfterSeconds: 0 };
  }

  counter.lastExceededAt = nowIso;
  return {
    blocked: true,
    count: counter.count,
    retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(counter.windowEndsAt) - Date.now()) / 1000)),
  };
};

const assertRouteRateLimit = (
  store: ApiStore,
  request: FastifyRequest,
  routeName: string,
  rules: Array<{ dimension: "install" | "ip" | "ua"; identity: string; windowMs: number; windowName: string; limit: number }>,
) => {
  for (const rule of rules) {
    const result = hitRateLimit(store, routeName, rule.dimension, rule.identity, rule.windowName, rule.windowMs, rule.limit);
    if (!result.blocked) {
      continue;
    }

    recordAbuseEvent(store, {
      installIdentityId: rule.dimension === "install" ? rule.identity : undefined,
      ipHash: rule.dimension === "ip" ? rule.identity : getRequestIpHash(request),
      kind: "rate_limit_exceeded",
      routeName,
      metadata: {
        dimension: rule.dimension,
        limit: rule.limit,
        count: result.count,
        retryAfterSeconds: result.retryAfterSeconds,
        windowName: rule.windowName,
      },
    });

    throw rateLimitExceeded("Too many requests. Try again later.", {
      retryAfterSeconds: result.retryAfterSeconds,
      route: routeName,
      windowName: rule.windowName,
    });
  }
};

const assertRestrictionClear = (
  store: ApiStore,
  installIdentityId: string,
  routeName: string,
  types: Array<"posting_block" | "reply_block" | "vote_block" | "chat_request_block" | "geo_switch_block" | "read_only">,
) => {
  for (const type of types) {
    const restriction = getActiveRestriction(store, installIdentityId, type);
    if (!restriction) {
      continue;
    }

    throw actionTemporarilyBlocked("Action temporarily blocked.", {
      endsAt: restriction.endsAt,
      reasonCode: restriction.reasonCode,
      route: routeName,
      restrictionType: type,
    });
  }
};

const applyActionRestriction = (
  store: ApiStore,
  installIdentityId: string,
  routeName: string,
  type: "posting_block" | "reply_block" | "vote_block" | "chat_request_block" | "geo_switch_block",
  durationMs: number,
  reasonCode: string,
  metadata: Record<string, unknown> = {},
) => {
  const restriction = applyInstallRestriction(store, {
    installIdentityId,
    type,
    reasonCode,
    triggerSource: routeName,
    durationMs,
    metadata,
  });

  recordAbuseEvent(store, {
    installIdentityId,
    routeName,
    kind: "restriction_applied",
    metadata: {
      ...metadata,
      endsAt: restriction.endsAt,
      restrictionType: type,
      reasonCode,
    },
  });

  return restriction;
};

const assertPostCooldown = (store: ApiStore, installIdentityId: string) => {
  const latestOwnPost = store.posts.find((post) => post.recipientInstallIdentityId === installIdentityId);
  if (!latestOwnPost) {
    return;
  }

  const cooldownEndsAt = Date.parse(latestOwnPost.createdAt) + 1000 * 120;
  if (cooldownEndsAt <= Date.now()) {
    return;
  }

  throw actionTemporarilyBlocked("Please wait before posting again.", {
    retryAfterSeconds: Math.max(1, Math.ceil((cooldownEndsAt - Date.now()) / 1000)),
    route: "POST /posts",
  });
};

const assertReplyCooldown = (store: ApiStore, installIdentityId: string) => {
  const latestOwnReply = store.replies.find((reply) => reply.recipientInstallIdentityId === installIdentityId);
  if (!latestOwnReply) {
    return;
  }

  const cooldownEndsAt = Date.parse(latestOwnReply.createdAt) + 1000 * 20;
  if (cooldownEndsAt <= Date.now()) {
    return;
  }

  throw actionTemporarilyBlocked("Please wait before replying again.", {
    retryAfterSeconds: Math.max(1, Math.ceil((cooldownEndsAt - Date.now()) / 1000)),
    route: "POST /replies",
  });
};

const assertNoDuplicatePost = (store: ApiStore, installIdentityId: string, body: string) => {
  const normalized = normalizeContentForSpam(body);
  const duplicate = store.posts.find((post) => {
    if (post.recipientInstallIdentityId !== installIdentityId) {
      return false;
    }

    if (Date.parse(post.createdAt) < Date.now() - ONE_DAY_MS) {
      return false;
    }

    return normalizeContentForSpam(post.body) === normalized;
  });

  if (duplicate) {
    throw spamDetected("Duplicate post detected.", {
      route: "POST /posts",
      duplicatePostId: duplicate.id,
    });
  }
};

const assertNoDuplicateReply = (store: ApiStore, installIdentityId: string, postId: string, body: string) => {
  const normalized = normalizeContentForSpam(body);
  const duplicate = store.replies.find((reply) => {
    if (reply.recipientInstallIdentityId !== installIdentityId) {
      return false;
    }

    const createdAt = Date.parse(reply.createdAt);
    const samePostDuplicate = reply.postId === postId && createdAt >= Date.now() - ONE_DAY_MS;
    const sameBodyRecent = createdAt >= Date.now() - ONE_HOUR_MS * 2;

    if (!samePostDuplicate && !sameBodyRecent) {
      return false;
    }

    return normalizeContentForSpam(reply.body) === normalized;
  });

  if (duplicate) {
    throw spamDetected("Duplicate reply detected.", {
      duplicateReplyId: duplicate.id,
      route: "POST /replies",
    });
  }
};

const applyVote = (
  store: ApiStore,
  body: VoteBody,
  actor: { accountId?: string | null; installIdentityId: string }
) => {
  const target = getTargetByType(store, body.targetType, body.targetId);
  if (!target) {
    throw notFound("Target not found.");
  }

  const actorKey = actor.accountId ?? actor.installIdentityId;
  const key = `${actorKey}:${voteKey(body.targetType, body.targetId)}`;
  const previousVote = store.votes[key]?.value ?? 0;
  const nextVote = body.value;
  const delta = nextVote - previousVote;

  target.score += delta;

  if (nextVote === 0) {
    delete store.votes[key];
  } else {
    store.votes[key] = {
      targetId: body.targetId,
      targetType: body.targetType,
      value: nextVote,
      aggregateScore: target.score,
    };
  }

  const recipient = {
    accountId: target.accountId,
    installIdentityId: target.recipientInstallIdentityId,
  };
  const targetRoute = body.targetType === "post" ? `/post/${body.targetId}` : `/post/${"postId" in target ? target.postId : body.targetId}`;

  if (nextVote !== 0 && previousVote !== nextVote && !isNotificationRecipientActor(actor, recipient)) {
    createSystemNotification(
      store,
      body.targetType === "post" ? "Jemand hat auf deinen Beitrag reagiert." : "Jemand hat auf deine Antwort reagiert.",
      "vote",
      targetRoute,
      recipient.accountId,
      recipient.installIdentityId,
    );
  }

  return {
    aggregateScore: target.score,
    targetId: body.targetId,
    targetType: body.targetType,
    value: nextVote,
  };
};

const withIdempotency = async <T>({
  body,
  handler,
  request,
  reply,
  scope,
  statusCode,
  store,
}: {
  body: unknown;
  handler: () => Promise<T> | T;
  request: FastifyRequest;
  reply: FastifyReply;
  scope: string;
  statusCode: number;
  store: ApiStore;
}): Promise<T> => {
  const idempotencyKey = getIdempotencyKey(request.headers["idempotency-key"]);

  if (idempotencyKey) {
    const replay = maybeReplayedResponse<T>(store, scope, idempotencyKey, body);
    if (replay) {
      reply.header("Idempotency-Replayed", "true");
      reply.code(replay.statusCode);
      return replay.response;
    }
  }

  const response = await handler();

  if (idempotencyKey) {
    sendIdempotentResponse(store, scope, idempotencyKey, body, statusCode, response);
  }

  reply.code(statusCode);
  return response;
};

const createSystemNotification = (
  store: ApiStore,
  message: string,
  kind: "system" | "moderation" | "tip" | "chat_request" | "reply" | "vote" = "system",
  targetRoute?: string,
  accountId?: string | null,
  installIdentityId?: string | null
) => {
  store.notifications.unshift({
    accountId: accountId ?? undefined,
    id: createId("notif"),
    installIdentityId: installIdentityId ?? undefined,
    kind,
    message,
    read: false,
    createdAt: new Date().toISOString(),
    targetRoute,
  });
};

type AdminTargetPreview = {
  authorLabel?: string;
  body?: string;
  channelLabel?: string;
  cityId?: string;
  createdAt?: string;
  mediaCount?: number;
  moderation?: string;
  subtitle: string;
  targetId: string;
  targetType: ModerationCase["targetType"];
  title: string;
};

const truncatePreview = (value: string, maxLength = 220) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;

const getChannelLabel = (store: ApiStore, channelId: string | null | undefined) => {
  if (!channelId) {
    return "Kein Channel";
  }

  const channel = store.channels.find((entry) => entry.id === channelId) ?? null;
  return channel ? `@${channel.slug}` : channelId;
};

const createAdminTargetPreview = (
  store: ApiStore,
  targetType: ModerationCase["targetType"],
  targetId: string
): AdminTargetPreview => {
  if (targetType === "post") {
    const post = store.posts.find((entry) => entry.id === targetId) ?? null;
    if (!post) {
      return {
        targetType,
        targetId,
        title: "Beitrag nicht gefunden",
        subtitle: targetId,
      };
    }

    return {
      authorLabel: post.authorLabel,
      body: truncatePreview(post.body),
      channelLabel: getChannelLabel(store, post.channelId),
      cityId: post.cityId,
      createdAt: post.createdAt,
      mediaCount: post.media.length,
      moderation: post.moderation,
      subtitle: `${post.authorLabel} • ${getChannelLabel(store, post.channelId)} • ${post.cityId}`,
      targetId,
      targetType,
      title: "Gemeldeter Beitrag",
    };
  }

  if (targetType === "reply") {
    const reply = store.replies.find((entry) => entry.id === targetId) ?? null;
    if (!reply) {
      return {
        targetType,
        targetId,
        title: "Antwort nicht gefunden",
        subtitle: targetId,
      };
    }

    const post = store.posts.find((entry) => entry.id === reply.postId) ?? null;
    return {
      authorLabel: reply.authorLabel,
      body: truncatePreview(reply.body),
      cityId: post?.cityId,
      createdAt: reply.createdAt,
      mediaCount: 0,
      moderation: reply.moderation,
      subtitle: `${reply.authorLabel} • in ${post ? post.id : reply.postId}`,
      targetId,
      targetType,
      title: "Gemeldete Antwort",
    };
  }

  if (targetType === "chat") {
    const chatMessage = store.chatMessages.find((entry) => entry.id === targetId) ?? null;
    const chatRequest = chatMessage
      ? store.chatRequests.find((entry) => entry.id === chatMessage.chatRequestId) ?? null
      : store.chatRequests.find((entry) => entry.id === targetId) ?? null;

    if (!chatMessage && !chatRequest) {
      return {
        targetType,
        targetId,
        title: "Chat-Inhalt nicht gefunden",
        subtitle: targetId,
      };
    }

    return {
      body: truncatePreview(chatMessage?.body ?? "Keine Textnachricht gespeichert."),
      createdAt: chatMessage?.createdAt ?? chatRequest?.createdAt,
      mediaCount: chatMessage?.media.length ?? 0,
      subtitle: chatRequest
        ? `${chatRequest.fromInstallIdentityId} → ${chatRequest.toInstallIdentityId}`
        : "Chat-Kontext verfuegbar",
      targetId,
      targetType,
      title: "Gemeldeter Chat",
    };
  }

  if (targetType === "user") {
    const activeRestrictions = store.installRestrictions.filter(
      (entry) => entry.installIdentityId === targetId && Date.parse(entry.endsAt) > Date.now()
    );

    return {
      body:
        activeRestrictions.length > 0
          ? `Aktive Einschraenkungen: ${activeRestrictions.map((entry) => entry.type).join(", ")}`
          : "Keine aktiven Einschraenkungen gespeichert.",
      subtitle: `Install ${targetId}`,
      targetId,
      targetType,
      title: "Gemeldeter Nutzer",
    };
  }

  if (targetType === "channel") {
    const channel = store.channels.find((entry) => entry.id === targetId || entry.slug === targetId) ?? null;
    if (!channel) {
      return {
        targetType,
        targetId,
        title: "Channel nicht gefunden",
        subtitle: targetId,
      };
    }

    return {
      body: truncatePreview(channel.description),
      cityId: channel.cityId,
      subtitle: `${channel.memberCount} Mitglieder • ${channel.isVerified ? "verifiziert" : "nicht verifiziert"}`,
      targetId,
      targetType,
      title: `Channel ${channel.title}`,
    };
  }

  return {
    targetType,
    targetId,
    title: "Zielinhalt",
    subtitle: targetId,
  };
};

const updateModerationState = (store: ApiStore, body: ModerationActionBody, actor: BackofficeActor) => {
  const caseItem = store.moderationCases.find((item) => item.id === body.caseId);
  if (!caseItem) {
    throw notFound("Moderation case not found.");
  }

  const target = getTargetByType(store, caseItem.targetType as "post" | "reply", caseItem.targetId);
  const targetModeration = moderationLabel(body.action);

  caseItem.status = body.action === "block" ? "actioned" : "reviewed";
  caseItem.reason = `${caseItem.reason} | action: ${body.action}${body.note ? ` | note: ${body.note}` : ""}`;

  if (target) {
    target.moderation = targetModeration as Post["moderation"] | Reply["moderation"];
  }

  store.reports.forEach((report) => {
    if (report.moderationCaseId === caseItem.id) {
      report.status =
        body.action === "block"
          ? "actioned"
          : body.action === "restore"
            ? "reviewed"
            : body.action === "dismiss"
              ? "dismissed"
              : "reviewed";
      report.updatedAt = new Date().toISOString();
    }
  });

  recordAudit(store, {
    actorType: "admin",
    actorId: actor.id,
    actorRole: actor.role,
    action: `moderation.${body.action}`,
    entityType: "moderation_case",
    entityId: caseItem.id,
    summary: `Moderation case ${caseItem.id} -> ${body.action}`,
    metadata: createBackofficeMetadata(actor, {
      caseStatus: caseItem.status,
      actorRole: actor.role,
      note: body.note ?? "",
      targetId: caseItem.targetId,
      targetType: caseItem.targetType,
    }),
  });

  recordBackofficeAction(store, {
    actorId: actor.id,
    actorRole: actor.role,
    action: `moderation.${body.action}`,
    entityType: "moderation_case",
    entityId: caseItem.id,
    metadata: createBackofficeMetadata(actor, {
      caseStatus: caseItem.status,
      note: body.note ?? "",
      targetId: caseItem.targetId,
      targetType: caseItem.targetType,
    }),
  });

  createSystemNotification(store, `Moderation case ${caseItem.id} was ${body.action}.`, "moderation");

  return caseItem;
};

const assertAdultGateAccepted = (store: ApiStore) => {
  if (!store.installIdentity.adultGateAccepted) {
    throw forbidden("Adult gate must be accepted before wallet and creator actions.");
  }
};

const assertCreatorEligibility = (store: ApiStore) => {
  assertAdultGateAccepted(store);
  if (!store.installIdentity.adultVerified) {
    throw paymentRequired("Adult verification is required for creator payouts and tips.");
  }
};

const ensureWalletBalance = (wallet: WalletBalance, amountCents: number) => {
  if (wallet.availableCents < amountCents) {
    throw conflict("Insufficient wallet balance.", {
      availableCents: wallet.availableCents,
      requestedCents: amountCents,
    });
  }
};

const appendLedgerEntry = (store: ApiStore, entry: LedgerEntry) => {
  store.ledger.unshift(entry);
  return entry;
};

const createTipLedgerEntries = (
  store: ApiStore,
  params: TipBody & {
    createdAt: string;
    creatorNetCents: number;
    platformFeeCents: number;
    recipientAccountId?: string | null;
    senderAccountId?: string | null;
  }
) => {
  const senderWallet = getWallet(
    store,
    params.senderAccountId ? `account:${params.senderAccountId}` : getCurrentInstallIdentity(store).id
  );
  const recipientWallet = getWallet(
    store,
    params.recipientAccountId ? `account:${params.recipientAccountId}` : params.recipientInstallIdentityId
  );
  const net = params.creatorNetCents;

  senderWallet.availableCents = Math.max(0, senderWallet.availableCents - params.amountCents);
  senderWallet.lifetimeTippedCents += params.amountCents;
  recipientWallet.pendingCents += net;
  recipientWallet.lifetimeEarnedCents += net;

  appendLedgerEntry(store, {
    accountId: params.senderAccountId ?? undefined,
    id: createId("ledger"),
    installIdentityId: getCurrentInstallIdentity(store).id,
    kind: "tip_out",
    status: "available",
    grossCents: params.amountCents,
    platformFeeCents: params.platformFeeCents,
    netCents: -params.amountCents,
    refType: params.targetType,
    refId: params.targetId,
    createdAt: params.createdAt,
  });

  appendLedgerEntry(store, {
    accountId: params.recipientAccountId ?? undefined,
    id: createId("ledger"),
    installIdentityId: params.recipientInstallIdentityId,
    kind: "tip_in",
    status: "pending",
    grossCents: params.amountCents,
    platformFeeCents: params.platformFeeCents,
    netCents: net,
    refType: params.targetType,
    refId: params.targetId,
    createdAt: params.createdAt,
  });

  appendLedgerEntry(store, {
    id: createId("ledger"),
    installIdentityId: "platform",
    kind: "platform_fee",
    status: "available",
    grossCents: params.platformFeeCents,
    platformFeeCents: 0,
    netCents: params.platformFeeCents,
    refType: params.targetType,
    refId: params.targetId,
    createdAt: params.createdAt,
  });
};

const ensurePostAndReplyCounters = (store: ApiStore, postId: string) => {
  const post = store.posts.find((item) => item.id === postId);
  if (post) {
    post.replyCount = store.replies.filter((reply) => reply.postId === postId && reply.moderation === "visible").length;
  }
};

const registerContentTypeParserOnce = (
  app: FastifyInstance,
  contentType: string | RegExp,
  parser: (request: FastifyRequest, body: unknown, done: (error: Error | null, body?: unknown) => void) => void,
) => {
  try {
    app.addContentTypeParser(contentType as never, { parseAs: "buffer" }, parser);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("already present")) {
      throw error;
    }
  }
};

export const registerRoutes = async (app: FastifyInstance, storeOverride?: ApiStore) => {
  const store = storeOverride ?? (await createStore());
  registerContentTypeParserOnce(app, /^image\/.+$/i, (_request, body, done) => {
    done(null, body);
  });
  installHttpGuards(app);

  app.addHook("preHandler", async (request) => {
    const routePath = getRequestRoutePath(request);
    const routeName = `${request.method.toUpperCase()} ${routePath}`;
    let installIdentityId: string | undefined;

    if (INSTALL_AUTH_ROUTE_PATHS.has(routePath)) {
      installIdentityId = requireInstallSession(store, request).installIdentityId;
    }

    enforceRateLimits(store, request, routeName, installIdentityId);
  });

  app.get("/health", async () => ({ ok: true, service: "veil-api" }));

  app.get("/me", async (request) => {
    const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
    setCurrentInstallIdentity(store, session.installIdentityId);

    return {
      account: buildAccountIdentityForInstall(store, installIdentity.id),
      cityContext: getCityById(store, installIdentity.cityId),
      creatorApplication: store.creatorApplication.accountId
        ? store.creatorApplication.accountId === account?.id
          ? store.creatorApplication
          : {
              ...store.creatorApplication,
              accountDisplayName: undefined,
              accountId: undefined,
              accountUsername: undefined,
            }
        : store.creatorApplication,
      installIdentity,
      notificationsUnreadCount: unreadNotificationCount(store, installIdentity.id),
      plus: getEffectivePlusEntitlement(store, installIdentity.id),
      wallet: getWallet(store, getWalletOwnerId(store, installIdentity.id)),
    };
  });

  app.post<{ Body: RegisterBody }>("/install/register", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /install/register",
      statusCode: 200,
      store,
      handler: async () => {
        const existingAccessToken = getRequestAccessToken(request);
        const existingSession = existingAccessToken ? authenticateInstallSession(store, existingAccessToken) : null;
        const city = request.body?.cityId
          ? getCityById(store, request.body.cityId)
          : request.body?.citySlug
            ? getCityByQuery(store, request.body.citySlug)
            : resolveCityFromCoordinates(store, request.body?.lat, request.body?.lng);

        const currentInstallIdentity = existingSession
          ? getInstallIdentityById(store, existingSession.installIdentityId)
          : null;
        const accepted = request.body?.adultGateAccepted ?? currentInstallIdentity?.adultGateAccepted ?? false;
        const installIdentity =
          currentInstallIdentity ??
          {
            ...store.installIdentity,
            accessToken: "",
            accountDisplayName: undefined,
            accountId: undefined,
            accountUsername: undefined,
            createdAt: new Date().toISOString(),
            discoverable: false,
            id: createId("install"),
            installKey: createId("install-key"),
          };

        installIdentity.adultGateAccepted = accepted;
        installIdentity.cityId = city.id;
        installIdentity.cityLabel = city.label;

        if (!currentInstallIdentity) {
          store.installIdentities.unshift(installIdentity);
        }

        setCurrentInstallIdentity(store, installIdentity.id);
        store.wallet = getWallet(store, getWalletOwnerId(store, installIdentity.id));

        recordAudit(store, {
          actorType: "install",
          actorId: installIdentity.id,
          action: "install.register",
          entityType: "install_identity",
          entityId: installIdentity.id,
          metadata: {
            cityId: city.id,
            adultGateAccepted: accepted,
          },
        });

        const sessionBundle = issueInstallSession(store, installIdentity.id);
        return {
          account: buildAccountIdentityForInstall(store, installIdentity.id),
          cityContext: city,
          installIdentity,
          session: sessionBundle,
        };
      },
    })
  );

  app.post<{ Body: RefreshBody }>("/auth/refresh", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /auth/refresh",
      statusCode: 200,
      store,
      handler: async () => {
        const providedRefreshToken = clampText(request.body?.refreshToken);
        if (!providedRefreshToken) {
          throw unauthorized("Refresh token is required.");
        }

        const refreshTokenHash = createHash("sha256").update(providedRefreshToken).digest("hex");
        const refreshTokenRecord = store.refreshTokens.find((entry) => entry.tokenHash === refreshTokenHash) ?? null;
        if (refreshTokenRecord?.installIdentityId) {
          assertRouteRateLimit(store, request, "POST /auth/refresh", [
            {
              dimension: "install",
              identity: refreshTokenRecord.installIdentityId,
              windowMs: 15 * ONE_MINUTE_MS,
              windowName: "15m",
              limit: 6,
            },
            {
              dimension: "install",
              identity: refreshTokenRecord.installIdentityId,
              windowMs: ONE_HOUR_MS,
              windowName: "1h",
              limit: 24,
            },
          ]);
        }

        let sessionBundle: SessionTokenBundle;
        try {
          sessionBundle = rotateInstallRefreshToken(store, providedRefreshToken);
        } catch (error) {
          const message = error instanceof Error ? error.message : "refresh_invalid";
          if (message === "refresh_reused") {
            if (refreshTokenRecord?.installIdentityId) {
              recordAbuseEvent(store, {
                installIdentityId: refreshTokenRecord.installIdentityId,
                ipHash: getRequestIpHash(request),
                routeName: "POST /auth/refresh",
                kind: "refresh_reuse_detected",
                metadata: {
                  installSessionId: refreshTokenRecord.installSessionId,
                  tokenFamilyId: refreshTokenRecord.tokenFamilyId,
                  userAgentHash: getRequestUserAgentHash(request),
                },
              });
              incrementRiskScore(store, refreshTokenRecord.installIdentityId, 20, {
                kind: "refresh_reuse_detected",
                routeName: "POST /auth/refresh",
              });
            }

            throw unauthorized("Refresh token reuse detected. Session family was reset.");
          }

          recordAbuseEvent(store, {
            installIdentityId: refreshTokenRecord?.installIdentityId,
            ipHash: getRequestIpHash(request),
            routeName: "POST /auth/refresh",
            kind: "refresh_invalid",
            metadata: {
              userAgentHash: getRequestUserAgentHash(request),
            },
          });

          throw unauthorized("Refresh token is invalid.");
        }

        const installSession = store.installSessions.find((session) => session.id === sessionBundle.sessionId);
        if (!installSession) {
          throw unauthorized("Install session is no longer active.");
        }
        const installIdentity = getInstallIdentityById(store, installSession.installIdentityId);
        if (!installIdentity) {
          throw unauthorized("Install identity is no longer active.");
        }
        setCurrentInstallIdentity(store, installIdentity.id);

        recordAudit(store, {
          actorType: "install",
          actorId: installSession.installIdentityId,
          action: "auth.refresh",
          entityType: "install_session",
          entityId: installSession.id,
          metadata: {
            installSessionId: installSession.id,
            refreshTokenFamilyId: installSession.tokenFamilyId,
          },
        });

        return {
          installIdentity,
          session: sessionBundle,
        };
      },
    })
  );

  app.post<{ Body: { username?: string } }>("/account/username/check", async (request) => {
    const username = normalizeUsername(clampText(request.body?.username));
    if (!isValidUsername(username)) {
      throw validationError("Username must be 3-24 characters using letters, numbers or underscores.", {
        fieldName: "username",
      });
    }

    const existingAccount = findAccountByUsername(store, username);
    return {
      available: !existingAccount,
      normalizedUsername: username,
      reason: existingAccount ? "taken" : undefined,
      username,
    };
  });

  app.post<{ Body: AccountEmailStartBody }>("/auth/email/start", async (request) => {
    const { installIdentity } = getInstallIdentityForRequest(store, request);
    const emailNormalized = normalizeEmail(clampText(request.body?.email));
    const requestedUsername = normalizeUsername(clampText(request.body?.username));

    if (!emailNormalized.includes("@")) {
      throw validationError("A valid email address is required.", {
        fieldName: "email",
      });
    }

    if (requestedUsername && !isValidUsername(requestedUsername)) {
      throw validationError("Username must be 3-24 characters using letters, numbers or underscores.", {
        fieldName: "username",
      });
    }

    const existingAccount = findAccountByEmail(store, emailNormalized);
    const username =
      existingAccount?.username ??
      (requestedUsername ||
        resolveRequestedUsername(store, {
          email: emailNormalized,
          displayName: request.body?.displayName,
          username: request.body?.username,
        }));
    const existingByUsername = findAccountByUsername(store, username);
    if (existingByUsername && existingByUsername.emailNormalized !== emailNormalized) {
      throw conflict("Username is already reserved.");
    }

    const loginCode = startAccountLoginCode(store, {
      emailNormalized,
      installIdentityId: installIdentity.id,
      username,
    });

    return {
      challengeId: loginCode.id,
      codePreview: process.env.NODE_ENV !== "production" ? loginCode.code : undefined,
      deliveryMode: process.env.NODE_ENV !== "production" ? "stub" : "email",
      message: `Code an ${maskEmail(emailNormalized)} gesendet.`,
    };
  });

  app.post<{ Body: AccountEmailVerifyBody }>("/auth/email/verify", async (request) => {
    const { installIdentity } = getInstallIdentityForRequest(store, request);
    const emailNormalized = normalizeEmail(clampText(request.body?.email));
    const requestedUsername = normalizeUsername(clampText(request.body?.username));
    const code = clampText(request.body?.code);

    if (!code) {
      throw validationError("Verification code is required.", {
        fieldName: "code",
      });
    }

    if (!emailNormalized.includes("@")) {
      throw validationError("A valid email address is required.", {
        fieldName: "email",
      });
    }

    if (requestedUsername && !isValidUsername(requestedUsername)) {
      throw validationError("Username must be 3-24 characters using letters, numbers or underscores.", {
        fieldName: "username",
      });
    }

    const existingAccount = findAccountByEmail(store, emailNormalized);
    const username =
      existingAccount?.username ??
      (requestedUsername ||
        resolveRequestedUsername(store, {
          email: emailNormalized,
          displayName: request.body?.displayName,
          username: request.body?.username,
        }));
    const verifiedCode = verifyAccountLoginCode(store, {
      code,
      emailNormalized,
      installIdentityId: installIdentity.id,
      username,
    });

    const linked = linkInstallIdentityToAccount(store, {
      accountId: existingAccount?.id ?? installIdentity.accountId ?? "",
      displayName: clampText(request.body?.displayName) || installIdentity.accountDisplayName || existingAccount?.username || verifiedCode.username,
      discoverable: request.body?.discoverable ?? existingAccount?.discoverable ?? false,
      emailNormalized,
      installIdentityId: installIdentity.id,
      username: existingAccount?.username ?? verifiedCode.username,
    });
    migrateInstallStateToAccount(store, {
      account: linked.account,
      installIdentityId: installIdentity.id,
      profile: linked.profile,
    });
    request.body?.channelPreferences?.forEach((preferencePatch) => {
      const cityId = clampText(preferencePatch.cityId);
      if (!cityId) {
        return;
      }

      const city = getCityById(store, cityId);
      updateAccountChannelPreferencesForCity(store, linked.account.id, city.id, {
        favoriteChannelIds: preferencePatch.favoriteChannelIds,
        joinedChannelIds: preferencePatch.joinedChannelIds,
        recentChannelIds: preferencePatch.recentChannelIds,
      });
    });

    const installSession = issueInstallSession(store, installIdentity.id);
    recordAudit(store, {
      actorType: "install",
      actorId: installIdentity.id,
      action: "account.link",
      entityType: "account",
      entityId: linked.account.id,
      metadata: {
        username: linked.account.username,
      },
    });

    return {
      account: buildAccountIdentity(store, linked.account, linked.profile),
      installIdentity: linked.installIdentity,
      message: existingAccount ? "Gerät mit vorhandenem Account verknüpft." : "Account erstellt und mit diesem Gerät verknüpft.",
      session: installSession,
    };
  });

  app.post("/auth/logout", async (request) => {
    const { installIdentity, session } = getInstallIdentityForRequest(store, request);
    const previousAccountId = installIdentity.accountId ?? null;
    unlinkInstallIdentityFromAccount(store, installIdentity.id);

    recordAudit(store, {
      actorType: "install",
      actorId: session.installIdentityId,
      action: "account.logout",
      entityType: "account",
      entityId: previousAccountId ?? "guest",
      metadata: {
        previousAccountId,
      },
    });

    return {
      account: null,
      installIdentity,
      message: "Account auf diesem Gerät getrennt.",
    };
  });

  app.get("/account/me", async (request) => {
    const { installIdentity } = getInstallIdentityForRequest(store, request);
    const account = getAccountById(store, installIdentity.accountId);

    if (!account) {
      return {
        account: null,
      };
    }

    const profile = getAccountProfile(store, account.id);
    if (!profile) {
      return {
        account: null,
      };
    }

    return {
      account: buildAccountIdentity(store, account, profile),
      channelPreferences: getAccountChannelPreferencesForCity(store, account.id, installIdentity.cityId),
    };
  });

  app.patch<{ Body: AccountProfilePatchBody }>("/account/profile", async (request) => {
    const { installIdentity, session } = getInstallIdentityForRequest(store, request);
    const account = getAccountById(store, installIdentity.accountId);
    if (!account) {
      throw conflict("No linked account for this install.");
    }

    const profile = getAccountProfile(store, account.id);
    if (!profile) {
      throw notFound("Account profile not found.");
    }

    profile.displayName = clampText(request.body?.displayName) || profile.displayName;
    account.discoverable = request.body?.discoverable ?? account.discoverable;
    account.lastSeenAt = new Date().toISOString();

    store.installIdentities.forEach((entry) => {
      if (entry.accountId === account.id) {
        entry.accountDisplayName = profile.displayName;
        entry.accountUsername = account.username;
        entry.discoverable = account.discoverable;
      }
    });
    setCurrentInstallIdentity(store, session.installIdentityId);

    return {
      account: buildAccountIdentity(store, account, profile),
    };
  });

  app.get("/account/channel-preferences", async (request) => {
    const { account, installIdentity } = getInstallIdentityForRequest(store, request);
    if (!account) {
      throw conflict("No linked account for this install.");
    }

    const query = request.query as Record<string, string | undefined>;
    const city = query.cityId ? getCityById(store, query.cityId) : getCityById(store, installIdentity.cityId);
    const preferences = getAccountChannelPreferencesForCity(store, account.id, city.id);

    return {
      cityContext: city,
      preferences,
    };
  });

  app.patch<{ Body: AccountChannelPreferencesPatchBody }>("/account/channel-preferences", async (request) => {
    const { account, session } = getInstallIdentityForRequest(store, request);
    if (!account) {
      throw conflict("No linked account for this install.");
    }

    assertInstallNotReadOnly(store, session.installIdentityId, "PATCH /account/channel-preferences");

    const cityId = clampText(request.body?.cityId) || getInstallIdentityById(store, session.installIdentityId)?.cityId;
    if (!cityId) {
      throw badRequest("cityId is required.");
    }

    const city = getCityById(store, cityId);
    const preferences = updateAccountChannelPreferencesForCity(store, account.id, city.id, {
      favoriteChannelIds: request.body?.favoriteChannelIds,
      joinedChannelIds: request.body?.joinedChannelIds,
      recentChannelIds: request.body?.recentChannelIds,
    });

    return {
      cityContext: city,
      preferences,
    };
  });

  app.get("/users/search", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const needle = clampText(query.q ?? query.query).toLowerCase();

    return {
      query: needle,
      users: store.accounts
        .filter((account) => {
          const profile = getAccountProfile(store, account.id);
          return (
            (account.discoverable || profile?.isCreator) &&
            (!needle || account.username.includes(needle) || profile?.displayName.toLowerCase().includes(needle))
          );
        })
        .map((account) => {
          const profile = getAccountProfile(store, account.id);
          const linkedInstall = getPrimaryLinkedInstallForAccountId(store, account.id);
          return profile
            ? {
                accountId: account.id,
                cityId: linkedInstall?.cityId,
                cityLabel: linkedInstall?.cityLabel,
                discoverable: account.discoverable,
                displayName: profile.displayName,
                isCreator: profile.isCreator,
                username: account.username,
              }
            : null;
        })
        .filter((account): account is NonNullable<typeof account> => Boolean(account)),
    };
  });

  app.post<{ Body: ResolveBody }>("/geo/resolve", async (request) => {
    const accessToken = getRequestAccessToken(request);
    if (accessToken) {
      const session = authenticateInstallSession(store, accessToken);
      if (session) {
        assertInstallRestriction(store, session.installIdentityId, "geo_switch_block", "POST /geo/resolve");
      }
    }

    const city = request.body?.cityQuery
      ? getCityByQuery(store, request.body.cityQuery)
      : resolveCityFromCoordinates(store, request.body?.lat, request.body?.lng);

    return {
      cityContext: city,
      confidence: 0.92,
      geoLocked: true,
    };
  });

  app.get("/feed", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const accessToken = getRequestAccessToken(request);
    const session = accessToken ? authenticateInstallSession(store, accessToken) : null;
    const installIdentity = session ? getInstallIdentityById(store, session.installIdentityId) ?? getCurrentInstallIdentity(store) : getCurrentInstallIdentity(store);
    const city = query.cityId ? getCityById(store, query.cityId) : getCityById(store, installIdentity.cityId);
    const sort = (query.sort ?? "new") as "new" | "commented" | "loud";
    const posts = feedForCity(store, city.id)
      .map((post) => ({
        ...post,
        replyCount: replyCountForPost(store, post.id),
      }))
      .sort((left, right) => {
        if (sort === "commented") return right.replyCount - left.replyCount;
        if (sort === "loud") return right.score - left.score;
        return right.createdAt.localeCompare(left.createdAt);
      });

    return {
      cityContext: city,
      plus: getEffectivePlusEntitlement(store, installIdentity.id),
      posts,
      sortMode: sort,
    };
  });

  app.get("/channels", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const accessToken = getRequestAccessToken(request);
    const session = accessToken ? authenticateInstallSession(store, accessToken) : null;
    const installIdentity = session ? getInstallIdentityById(store, session.installIdentityId) ?? getCurrentInstallIdentity(store) : getCurrentInstallIdentity(store);
    const city = query.cityId ? getCityById(store, query.cityId) : getCityById(store, installIdentity.cityId);
    const account = getAccountById(store, installIdentity.accountId);
    const accountPreferences = account ? getAccountChannelPreferencesForCity(store, account.id, city.id) : null;
    const channels = applyAccountChannelPreferencesToChannels(
      store.channels.filter((channel) => channel.cityId === city.id),
      accountPreferences,
    );

    return {
      cityContext: city,
      accountPreferences,
      channels,
      joinedChannelIds: accountPreferences
        ? accountPreferences.joinedChannelIds
        : channels.filter((channel) => channel.joined).map((channel) => channel.id),
    };
  });

  app.get<{ Params: { slug: string } }>("/channels/:slug", async (request) => {
    const slug = clampText(request.params?.slug).toLowerCase();
    const channel = store.channels.find((entry) => entry.slug === slug);

    if (!channel) {
      throw notFound("Channel not found.");
    }

      const city = getCityById(store, channel.cityId);
      const accessToken = getRequestAccessToken(request);
      const session = accessToken ? authenticateInstallSession(store, accessToken) : null;
      const installIdentity = session ? getInstallIdentityById(store, session.installIdentityId) ?? getCurrentInstallIdentity(store) : getCurrentInstallIdentity(store);
      const account = getAccountById(store, installIdentity.accountId);
      const accountPreferences = account ? getAccountChannelPreferencesForCity(store, account.id, city.id) : null;
      const channelWithMembership = applyAccountChannelPreferencesToChannels([channel], accountPreferences)[0] ?? channel;
      const posts = feedForCity(store, channel.cityId)
        .filter((post) => post.channelId === channel.id)
        .map((post) => ({
          ...post,
          replyCount: replyCountForPost(store, post.id),
        }))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

      return {
        accountPreferences,
        channel: channelWithMembership,
        cityContext: city,
        posts,
      };
    });

  app.get("/search", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const accessToken = getRequestAccessToken(request);
    const session = accessToken ? authenticateInstallSession(store, accessToken) : null;
    const installIdentity = session ? getInstallIdentityById(store, session.installIdentityId) ?? getCurrentInstallIdentity(store) : getCurrentInstallIdentity(store);
    const city = query.cityId ? getCityById(store, query.cityId) : getCityById(store, installIdentity.cityId);
    const needle = query.q ?? query.query ?? "";
    const account = getAccountById(store, installIdentity.accountId);

    return {
      cityContext: city,
      query: needle,
      results: buildSearchResults(store, city.id, needle, account?.id ?? null),
    };
  });

  app.get("/posts/:postId", async (request) => {
    const params = request.params as { postId?: string };
    const postId = clampText(params.postId);
    const post = store.posts.find((item) => item.id === postId);

    if (!post) {
      throw notFound("Post not found.");
    }

    return {
      channel: getChannelForPost(store, post),
      cityContext: getCityById(store, post.cityId),
      post: {
        ...post,
        replyCount: replyCountForPost(store, post.id),
      },
      replies: visibleRepliesForPost(store, post.id),
    };
  });

  app.get("/replies", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const postId = clampText(query.postId);

    return {
      postId,
      replies: postId
        ? visibleRepliesForPost(store, postId)
      : [...store.replies]
          .filter((reply) => reply.moderation === "visible")
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    };
  });

  app.post("/media/uploads", async (request, reply) => {
    const session = requireInstallSession(store, request);
    assertInstallNotReadOnly(store, session.installIdentityId, "POST /media/uploads");
    const contentType = normalizeContentType(getHeaderValue(request.headers["content-type"]));
    const uploaded = await persistMediaUpload({
      body: request.body as Buffer | MediaUploadJsonBody,
      contentType,
      originalFileName: clampText(getHeaderValue(request.headers["x-upload-filename"])),
    });
    const asset = {
      ...uploaded,
      url: createAbsoluteMediaUrl(request, uploaded.fileName),
    };

    recordAudit(store, {
      actorType: "install",
      actorId: session.installIdentityId,
      action: "media.upload",
      entityType: "media_asset",
      entityId: asset.id,
      summary: `Media uploaded: ${asset.fileName}`,
      metadata: {
        byteLength: asset.byteLength,
        contentType: asset.contentType,
        fileName: asset.fileName,
        originalFileName: asset.sourceFileName ?? "",
      },
    });

    reply.code(201);
    return { asset };
  });

  app.get("/media/:fileName", async (request, reply) => {
    const params = request.params as { fileName?: string };
    const fileName = safeMediaFileName(clampText(params.fileName));
    const filePath = resolve(MEDIA_UPLOADS_DIR, fileName);

    try {
      await stat(filePath);
    } catch {
      throw notFound("Media asset not found.");
    }

    const extension = extname(fileName).toLowerCase();
    const contentType =
      Object.entries(MEDIA_EXTENSIONS).find(([, currentExtension]) => currentExtension === extension)?.[0] ??
      "application/octet-stream";

    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    reply.type(contentType);
    return createReadStream(filePath);
  });

  app.post<{ Body: CreatePostBody }>("/posts", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /posts",
      statusCode: 201,
      store,
      handler: async () => {
        const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
        const currentInstallIdentityId = session.installIdentityId;
        const body = clampText(request.body?.body);
        if (!body) {
          throw badRequest("Post body cannot be empty.");
        }

        assertInstallRestriction(store, currentInstallIdentityId, "posting_block", "POST /posts");
        assertPostCooldown(store, currentInstallIdentityId);
        assertNoDuplicatePost(store, currentInstallIdentityId, body);

        const tags = (request.body?.tags ?? []).map((tag) => clampText(tag).replace(/^#/, "")).filter(Boolean);
        if (tags.length > 5) {
          throw spamDetected("A post may contain at most five hashtags.", {
            route: "POST /posts",
          });
        }

        if (countUrls(body) > 2) {
          recordAbuseEvent(store, {
            installIdentityId: currentInstallIdentityId,
            ipHash: getRequestIpHash(request),
            routeName: "POST /posts",
            kind: "post_link_spam",
            metadata: {
              urlCount: countUrls(body),
            },
          });
          incrementRiskScore(store, currentInstallIdentityId, 8, {
            kind: "post_link_spam",
            routeName: "POST /posts",
          });
          throw spamDetected("Too many links in a single post.", {
            route: "POST /posts",
          });
        }

        if ((request.body?.media?.length ?? 0) > 1) {
          throw validationError("Only one image is supported in the closed beta.", {
            fieldName: "media",
            maxItems: 1,
          });
        }

        const city = getCityById(store, request.body?.cityId);
        const post: Post = {
          id: createId("post"),
          accountDisplayName: installIdentity.accountDisplayName,
          accountId: account?.id,
          accountUsername: installIdentity.accountUsername,
          cityId: city.id,
          channelId: request.body?.channelId ?? null,
          recipientInstallIdentityId: currentInstallIdentityId,
          body,
          authorLabel: createAnonLabel(),
          score: 0,
          replyCount: 0,
          createdAt: new Date().toISOString(),
          tags,
          media: visibleMedia(request.body?.media),
          tipTotalCents: 0,
          canTip: true,
          isPinned: false,
          moderation: "visible",
        };

        store.posts.unshift(post);
        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "post.create",
          entityType: "post",
          entityId: post.id,
          metadata: {
            cityId: city.id,
            channelId: post.channelId,
            tags: post.tags,
          },
        });

        return post;
      },
    })
  );

  app.post<{ Body: CreateReplyBody }>("/replies", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /replies",
      statusCode: 201,
      store,
      handler: async () => {
        const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
        const currentInstallIdentityId = session.installIdentityId;
        const body = clampText(request.body?.body);
        if (!body) {
          throw badRequest("Reply body cannot be empty.");
        }

        assertInstallRestriction(store, currentInstallIdentityId, "reply_block", "POST /replies");
        assertReplyCooldown(store, currentInstallIdentityId);

        if (countUrls(body) > 1) {
          recordAbuseEvent(store, {
            installIdentityId: currentInstallIdentityId,
            ipHash: getRequestIpHash(request),
            routeName: "POST /replies",
            kind: "reply_link_spam",
            metadata: {
              urlCount: countUrls(body),
            },
          });
          incrementRiskScore(store, currentInstallIdentityId, 6, {
            kind: "reply_link_spam",
            routeName: "POST /replies",
          });
          throw spamDetected("Too many links in a single reply.", {
            route: "POST /replies",
          });
        }

        const post = store.posts.find((item) => item.id === request.body?.postId);
        if (!post) {
          throw notFound("Post not found.");
        }

        assertNoDuplicateReply(store, currentInstallIdentityId, post.id, body);

        const replyItem: Reply = {
          id: createId("reply"),
          accountDisplayName: installIdentity.accountDisplayName,
          accountId: account?.id,
          accountUsername: installIdentity.accountUsername,
          postId: request.body.postId,
          recipientInstallIdentityId: currentInstallIdentityId,
          body,
          authorLabel: createThreadAnonLabel(post.id, currentInstallIdentityId),
          score: 0,
          createdAt: new Date().toISOString(),
          tipTotalCents: 0,
          canTip: false,
          moderation: "visible",
        };

        store.replies.unshift(replyItem);
        ensurePostAndReplyCounters(store, post.id);
        if (
          !isNotificationRecipientActor(
            { accountId: account?.id, installIdentityId: session.installIdentityId },
            {
              accountId: post.accountId,
              installIdentityId: post.recipientInstallIdentityId,
            },
          )
        ) {
          createSystemNotification(
            store,
            "Jemand hat auf deinen Beitrag geantwortet.",
            "reply",
            `/post/${post.id}`,
            post.accountId,
            post.recipientInstallIdentityId,
          );
        }
        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "reply.create",
          entityType: "reply",
          entityId: replyItem.id,
          metadata: {
            postId: post.id,
          },
        });

        return replyItem;
      },
    })
  );

  app.post<{ Body: VoteBody }>("/votes", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /votes",
      statusCode: 200,
      store,
      handler: async () => {
        const { account, session } = getInstallIdentityForRequest(store, request);
        assertInstallRestriction(store, session.installIdentityId, "vote_block", "POST /votes");

        const payload = request.body;
        if (!payload) {
          throw badRequest("Vote payload is required.");
        }

        const result = applyVote(store, payload, {
          accountId: account?.id,
          installIdentityId: session.installIdentityId,
        });
        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "vote.update",
          entityType: payload.targetType,
          entityId: payload.targetId,
          metadata: {
            aggregateScore: result.aggregateScore,
            value: payload.value,
          },
        });

        return result;
      },
    })
  );

  app.post<{ Body: ChatRequestBody }>("/chat/requests", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /chat/requests",
      statusCode: 201,
      store,
      handler: async () => {
        const { account, session } = getInstallIdentityForRequest(store, request);
        const currentInstallIdentityId = session.installIdentityId;
        assertInstallRestriction(store, currentInstallIdentityId, "chat_request_block", "POST /chat/requests");

        const targetIdentityId = requireInstallIdentityId(request.body?.toInstallIdentityId);
        if (targetIdentityId === currentInstallIdentityId) {
          throw conflict("You cannot request a chat with yourself.");
        }
        const targetAccount = getAccountForInstallIdentity(store, targetIdentityId);
        if (account?.id && targetAccount?.id === account.id) {
          throw conflict("You cannot request a chat with yourself.");
        }

        const postId = clampText(request.body?.postId) || store.posts[0]?.id || "";
        const post = store.posts.find((item) => item.id === postId);
        if (!post) {
          throw notFound("Source post not found.");
        }

        const existingRequest =
          store.chatRequests.find(
            (item) =>
              item.postId === post.id &&
              item.status !== "declined" &&
              ((item.fromAccountId && item.toAccountId && item.fromAccountId === account?.id && item.toAccountId === targetAccount?.id) ||
                (item.fromInstallIdentityId === currentInstallIdentityId && item.toInstallIdentityId === targetIdentityId) ||
                (item.toAccountId && item.fromAccountId && item.toAccountId === account?.id && item.fromAccountId === targetAccount?.id) ||
                (item.toInstallIdentityId === currentInstallIdentityId && item.fromInstallIdentityId === targetIdentityId)),
          ) ?? null;

        if (existingRequest) {
          return existingRequest;
        }

        const chatRequest: ChatRequest = {
          id: createId("chat-request"),
          fromAccountId: account?.id,
          fromInstallIdentityId: currentInstallIdentityId,
          toAccountId: targetAccount?.id,
          toInstallIdentityId: targetIdentityId,
          postId: post.id,
          status: "pending",
          createdAt: new Date().toISOString(),
        };

        store.chatRequests.unshift(chatRequest);
        createSystemNotification(
          store,
          request.body?.body?.trim() || "New chat request received.",
          "chat_request",
          `/chat/${chatRequest.id}`,
          targetAccount?.id ?? undefined,
          targetIdentityId,
        );
        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "chat.request",
          entityType: "chat_request",
          entityId: chatRequest.id,
          metadata: {
            postId: post.id,
            toInstallIdentityId: targetIdentityId,
          },
        });

        return decorateChatRequestForViewer(store, {
          accountId: account?.id,
          installIdentityId: session.installIdentityId,
          request: chatRequest,
        });
      },
    })
  );

  app.get("/chat/requests", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const status = query.status as ChatRequest["status"] | undefined;
    const { account, installIdentity } = getInstallIdentityForRequest(store, request);
    const requests = store.chatRequests.filter((item) => {
      const matchesIdentity = areChatParticipantsVisibleToInstall(store, installIdentity.id, item);
      const matchesStatus = status ? item.status === status : true;
      return matchesIdentity && matchesStatus;
    });

    return {
      requests: sortChatRequestsByActivity(
        requests.map((item) =>
          decorateChatRequestForViewer(store, {
            accountId: account?.id,
            installIdentityId: installIdentity.id,
            request: item,
          })
        ),
      ),
    };
  });

  app.post<{ Body: ChatRequestRespondBody }>("/chat/requests/respond", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /chat/requests/respond",
      statusCode: 200,
      store,
      handler: async () => {
        const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /chat/requests/respond");
        const requestItem = store.chatRequests.find((item) => item.id === request.body?.requestId);
        if (!requestItem) {
          throw notFound("Chat request not found.");
        }

        const canRespond =
          requestItem.toInstallIdentityId === installIdentity.id ||
          (Boolean(account?.id) && requestItem.toAccountId === account?.id);
        if (!canRespond) {
          throw forbidden("Only the requested side can respond to this chat.");
        }

        requestItem.status = request.body?.action === "accept" ? "accepted" : "declined";
        createSystemNotification(
          store,
          `Chat request ${requestItem.id} was ${requestItem.status}.`,
          "chat_request",
          `/chat/${requestItem.id}`,
          requestItem.fromAccountId ?? account?.id ?? undefined,
          requestItem.fromInstallIdentityId,
        );

        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: `chat.request.${requestItem.status}`,
          entityType: "chat_request",
          entityId: requestItem.id,
          metadata: {
            fromInstallIdentityId: requestItem.fromInstallIdentityId,
            postId: requestItem.postId,
          },
        });

        return decorateChatRequestForViewer(store, {
          accountId: account?.id,
          installIdentityId: session.installIdentityId,
          request: requestItem,
        });
      },
    })
  );

  app.get("/chat/messages", async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const chatRequestId = clampText(query.chatRequestId);
    if (!chatRequestId) {
      throw badRequest("chatRequestId is required.");
    }

    const { installIdentity } = getInstallIdentityForRequest(store, request);
    const chatRequest = store.chatRequests.find((item) => item.id === chatRequestId);
    if (!chatRequest) {
      throw notFound("Chat request not found.");
    }

    if (!areChatParticipantsVisibleToInstall(store, installIdentity.id, chatRequest)) {
      throw forbidden("Chat access is not allowed.");
    }

    const messages = store.chatMessages
      .filter((message) => message.chatRequestId === chatRequestId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    return {
      chatRequestId,
      messages,
    };
  });

  app.post<{ Body: ChatMessageBody }>("/chat/messages", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /chat/messages",
      statusCode: 201,
      store,
      handler: async () => {
        const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /chat/messages");
        const chatRequest = store.chatRequests.find((item) => item.id === request.body?.chatRequestId);
        if (!chatRequest) {
          throw notFound("Chat request not found.");
        }

        if (!areChatParticipantsVisibleToInstall(store, installIdentity.id, chatRequest)) {
          throw forbidden("Chat access is not allowed.");
        }

        if (chatRequest.status !== "accepted") {
          throw conflict("Chat thread is not active yet.");
        }

        const body = clampText(request.body?.body);
        if (!body) {
          throw badRequest("Message body cannot be empty.");
        }

        const message: ChatMessage = {
          accountId: account?.id,
          id: createId("chat-message"),
          chatRequestId: chatRequest.id,
          senderInstallIdentityId: session.installIdentityId,
          body,
          media: visibleMedia(request.body?.media),
          createdAt: new Date().toISOString(),
          readAt: null,
        };

        store.chatMessages.unshift(message);
        createSystemNotification(
          store,
          `New chat message in ${chatRequest.id}.`,
          "chat_request",
          `/chat/${chatRequest.id}`,
          chatRequest.fromAccountId === account?.id ? chatRequest.toAccountId : chatRequest.fromAccountId,
          chatRequest.fromAccountId === account?.id ? chatRequest.toInstallIdentityId : chatRequest.fromInstallIdentityId,
        );
        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "chat.message.create",
          entityType: "chat_message",
          entityId: message.id,
          metadata: {
            chatRequestId: chatRequest.id,
          },
        });

        return message;
      },
    })
  );

  app.get("/notifications", async (request) => {
    const { installIdentity } = getInstallIdentityForRequest(store, request);

    return {
      notifications: latestNotifications(store, installIdentity.id),
      unreadCount: unreadNotificationCount(store, installIdentity.id),
    };
  });

  app.post<{ Body: NotificationReadBody }>("/notifications/read", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /notifications/read",
      statusCode: 200,
      store,
      handler: async () => {
        const { installIdentity, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /notifications/read");
        const notificationId = clampText(request.body?.notificationId);
        if (!notificationId) {
          throw badRequest("notificationId is required.");
        }

        const notification = notificationsForActor(store, installIdentity.id).find((item) => item.id === notificationId);
        if (!notification) {
          throw notFound("Notification not found.");
        }

        notification.read = true;

        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "notifications.read",
          entityType: "notification",
          entityId: notification.id,
          metadata: {},
        });

        return {
          notifications: latestNotifications(store, installIdentity.id),
          unreadCount: unreadNotificationCount(store, installIdentity.id),
        };
      },
    })
  );

  app.post("/notifications/read-all", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /notifications/read-all",
      statusCode: 200,
      store,
      handler: async () => {
        const { installIdentity, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /notifications/read-all");
        notificationsForActor(store, installIdentity.id).forEach((notification) => {
          notification.read = true;
        });

        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "notifications.read_all",
          entityType: "notification",
          entityId: "all",
          metadata: {
            total: notificationsForActor(store, installIdentity.id).length,
          },
        });

        return {
          notifications: latestNotifications(store, installIdentity.id),
          unreadCount: 0,
        };
      },
    })
  );

  app.post<{ Body: ChatMessagesReadBody }>("/chat/messages/read", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /chat/messages/read",
      statusCode: 200,
      store,
      handler: async () => {
        const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /chat/messages/read");
        const chatRequestId = clampText(request.body?.chatRequestId);
        if (!chatRequestId) {
          throw badRequest("chatRequestId is required.");
        }

        const chatRequest = store.chatRequests.find((item) => item.id === chatRequestId);
        if (!chatRequest) {
          throw notFound("Chat request not found.");
        }

        if (!areChatParticipantsVisibleToInstall(store, installIdentity.id, chatRequest)) {
          throw forbidden("Chat not visible for this install.");
        }

        const linkedInstallIds = new Set(getLinkedInstallIdentities(store, installIdentity.id).map((entry) => entry.id));
        const readAt = new Date().toISOString();

        store.chatMessages.forEach((message) => {
          if (
            message.chatRequestId === chatRequestId &&
            !message.readAt &&
            !linkedInstallIds.has(message.senderInstallIdentityId) &&
            (!account?.id || message.accountId !== account.id)
          ) {
            message.readAt = readAt;
          }
        });

        notificationsForActor(store, installIdentity.id).forEach((notification) => {
          if (notification.kind === "chat_request" && notification.targetRoute === `/chat/${chatRequestId}`) {
            notification.read = true;
          }
        });

        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "chat.messages.read",
          entityType: "chat_request",
          entityId: chatRequestId,
          metadata: {},
        });

        return {
          chatRequestId,
          messages: store.chatMessages
            .filter((message) => message.chatRequestId === chatRequestId)
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
        };
      },
    })
  );

  app.post<{ Body: ReportBody }>("/reports", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /reports",
      statusCode: 201,
      store,
      handler: async () => {
        const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /reports");
        const reason = clampText(request.body?.reason);
        if (!reason) {
          throw badRequest("Report reason is required.");
        }

        const targetId = clampText(request.body?.targetId);
        if (!targetId) {
          throw badRequest("Report targetId is required.");
        }

        const targetType = request.body?.targetType;
        if (!targetType) {
          throw badRequest("Report targetType is required.");
        }

        const city = getCityById(store, installIdentity.cityId);
        const { moderationCase, report } = createReportRecord(store, {
          accountId: account?.id,
          cityId: city.id,
          reporterInstallIdentityId: session.installIdentityId,
          reason,
          targetId,
          targetType,
        });

        createSystemNotification(store, `Report ${report.id} opened for moderation.`, "moderation", undefined, account?.id, session.installIdentityId);
        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "report.create",
          entityType: "report",
          entityId: report.id,
          metadata: {
            moderationCaseId: moderationCase.id,
            targetType: report.targetType,
            targetId: report.targetId,
          },
        });

        return {
          moderationCase,
          report,
        };
      },
    })
  );

  app.post<{ Body: WalletTopupBody }>("/wallet/topups", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /wallet/topups",
      statusCode: 201,
      store,
      handler: async () => {
        const { account, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /wallet/topups");
        const amountCents = positiveCents(request.body?.amountCents, "amountCents", 100);
        const provider = request.body?.provider ?? "fake";
        assertProviderEnabled(request, provider);
        const wallet = getWallet(store, getWalletOwnerId(store, session.installIdentityId));
        wallet.availableCents += amountCents;
        store.wallet = wallet;

        const entry: LedgerEntry = appendLedgerEntry(store, {
          accountId: account?.id,
          id: createId("ledger"),
          installIdentityId: session.installIdentityId,
          kind: "topup",
          status: "available",
          grossCents: amountCents,
          platformFeeCents: 0,
          netCents: amountCents,
          refType: "wallet",
          refId: createId("topup"),
          createdAt: new Date().toISOString(),
        });

        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "wallet.topup",
          entityType: "ledger_entry",
          entityId: entry.id,
          metadata: {
            amountCents,
            provider,
          },
        });

        store.walletTopups.unshift({
          accountId: account?.id,
          id: entry.refId,
          installIdentityId: session.installIdentityId,
          provider: provider === "stripe" ? "fake" : provider,
          status: "succeeded",
          grossCents: amountCents,
          createdAt: entry.createdAt,
        });

        createSystemNotification(
          store,
          `Wallet topup completed for EUR ${(amountCents / 100).toFixed(2)}.`,
          "system",
          "/me",
          account?.id,
          session.installIdentityId,
        );

        return {
          ledgerEntry: entry,
          provider,
          wallet,
        };
      },
    })
  );

  app.get("/wallet", async (request) => {
    const { account, installIdentity } = getInstallIdentityForRequest(store, request);
    const ownerKey = getWalletOwnerId(store, installIdentity.id);
    const wallet = getWallet(store, ownerKey);
    const currentIdentityId = installIdentity.id;
    const currentAccountId = account?.id;

    return {
      currentAccountId,
      currentInstallIdentityId: currentIdentityId,
      ledger: getOwnerLedgerEntries(store, currentIdentityId),
      topups: getOwnerTopups(store, currentIdentityId),
      tips: getOwnerTips(store, currentIdentityId),
      wallet,
      wallets: store.wallets,
    };
  });

  app.post<{ Body: TipBody }>("/tips", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /tips",
      statusCode: 201,
      store,
      handler: async () => {
        const { account, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /tips");
        assertAdultGateAccepted(store);

        const amountCents = positiveCents(request.body?.amountCents, "amountCents", 100);
        const senderWallet = getWallet(store, getWalletOwnerId(store, session.installIdentityId));
        ensureWalletBalance(senderWallet, amountCents);

        const targetType = request.body?.targetType ?? "post";
        const targetId = clampText(request.body?.targetId);
        if (!targetId) {
          throw badRequest("targetId is required.");
        }

        const target = getTargetByType(store, targetType, targetId);
        if (!target) {
          throw notFound("Tip target not found.");
        }

        if (targetType !== "post") {
          throw forbidden("Replies cannot receive tips.");
        }

        if (target.moderation === "blocked") {
          throw forbidden("Blocked content cannot receive tips.");
        }

        if (!target.canTip) {
          throw forbidden("This content cannot receive tips.");
        }

        const recipientInstallIdentityId = requireInstallIdentityId(request.body?.recipientInstallIdentityId);
        const recipientAccount = getAccountForInstallIdentity(store, recipientInstallIdentityId);
        if (recipientInstallIdentityId === session.installIdentityId) {
          throw conflict("You cannot tip yourself.");
        }

        const platformFeeCents = Math.max(1, Math.round(amountCents * 0.2));
        const creatorNetCents = amountCents - platformFeeCents;
        const createdAt = new Date().toISOString();

        const tip: Tip = {
          recipientAccountId: recipientAccount?.id,
          senderAccountId: account?.id,
          id: createId("tip"),
          senderInstallIdentityId: session.installIdentityId,
          recipientInstallIdentityId,
          targetType,
          targetId,
          grossCents: amountCents,
          platformFeeCents,
          creatorNetCents,
          status: "pending",
          createdAt,
        };

        store.tips.unshift(tip);
        createTipLedgerEntries(store, {
          amountCents,
          createdAt,
          creatorNetCents,
          platformFeeCents,
          recipientAccountId: recipientAccount?.id,
          recipientInstallIdentityId,
          senderAccountId: account?.id,
          targetId,
          targetType,
        });

        target.tipTotalCents += amountCents;
        syncCurrentWallet(store);
        const targetRoute = targetType === "post" ? `/post/${targetId}` : `/post/${(target as Reply).postId}`;

        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "tip.create",
          entityType: "tip",
          entityId: tip.id,
          metadata: {
            amountCents,
            platformFeeCents,
            recipientInstallIdentityId,
            targetId,
            targetType,
          },
        });

        createSystemNotification(
          store,
          `Tip of EUR ${(amountCents / 100).toFixed(2)} created.`,
          "tip",
          targetRoute,
          recipientAccount?.id ?? undefined,
          recipientInstallIdentityId,
        );

        return {
          tip,
          wallet: getCurrentWallet(store),
        };
      },
    })
  );

  app.post<{ Body: CreatorApplyBody }>("/creator/apply", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /creator/apply",
      statusCode: 201,
      store,
      handler: async () => {
        const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /creator/apply");
        assertAdultGateAccepted(store);
        const requestedAdultVerified = request.body?.adultVerified ?? installIdentity.adultVerified;

        if (requestedAdultVerified && !installIdentity.adultVerified) {
          installIdentity.adultVerified = true;
          setCurrentInstallIdentity(store, installIdentity.id);
        }

        if (
          ((account?.id && store.creatorApplication.accountId === account.id) ||
            store.creatorApplication.installIdentityId === installIdentity.id) &&
          store.creatorApplication.status !== "draft" &&
          store.creatorApplication.status !== "rejected"
        ) {
          return store.creatorApplication;
        }

        const adultVerified = request.body?.adultVerified ?? installIdentity.adultVerified;
        if (!adultVerified) {
          throw paymentRequired("Adult verification is required before creator application.");
        }

        const application: CreatorApplicationRecord = {
          accountDisplayName: installIdentity.accountDisplayName,
          accountId: account?.id,
          accountUsername: installIdentity.accountUsername,
          id: store.creatorApplication.id || createId("creator-app"),
          installIdentityId: session.installIdentityId,
          status: "submitted",
          adultVerified,
          kycState: "pending",
          payoutState: "not_ready",
          submittedAt: new Date().toISOString(),
        };

        store.creatorApplication = application;
        if (account?.id) {
          const profile = getAccountProfile(store, account.id);
          if (profile) {
            profile.displayName = clampText(request.body?.displayName) || profile.displayName;
          }
        }
        recordAudit(store, {
          actorType: "install",
          actorId: session.installIdentityId,
          action: "creator.apply",
          entityType: "creator_application",
          entityId: application.id,
          metadata: {
            displayName: request.body?.displayName ?? "",
          },
        });

        createSystemNotification(store, "Creator application submitted.", "system", undefined, account?.id, installIdentity.id);

        return application;
      },
    })
  );

  app.get("/creator/status", async (request) => {
    const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
    const effectiveAdultVerified = installIdentity.adultVerified || store.creatorApplication.adultVerified;
    if (effectiveAdultVerified && !installIdentity.adultVerified) {
      installIdentity.adultVerified = true;
      setCurrentInstallIdentity(store, session.installIdentityId);
    }

    return {
      adultGateAccepted: installIdentity.adultGateAccepted,
      adultVerified: effectiveAdultVerified,
      application:
        store.creatorApplication.accountId && account?.id !== store.creatorApplication.accountId
          ? {
              ...store.creatorApplication,
              accountDisplayName: undefined,
              accountId: undefined,
              accountUsername: undefined,
            }
          : store.creatorApplication,
      plus: getEffectivePlusEntitlement(store, installIdentity.id),
    };
  });

  app.get("/earnings", async (request) => {
    const { account, installIdentity } = getInstallIdentityForRequest(store, request);
    const currentIdentityId = installIdentity.id;
    const currentAccountId = account?.id;

    return {
      application: store.creatorApplication,
      ledger: store.ledger.filter(
        (entry) => entry.installIdentityId === currentIdentityId || entry.accountId === currentAccountId || entry.installIdentityId === "platform"
      ),
      tips: store.tips.filter((tip) => tip.recipientInstallIdentityId === currentIdentityId || tip.recipientAccountId === currentAccountId),
      wallet: getWallet(store, getWalletOwnerId(store, installIdentity.id)),
    };
  });

  app.post<{ Body: PlusCheckoutBody }>("/plus/checkout", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /plus/checkout",
      statusCode: 201,
      store,
      handler: async () => {
        const { account, installIdentity, session } = getInstallIdentityForRequest(store, request);
        assertInstallNotReadOnly(store, session.installIdentityId, "POST /plus/checkout");
        const plan = request.body?.plan ?? "monthly";
        const provider = request.body?.provider ?? "fake";
        assertProviderEnabled(request, provider);
        const grossCents = plan === "yearly" ? 14900 : 1299;
        const wallet = getWallet(store, getWalletOwnerId(store, installIdentity.id));

        if (wallet.availableCents < grossCents) {
          throw paymentRequired("Not enough wallet balance for Plus checkout.");
        }

        wallet.availableCents -= grossCents;
        store.wallet = wallet;

        const plusEntitlement = syncPlusAcrossLinkedInstalls(store, installIdentity.id, toPlusEntitlement(true));

        const entry: LedgerEntry = appendLedgerEntry(store, {
          accountId: account?.id,
          id: createId("ledger"),
          installIdentityId: installIdentity.id,
          kind: "plus_purchase",
          status: "available",
          grossCents,
          platformFeeCents: 0,
          netCents: -grossCents,
          refType: "plus",
          refId: plan,
          createdAt: new Date().toISOString(),
        });

        recordAudit(store, {
          actorType: "install",
          actorId: installIdentity.id,
          action: "plus.checkout",
          entityType: "ledger_entry",
          entityId: entry.id,
          metadata: {
            plan,
            provider,
          },
        });

        createSystemNotification(store, `Plus checkout completed for the ${plan} plan.`, "system", undefined, account?.id, installIdentity.id);

        return {
          ledgerEntry: entry,
          plan,
          plus: plusEntitlement,
          provider,
          wallet,
        };
      },
    })
  );

  app.get("/admin/backoffice/session", async (request) => {
    const actor = requireBackofficeActor(request, "moderator");

    return {
      actor,
      expectedHeaders: {
        adminId: "x-admin-id",
        adminRole: "x-admin-role",
      },
      permissions: BACKOFFICE_ROLE_PERMISSIONS[actor.role],
      roleLevel: BACKOFFICE_ROLE_LEVEL[actor.role],
    };
  });

  app.get("/admin/reports", async (request) => {
    const actor = requireBackofficeActor(request, "moderator");
    const query = request.query as Record<string, string | undefined>;
    const status = query.status as ReportRecord["status"] | undefined;
    const moderationStatus = query.moderationStatus as ModerationCase["status"] | undefined;
    const moderationCases = moderationStatus ? store.moderationCases.filter((item) => item.status === moderationStatus) : store.moderationCases;
    const reports = status ? store.reports.filter((item) => item.status === status) : store.reports;

    return {
      actor,
      auditLogs: store.auditLogs.slice(0, 20),
      backofficeActions: store.backofficeActions.slice(0, 20),
      moderationCases,
      moderationCaseItems: moderationCases.map((caseItem) => ({
        caseItem,
        linkedReports: reports.filter((report) => report.moderationCaseId === caseItem.id),
        targetPreview: createAdminTargetPreview(store, caseItem.targetType, caseItem.targetId),
      })),
      reports,
      reportItems: reports.map((report) => ({
        moderationCase: moderationCases.find((caseItem) => caseItem.id === report.moderationCaseId) ?? null,
        report,
        targetPreview: createAdminTargetPreview(store, report.targetType, report.targetId),
      })),
    };
  });

  app.get("/admin/audit-logs", async (request) => {
    const actor = requireBackofficeActor(request, "moderator");
    const query = request.query as Record<string, string | undefined>;
    const entityType = query.entityType;
    const action = query.action;

    return {
      actor,
      auditLogs: store.auditLogs
        .filter((entry) => {
        if (entityType && entry.entityType !== entityType) {
          return false;
        }
        if (action && entry.action !== action) {
          return false;
        }
        return true;
        })
        .map((entry) => ({
          ...entry,
          ...auditEntryContext(store, entry),
        })),
      backofficeActions: store.backofficeActions
        .filter((entry) => {
          if (entityType && entry.entityType !== entityType) {
            return false;
          }
          if (action && entry.action !== action) {
            return false;
          }
          return true;
        })
        .map((entry) => ({
          ...entry,
          ...auditEntryContext(store, {
            actorType: "admin",
            actorId: entry.actorId,
            metadata: entry.metadata,
          }),
        })),
    };
  });

  app.get("/admin/overview", async (request) => {
    const actor = requireBackofficeActor(request, "moderator");

    return {
      actor,
      counts: {
        auditLogs: store.auditLogs.length,
        backofficeActions: store.backofficeActions.length,
        blockedContent:
          store.posts.filter((post) => post.moderation === "blocked").length +
          store.replies.filter((reply) => reply.moderation === "blocked").length,
        ledgerEntries: store.ledger.length,
        openCases: store.moderationCases.filter((item) => item.status === "open").length,
        posts: store.posts.length,
        reports: store.reports.length,
        replies: store.replies.length,
      },
      wallet: getCurrentWallet(store),
    };
  });

  app.get("/admin/ops", async (request) => {
    const actor = requireBackofficeActor(request, "moderator");

    return {
      actor,
      ops: await getOpsStatus(store),
    };
  });

  app.get("/admin/security", async (request) => {
    const actor = requireBackofficeActor(request, "moderator");
    const now = Date.now();
    const activeRestrictions = store.installRestrictions
      .filter((entry) => Date.parse(entry.endsAt) > now)
      .sort((left, right) => Date.parse(right.endsAt) - Date.parse(left.endsAt));
    const riskStates = Object.values(store.deviceRiskState).sort((left, right) => right.score - left.score);

    return {
      actor,
      counts: {
        abuseEvents: store.abuseEvents.length,
        activeRestrictions: activeRestrictions.length,
        flaggedInstalls: riskStates.filter((entry) => Boolean(entry.flaggedAt)).length,
        restrictedInstalls: riskStates.filter((entry) => Boolean(entry.restrictedAt)).length,
      },
      activeRestrictions: activeRestrictions.slice(0, 20).map((entry) => ({
        endsAt: entry.endsAt,
        id: entry.id,
        installIdentityId: entry.installIdentityId,
        reasonCode: entry.reasonCode,
        startsAt: entry.startsAt,
        triggerSource: entry.triggerSource,
        type: entry.type,
      })),
      recentAbuseEvents: [...store.abuseEvents]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 30)
        .map((entry) => ({
          createdAt: entry.createdAt,
          id: entry.id,
          installIdentityId: entry.installIdentityId,
          ipHash: entry.ipHash,
          kind: entry.kind,
          routeName: entry.routeName,
        })),
      riskStates: riskStates.slice(0, 20).map((entry) => ({
        flaggedAt: entry.flaggedAt,
        installIdentityId: entry.installIdentityId,
        lastUpdatedAt: entry.lastUpdatedAt,
        restrictedAt: entry.restrictedAt,
        score: entry.score,
      })),
    };
  });

  app.post<{ Body: SecurityRestrictionBody }>("/admin/security/restrictions", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /admin/security/restrictions",
      statusCode: 200,
      store,
      handler: async () => {
        const actor = requireBackofficeActor(request, "admin");
        const installIdentityId = requireInstallIdentityId(request.body?.installIdentityId);
        const restrictionType = request.body?.type;
        const note = clampText(request.body?.note);

        if (request.body?.action === "clear") {
          const cleared = clearInstallRestrictions(store, {
            installIdentityId,
            type: restrictionType,
          });

          recordAudit(store, {
            actorType: "admin",
            actorId: actor.id,
            actorRole: actor.role,
            action: "security.restriction.clear",
            entityType: "install_restriction",
            entityId: installIdentityId,
            summary: `Cleared ${cleared.length} active restriction(s) for ${installIdentityId}`,
            metadata: createBackofficeMetadata(actor, {
              clearedCount: cleared.length,
              installIdentityId,
              note,
              restrictionType: restrictionType ?? "all",
            }),
          });

          recordBackofficeAction(store, {
            actorId: actor.id,
            actorRole: actor.role,
            action: "security.restriction.clear",
            entityType: "install_restriction",
            entityId: installIdentityId,
            metadata: createBackofficeMetadata(actor, {
              clearedCount: cleared.length,
              note,
              restrictionType: restrictionType ?? "all",
            }),
          });

          return {
            actor,
            clearedCount: cleared.length,
            installIdentityId,
          };
        }

        if (!restrictionType) {
          throw validationError("Restriction type is required when applying a manual override.", {
            fieldName: "type",
          });
        }

        const durationMinutes = Math.max(5, Math.trunc(request.body?.durationMinutes ?? (restrictionType === "read_only" ? 24 * 60 : 6 * 60)));
        const restriction = applyInstallRestriction(store, {
          installIdentityId,
          type: restrictionType,
          reasonCode: "manual_security_override",
          triggerSource: "admin.security.override",
          durationMs: durationMinutes * ONE_MINUTE_MS,
          metadata: createBackofficeMetadata(actor, {
            durationMinutes,
            note,
          }),
        });

        recordAudit(store, {
          actorType: "admin",
          actorId: actor.id,
          actorRole: actor.role,
          action: "security.restriction.apply",
          entityType: "install_restriction",
          entityId: restriction.id,
          summary: `Applied ${restriction.type} to ${installIdentityId}`,
          metadata: createBackofficeMetadata(actor, {
            durationMinutes,
            installIdentityId,
            note,
            restrictionType,
          }),
        });

        recordBackofficeAction(store, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "security.restriction.apply",
          entityType: "install_restriction",
          entityId: restriction.id,
          metadata: createBackofficeMetadata(actor, {
            durationMinutes,
            installIdentityId,
            note,
            restrictionType,
          }),
        });

        return {
          actor,
          installIdentityId,
          restriction,
        };
      },
    })
  );

  app.post<{ Body: SecurityInstallResetBody }>("/admin/security/install-reset", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /admin/security/install-reset",
      statusCode: 200,
      store,
      handler: async () => {
        const actor = requireBackofficeActor(request, "owner");
        const installIdentityId = requireInstallIdentityId(request.body?.installIdentityId);
        const note = clampText(request.body?.note);
        const reset = clearInstallSecurityState(store, installIdentityId);

        recordAudit(store, {
          actorType: "admin",
          actorId: actor.id,
          actorRole: actor.role,
          action: "security.install.reset",
          entityType: "install_identity",
          entityId: installIdentityId,
          summary: `Reset security state for ${installIdentityId}`,
          metadata: createBackofficeMetadata(actor, {
            ...reset,
            installIdentityId,
            note,
          }),
        });

        recordBackofficeAction(store, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "security.install.reset",
          entityType: "install_identity",
          entityId: installIdentityId,
          metadata: createBackofficeMetadata(actor, {
            ...reset,
            installIdentityId,
            note,
          }),
        });

        return {
          installIdentityId,
          ...reset,
        };
      },
    })
  );

  app.post<{ Body: ModerationActionBody }>("/admin/moderation/actions", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /admin/moderation/actions",
      statusCode: 200,
      store,
      handler: async () => {
        const actor = requireBackofficeActor(request, "moderator");
        const caseItem = updateModerationState(store, request.body as ModerationActionBody, actor);

        return {
          actor,
          caseItem,
          reports: store.reports.filter((report) => report.moderationCaseId === caseItem.id),
        };
      },
    })
  );

  app.get("/admin/creator-applications", async (request) => {
    const actor = requireBackofficeActor(request, "admin");

    return {
      actor,
      applications: [store.creatorApplication],
    };
  });

  app.post<{ Body: CreatorApprovalBody }>("/admin/creator-approvals", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /admin/creator-approvals",
      statusCode: 200,
      store,
      handler: async () => {
        const actor = requireBackofficeActor(request, "admin");
        const application = store.creatorApplication;
        if (request.body?.applicationId !== application.id) {
          throw notFound("Creator application not found.");
        }

        application.status = request.body?.action === "approve" ? "approved" : "rejected";
        application.kycState = request.body?.action === "approve" ? "verified" : "pending";
        application.payoutState = request.body?.action === "approve" ? "ready" : "paused";
        application.reviewedAt = new Date().toISOString();
        application.notes = request.body?.note ?? application.notes ?? "";

        if (request.body?.action === "approve") {
          store.installIdentity = {
            ...store.installIdentity,
            adultVerified: true,
          };
        }

        if (application.accountId) {
          const profile = getAccountProfile(store, application.accountId);
          if (profile) {
            profile.isCreator = request.body?.action === "approve";
            if (request.body?.action === "approve" && application.accountDisplayName) {
              profile.displayName = application.accountDisplayName;
            }
          }
        }

        recordAudit(store, {
          actorType: "admin",
          actorId: actor.id,
          actorRole: actor.role,
          action: `creator.${request.body?.action}`,
          entityType: "creator_application",
          entityId: application.id,
          summary: `Creator application ${application.id} -> ${request.body?.action}`,
          metadata: createBackofficeMetadata(actor, {
            applicationStatus: application.status,
            kycState: application.kycState,
            note: request.body?.note ?? "",
            payoutState: application.payoutState,
          }),
        });

        recordBackofficeAction(store, {
          actorId: actor.id,
          actorRole: actor.role,
          action: `creator.${request.body?.action}`,
          entityType: "creator_application",
          entityId: application.id,
          metadata: createBackofficeMetadata(actor, {
            applicationStatus: application.status,
            kycState: application.kycState,
            note: request.body?.note ?? "",
            payoutState: application.payoutState,
          }),
        });

        createSystemNotification(
          store,
          `Creator application ${request.body?.action}d by admin.`,
          "system",
          undefined,
          application.accountId,
          application.installIdentityId,
        );

        return {
          actor,
          application,
        };
      },
    })
  );

  app.get("/admin/ledger", async (request) => {
    const actor = requireBackofficeActor(request, "admin");
    const query = request.query as Record<string, string | undefined>;
    const installIdentityId = query.installIdentityId;
    const kind = query.kind as LedgerEntry["kind"] | undefined;

    return {
      actor,
      ledger: store.ledger.filter((entry) => {
        if (installIdentityId && entry.installIdentityId !== installIdentityId) {
          return false;
        }
        if (kind && entry.kind !== kind) {
          return false;
        }
        return true;
      }),
      backofficeActions: store.backofficeActions.slice(0, 20),
      wallets: store.wallets,
    };
  });

  app.post<{ Body: PayoutBody }>("/admin/payouts", async (request, reply) =>
    withIdempotency({
      body: request.body ?? {},
      request,
      reply,
      scope: "POST /admin/payouts",
      statusCode: 201,
      store,
      handler: async () => {
        const actor = requireBackofficeActor(request, "admin");
        const application = store.creatorApplication;
        if (request.body?.applicationId !== application.id) {
          throw notFound("Creator application not found.");
        }

        if (application.status !== "approved" || application.payoutState !== "ready") {
          throw conflict("Creator application is not payout ready.");
        }

        const amountCents = positiveCents(request.body?.amountCents, "amountCents", 100);
        const creatorWallet = getWallet(store, application.installIdentityId);

        if (creatorWallet.pendingCents < amountCents) {
          throw conflict("Insufficient pending balance for payout.", {
            amountCents,
            pendingCents: creatorWallet.pendingCents,
          });
        }

        creatorWallet.pendingCents -= amountCents;
        creatorWallet.lifetimePaidOutCents += amountCents;

        const payoutEntry: LedgerEntry = appendLedgerEntry(store, {
          id: createId("ledger"),
          installIdentityId: application.installIdentityId,
          kind: "payout",
          status: "paid_out",
          grossCents: amountCents,
          platformFeeCents: 0,
          netCents: amountCents,
          refType: "payout",
          refId: application.id,
          createdAt: new Date().toISOString(),
        });

        recordAudit(store, {
          actorType: "admin",
          actorId: actor.id,
          actorRole: actor.role,
          action: "payout.create",
          entityType: "ledger_entry",
          entityId: payoutEntry.id,
          summary: `Payout created for ${application.installIdentityId}`,
          metadata: createBackofficeMetadata(actor, {
            applicationId: application.id,
            amountCents,
            payoutState: application.payoutState,
          }),
        });

        recordBackofficeAction(store, {
          actorId: actor.id,
          actorRole: actor.role,
          action: "payout.create",
          entityType: "ledger_entry",
          entityId: payoutEntry.id,
          metadata: createBackofficeMetadata(actor, {
            applicationId: application.id,
            amountCents,
            ledgerKind: payoutEntry.kind,
            payoutState: application.payoutState,
          }),
        });

        createSystemNotification(
          store,
          `Payout of EUR ${(amountCents / 100).toFixed(2)} was created.`,
          "system",
          undefined,
          application.accountId,
          application.installIdentityId,
        );

        return {
          actor,
          payout: payoutEntry,
          wallet: creatorWallet,
        };
      },
    })
  );
};

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Account,
  type AccountChannelPreferences,
  type AccountLink,
  type AccountProfile,
  type AccountSession,
  seedState,
  type ChatMessage,
  type ChatRequest,
  type Channel,
  type CityContext,
  type CreatorApplication,
  type LedgerEntry,
  type ModerationCase,
  type NotificationItem,
  type PlusEntitlement,
  type Post,
  type Reply,
  type SeedState,
  type Tip,
  type VoteState,
  type WalletBalance,
  type WalletTopup,
} from "@veil/shared";

type MutableSeedState = SeedState & {
  installIdentity: SeedState["installIdentity"];
};

export type CreatorApplicationRecord = CreatorApplication & {
  reviewedAt?: string;
  notes?: string;
};

export type BackofficeRole = "owner" | "admin" | "moderator";

export type BackofficeActionEntry = {
  id: string;
  actorId: string;
  actorRole: BackofficeRole;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ReportRecord = {
  id: string;
  reporterInstallIdentityId: string;
  accountId?: string;
  cityId: string;
  targetType: ModerationCase["targetType"];
  targetId: string;
  reason: string;
  moderationCaseId: string;
  status: "open" | "reviewed" | "actioned" | "dismissed";
  createdAt: string;
  updatedAt: string;
};

export type AuditLogEntry = {
  id: string;
  actorType: "install" | "admin" | "system";
  actorId: string;
  actorRole?: BackofficeRole;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type InstallSessionRecord = {
  id: string;
  installIdentityId: string;
  accessTokenHash: string;
  tokenFamilyId: string;
  createdAt: string;
  accessTokenExpiresAt: string;
  status: "active" | "revoked";
  lastRefreshedAt: string;
  lastSeenAt: string;
  revokedAt?: string;
  revocationReason?: string;
};

export type RefreshTokenRecord = {
  id: string;
  installIdentityId: string;
  installSessionId: string;
  tokenHash: string;
  tokenFamilyId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
  replacedByTokenId?: string;
  revokedAt?: string;
  revocationReason?: string;
};

export type AccountLoginCodeRecord = {
  id: string;
  emailNormalized: string;
  username: string;
  installIdentityId: string;
  code: string;
  createdAt: string;
  expiresAt: string;
  attemptCount: number;
  consumedAt?: string;
};

export type SessionTokenBundle = {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

export type RestrictionType =
  | "posting_block"
  | "reply_block"
  | "vote_block"
  | "chat_request_block"
  | "geo_switch_block"
  | "read_only";

export type InstallRestrictionRecord = {
  id: string;
  installIdentityId: string;
  type: RestrictionType;
  reasonCode: string;
  triggerSource: string;
  metadata: Record<string, unknown>;
  startsAt: string;
  endsAt: string;
};

export type AbuseEventRecord = {
  id: string;
  installIdentityId?: string;
  ipHash?: string;
  routeName: string;
  kind: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type DeviceRiskStateRecord = {
  installIdentityId: string;
  score: number;
  flaggedAt?: string;
  restrictedAt?: string;
  lastUpdatedAt: string;
};

export type RateLimitCounterRecord = {
  key: string;
  count: number;
  windowEndsAt: string;
  blockedUntil?: string;
  lastExceededAt?: string;
};

export type IdempotencyRecord = {
  id: string;
  scope: string;
  idempotencyKey: string;
  bodySignature: string;
  statusCode: number;
  response: unknown;
  createdAt: string;
};

export type ApiStore = {
  cities: CityContext[];
  installIdentity: SeedState["installIdentity"];
  installIdentities: SeedState["installIdentity"][];
  channels: Channel[];
  posts: Post[];
  replies: Reply[];
  notifications: NotificationItem[];
  wallet: WalletBalance;
  wallets: Record<string, WalletBalance>;
  ledger: LedgerEntry[];
  walletTopups: WalletTopup[];
  tips: Tip[];
  creatorApplication: CreatorApplicationRecord;
  moderationCases: ModerationCase[];
  reports: ReportRecord[];
  auditLogs: AuditLogEntry[];
  backofficeActions: BackofficeActionEntry[];
  idempotencyRecords: Record<string, IdempotencyRecord>;
  installSessions: InstallSessionRecord[];
  refreshTokens: RefreshTokenRecord[];
  accounts: Account[];
  accountLinks: AccountLink[];
  accountLoginCodes: AccountLoginCodeRecord[];
  accountProfiles: Record<string, AccountProfile>;
  accountChannelPreferences: Record<string, AccountChannelPreferences>;
  installRestrictions: InstallRestrictionRecord[];
  abuseEvents: AbuseEventRecord[];
  deviceRiskState: Record<string, DeviceRiskStateRecord>;
  rateLimitCounters: Record<string, RateLimitCounterRecord>;
  votes: Record<string, VoteState>;
  chatRequests: ChatRequest[];
  chatMessages: ChatMessage[];
};

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ACCESS_TOKEN_TTL_MS = 1000 * 60 * parsePositiveInteger(process.env.ACCESS_TOKEN_TTL_MINUTES, 15);
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * parsePositiveInteger(process.env.REFRESH_TOKEN_TTL_DAYS, 30);
const MAX_ACTIVE_SESSIONS_PER_INSTALL = parsePositiveInteger(process.env.MAX_ACTIVE_SESSIONS_PER_INSTALL, 3);
const ACCOUNT_LOGIN_CODE_TTL_MS = 1000 * 60 * parsePositiveInteger(process.env.ACCOUNT_LOGIN_CODE_TTL_MINUTES, 10);

const DATA_FILE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".data", "api-store.json");

const clone = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value)) as T;
    }
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

const zeroWallet = (): WalletBalance => ({
  currency: "EUR",
  availableCents: 0,
  pendingCents: 0,
  lifetimeTippedCents: 0,
  lifetimeEarnedCents: 0,
  lifetimePaidOutCents: 0,
});

const addMilliseconds = (isoTimestamp: string, milliseconds: number) =>
  new Date(Date.parse(isoTimestamp) + milliseconds).toISOString();

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const issueOpaqueToken = (prefix: string) => `${prefix}_${randomBytes(24).toString("base64url")}`;
const isExpired = (isoTimestamp: string) => Date.parse(isoTimestamp) <= Date.now();
const issueLoginCode = () => String(Math.floor(Math.random() * 900000) + 100000);

export const createAnonLabel = () => `Anon ${String(Math.floor(Math.random() * 90) + 10)}`;

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const normalizeUsername = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

export const isValidUsername = (value: string) => /^[a-z0-9_]{3,24}$/.test(value);

export const voteKey = (targetType: VoteState["targetType"], targetId: string) => `${targetType}:${targetId}`;

const isSystemPost = (post: Pick<Post, "authorLabel" | "recipientInstallIdentityId">) =>
  post.authorLabel === "NUUDL HQ" || post.recipientInstallIdentityId?.startsWith("install-hq-") === true;

const normalizePosts = (posts: Post[]) =>
  posts.map((post) => ({
    ...post,
    canTip: isSystemPost(post) ? false : true,
  }));

const normalizeReplies = (replies: Reply[]) =>
  replies.map((reply) => ({
    ...reply,
    canTip: false,
  }));

const normalizeNotifications = (notifications: NotificationItem[], fallbackInstallIdentityId: string) =>
  notifications.map((notification) => ({
    ...notification,
    installIdentityId:
      notification.installIdentityId ??
      (notification.accountId ? undefined : fallbackInstallIdentityId),
  }));

const createAccountKey = (accountId: string) => `account:${accountId}`;

const createInstallIdentityRecord = (
  template: SeedState["installIdentity"],
  overrides: Partial<SeedState["installIdentity"]> = {}
): SeedState["installIdentity"] => ({
  ...template,
  id: overrides.id ?? createId("install"),
  installKey: overrides.installKey ?? createId("install-key"),
  accessToken: overrides.accessToken ?? "",
  accountDisplayName: overrides.accountDisplayName ?? undefined,
  accountId: overrides.accountId ?? undefined,
  accountUsername: overrides.accountUsername ?? undefined,
  createdAt: overrides.createdAt ?? new Date().toISOString(),
  discoverable: overrides.discoverable ?? false,
  ...overrides,
});

const createSeedBackedStore = (): ApiStore => {
  const state = clone(seedState) as MutableSeedState;
  const installIdentity = createInstallIdentityRecord(state.installIdentity, {
    id: state.installIdentity.id,
    installKey: state.installIdentity.installKey,
    accessToken: state.installIdentity.accessToken,
    cityId: state.installIdentity.cityId,
    cityLabel: state.installIdentity.cityLabel,
    createdAt: state.installIdentity.createdAt,
  });
  const wallets: Record<string, WalletBalance> = {
    [installIdentity.id]: state.wallet,
  };

  const reports: ReportRecord[] = state.moderationCases.map((moderationCase, index) => ({
    id: `report-${index + 1}`,
    reporterInstallIdentityId: state.installIdentity.id,
    cityId: moderationCase.cityId,
    targetType: moderationCase.targetType,
    targetId: moderationCase.targetId,
    reason: moderationCase.reason,
    moderationCaseId: moderationCase.id,
    status: moderationCase.status === "open" ? "open" : moderationCase.status === "actioned" ? "actioned" : "reviewed",
    createdAt: moderationCase.createdAt,
    updatedAt: moderationCase.createdAt,
  }));

  return {
    cities: state.cities,
    installIdentity,
    installIdentities: [installIdentity],
    channels: state.channels,
    posts: normalizePosts(state.posts),
    replies: normalizeReplies(state.replies),
    notifications: normalizeNotifications(state.notifications, installIdentity.id),
    wallet: wallets[state.installIdentity.id],
    wallets,
    ledger: state.ledger,
    walletTopups: state.walletTopups,
    tips: state.tips,
    creatorApplication: state.creatorApplication,
    moderationCases: state.moderationCases,
    reports,
    auditLogs: [],
    backofficeActions: [],
    idempotencyRecords: {},
    installSessions: [],
    refreshTokens: [],
    accounts: [],
    accountLinks: [],
    accountLoginCodes: [],
    accountProfiles: {},
    accountChannelPreferences: {},
    installRestrictions: [],
    abuseEvents: [],
    deviceRiskState: {},
    rateLimitCounters: {},
    votes: {},
    chatRequests: state.chatRequests,
    chatMessages: state.chatMessages,
  };
};

const mergePersistedStore = (persisted: Partial<ApiStore>): ApiStore => {
  const seed = createSeedBackedStore();

  return {
    ...seed,
    ...persisted,
    installIdentity:
      persisted.installIdentity ??
      persisted.installIdentities?.find((entry) => entry.id === seed.installIdentity.id) ??
      seed.installIdentity,
    installIdentities: persisted.installIdentities ?? [persisted.installIdentity ?? seed.installIdentity],
    posts: normalizePosts(persisted.posts ?? seed.posts),
    replies: normalizeReplies(persisted.replies ?? seed.replies),
    notifications: normalizeNotifications(
      persisted.notifications ?? seed.notifications,
      (persisted.installIdentity ?? seed.installIdentity).id,
    ),
    creatorApplication: {
      ...seed.creatorApplication,
      ...(persisted.creatorApplication ?? {}),
    },
    idempotencyRecords: persisted.idempotencyRecords ?? seed.idempotencyRecords,
    auditLogs: persisted.auditLogs ?? seed.auditLogs,
    backofficeActions: persisted.backofficeActions ?? seed.backofficeActions,
    installSessions: persisted.installSessions ?? seed.installSessions,
    refreshTokens: persisted.refreshTokens ?? seed.refreshTokens,
    accounts: persisted.accounts ?? seed.accounts,
    accountLinks: persisted.accountLinks ?? seed.accountLinks,
    accountLoginCodes: persisted.accountLoginCodes ?? seed.accountLoginCodes,
    accountProfiles: persisted.accountProfiles ?? seed.accountProfiles,
    accountChannelPreferences: persisted.accountChannelPreferences ?? seed.accountChannelPreferences,
    installRestrictions: persisted.installRestrictions ?? seed.installRestrictions,
    abuseEvents: persisted.abuseEvents ?? seed.abuseEvents,
    deviceRiskState: persisted.deviceRiskState ?? seed.deviceRiskState,
    rateLimitCounters: persisted.rateLimitCounters ?? seed.rateLimitCounters,
    wallets: {
      ...seed.wallets,
      ...(persisted.wallets ?? {}),
    },
  };
};

const persistStoreSnapshot = async (store: ApiStore) => {
  await mkdir(dirname(DATA_FILE_PATH), { recursive: true });
  await writeFile(DATA_FILE_PATH, JSON.stringify(store, null, 2), "utf8");
};

const loadPersistedStore = async (): Promise<ApiStore> => {
  try {
    const raw = await readFile(DATA_FILE_PATH, "utf8");
    return mergePersistedStore(JSON.parse(raw) as Partial<ApiStore>);
  } catch (error) {
    const readError = error as NodeJS.ErrnoException;
    if (readError.code === "ENOENT") {
      return createSeedBackedStore();
    }

    throw error;
  }
};

const proxifyStore = (store: ApiStore, onMutate: () => void): ApiStore => {
  const cache = new WeakMap<object, unknown>();

  const wrap = <T>(value: T): T => {
    if (!value || typeof value !== "object") {
      return value;
    }

    const cached = cache.get(value as object);
    if (cached) {
      return cached as T;
    }

    const proxy = new Proxy(value as object, {
      deleteProperty(target, property) {
        const deleted = Reflect.deleteProperty(target, property);
        if (deleted) {
          onMutate();
        }
        return deleted;
      },
      get(target, property, receiver) {
        const result = Reflect.get(target, property, receiver);
        return wrap(result);
      },
      set(target, property, nextValue, receiver) {
        const previousValue = Reflect.get(target, property, receiver);
        const updated = Reflect.set(target, property, nextValue, receiver);
        if (updated && previousValue !== nextValue) {
          onMutate();
        }
        return updated;
      },
    });

    cache.set(value as object, proxy);
    return proxy as T;
  };

  return wrap(store);
};

let storePromise: Promise<ApiStore> | null = null;

export const createStore = async (): Promise<ApiStore> => {
  if (storePromise) {
    return storePromise;
  }

  storePromise = (async () => {
    let persistTimer: NodeJS.Timeout | null = null;
    let hydrated = false;

    const schedulePersist = () => {
      if (!hydrated) {
        return;
      }

      if (persistTimer) {
        clearTimeout(persistTimer);
      }

      persistTimer = setTimeout(() => {
        persistTimer = null;
        void persistStoreSnapshot(store);
      }, 40);
    };

    const baseStore = await loadPersistedStore();
    const store = proxifyStore(baseStore, schedulePersist);
    hydrated = true;
    return store;
  })();

  return storePromise;
};

export const createId = (prefix: string) => `${prefix}-${randomUUID()}`;

export const getInstallIdentityById = (store: ApiStore, installIdentityId: string) =>
  store.installIdentities.find((entry) => entry.id === installIdentityId) ?? null;

export const setCurrentInstallIdentity = (store: ApiStore, installIdentityId: string) => {
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  if (!installIdentity) {
    return null;
  }

  store.installIdentity = installIdentity;
  return installIdentity;
};

export const ensureInstallIdentity = (
  store: ApiStore,
  installIdentityId: string,
  template?: SeedState["installIdentity"]
) => {
  const existing = getInstallIdentityById(store, installIdentityId);
  if (existing) {
    return existing;
  }

  const installIdentity = createInstallIdentityRecord(template ?? store.installIdentity, { id: installIdentityId });
  store.installIdentities.unshift(installIdentity);
  return installIdentity;
};

export const getAccountById = (store: ApiStore, accountId: string | null | undefined) =>
  accountId ? store.accounts.find((account) => account.id === accountId) ?? null : null;

export const getAccountForInstallIdentity = (store: ApiStore, installIdentityId: string) => {
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  return installIdentity ? getAccountById(store, installIdentity.accountId) : null;
};

export const getAccountProfile = (store: ApiStore, accountId: string | null | undefined): AccountProfile | null =>
  accountId ? store.accountProfiles[accountId] ?? null : null;

const accountChannelPreferencesKey = (accountId: string, cityId: string) => `${accountId}:${cityId}`;

const dedupeChannelIds = (channelIds: unknown[]) =>
  Array.from(
    new Set(
      channelIds
        .filter((channelId): channelId is string => typeof channelId === "string")
        .map((channelId) => channelId.trim())
        .filter((channelId) => channelId.length > 0)
    )
  );

const getFallbackJoinedChannelIds = (store: ApiStore, cityId: string) =>
  store.channels.filter((channel) => channel.cityId === cityId && channel.joined).map((channel) => channel.id);

export const getAccountChannelPreferencesForCity = (store: ApiStore, accountId: string, cityId: string) => {
  const key = accountChannelPreferencesKey(accountId, cityId);
  const existing = store.accountChannelPreferences[key];
  if (existing) {
    return existing;
  }

  const created: AccountChannelPreferences = {
    accountId,
    cityId,
    joinedChannelIds: getFallbackJoinedChannelIds(store, cityId),
    favoriteChannelIds: [],
    recentChannelIds: [],
    updatedAt: new Date().toISOString(),
  };

  store.accountChannelPreferences[key] = created;
  return created;
};

export const updateAccountChannelPreferencesForCity = (
  store: ApiStore,
  accountId: string,
  cityId: string,
  patch: Partial<Pick<AccountChannelPreferences, "favoriteChannelIds" | "joinedChannelIds" | "recentChannelIds">>
) => {
  const current = getAccountChannelPreferencesForCity(store, accountId, cityId);
  const updated: AccountChannelPreferences = {
    ...current,
    ...(patch.joinedChannelIds ? { joinedChannelIds: dedupeChannelIds(patch.joinedChannelIds) } : {}),
    ...(patch.favoriteChannelIds ? { favoriteChannelIds: dedupeChannelIds(patch.favoriteChannelIds) } : {}),
    ...(patch.recentChannelIds ? { recentChannelIds: dedupeChannelIds(patch.recentChannelIds) } : {}),
    updatedAt: new Date().toISOString(),
  };

  store.accountChannelPreferences[accountChannelPreferencesKey(accountId, cityId)] = updated;
  return updated;
};

export const applyAccountChannelPreferencesToChannels = (
  channels: Channel[],
  preferences: AccountChannelPreferences | null
) => {
  if (!preferences) {
    return channels;
  }

  const joinedSet = new Set(preferences.joinedChannelIds);

  return channels.map((channel) =>
    channel.cityId === preferences.cityId
      ? {
          ...channel,
          joined: joinedSet.has(channel.id),
        }
      : channel,
  );
};

export const getWalletOwnerId = (store: ApiStore, installIdentityId: string) => {
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  return installIdentity?.accountId ? createAccountKey(installIdentity.accountId) : installIdentityId;
};

export const createAccountSession = (
  store: ApiStore,
  installIdentityId: string,
  lastSeenAt: string = new Date().toISOString()
): AccountSession | null => {
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  if (!installIdentity?.accountId) {
    return null;
  }

  const activeSession =
    [...store.installSessions]
      .filter((session) => session.installIdentityId === installIdentityId && session.status === "active")
      .sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt))[0] ?? null;

  if (!activeSession) {
    return null;
  }

  return {
    id: activeSession.id,
    accountId: installIdentity.accountId,
    installIdentityId,
    status: activeSession.status,
    createdAt: activeSession.createdAt,
    lastSeenAt,
  };
};

export const getWallet = (store: ApiStore, installIdentityId: string) => {
  if (!store.wallets[installIdentityId]) {
    store.wallets[installIdentityId] = zeroWallet();
  }

  return store.wallets[installIdentityId];
};

export const syncCurrentWallet = (store: ApiStore) => {
  store.wallet = getWallet(store, getWalletOwnerId(store, store.installIdentity.id));
  return store.wallet;
};

export const recordAudit = (
  store: ApiStore,
  entry: Omit<AuditLogEntry, "id" | "createdAt" | "summary"> & { createdAt?: string; summary?: string }
) => {
  const auditLog: AuditLogEntry = {
    id: createId("audit"),
    actorType: entry.actorType,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary ?? `${entry.action} -> ${entry.entityType}:${entry.entityId}`,
    metadata: entry.metadata,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };

  store.auditLogs.unshift(auditLog);
  return auditLog;
};

export const recordBackofficeAction = (
  store: ApiStore,
  entry: Omit<BackofficeActionEntry, "id" | "createdAt"> & { createdAt?: string }
) => {
  const actionEntry: BackofficeActionEntry = {
    id: createId("backoffice-action"),
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: entry.metadata,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };

  store.backofficeActions.unshift(actionEntry);
  return actionEntry;
};

export const createReportRecord = (
  store: ApiStore,
  params: {
    accountId?: string;
    cityId: string;
    reporterInstallIdentityId: string;
    reason: string;
    targetId: string;
    targetType: ModerationCase["targetType"];
  }
) => {
  const moderationCase: ModerationCase = {
    id: createId("mod"),
    accountId: params.accountId,
    cityId: params.cityId,
    targetType: params.targetType,
    targetId: params.targetId,
    reason: params.reason,
    status: "open",
    createdAt: new Date().toISOString(),
  };

  const report: ReportRecord = {
    id: createId("report"),
    reporterInstallIdentityId: params.reporterInstallIdentityId,
    accountId: params.accountId,
    cityId: params.cityId,
    targetType: params.targetType,
    targetId: params.targetId,
    reason: params.reason,
    moderationCaseId: moderationCase.id,
    status: "open",
    createdAt: moderationCase.createdAt,
    updatedAt: moderationCase.createdAt,
  };

  store.moderationCases.unshift(moderationCase);
  store.reports.unshift(report);
  return { moderationCase, report };
};

export const toPlusEntitlement = (active: boolean): PlusEntitlement => ({
  active,
  explorer: active,
  imageChat: active,
  noAds: active,
  weeklyBoosts: active ? 3 : 0,
  weeklyColorDrops: active ? 3 : 0,
});

const revokeRefreshFamily = (store: ApiStore, familyId: string, reason: string, revokedAt: string) => {
  store.installSessions.forEach((session) => {
    if (session.tokenFamilyId === familyId && session.status !== "revoked") {
      session.status = "revoked";
      session.revokedAt = revokedAt;
      session.revocationReason = reason;
    }
  });

  store.refreshTokens.forEach((token) => {
    if (token.tokenFamilyId === familyId && !token.revokedAt) {
      token.revokedAt = revokedAt;
      token.revocationReason = reason;
    }
  });
};

const enforceSessionLimit = (store: ApiStore, installIdentityId: string, currentSessionId: string) => {
  const activeSessions = [...store.installSessions]
    .filter((session) => session.installIdentityId === installIdentityId && session.status === "active")
    .sort((left, right) => Date.parse(left.lastSeenAt) - Date.parse(right.lastSeenAt));

  if (activeSessions.length <= MAX_ACTIVE_SESSIONS_PER_INSTALL) {
    return;
  }

  const revokedAt = new Date().toISOString();
  const overflow = activeSessions.length - MAX_ACTIVE_SESSIONS_PER_INSTALL;
  const sessionsToRevoke = activeSessions.filter((session) => session.id !== currentSessionId).slice(0, overflow);

  sessionsToRevoke.forEach((session) => {
    revokeRefreshFamily(store, session.tokenFamilyId, "session_limit", revokedAt);
  });
};

export const issueInstallSession = (store: ApiStore, installIdentityId: string): SessionTokenBundle => {
  const now = new Date().toISOString();
  const installIdentity = ensureInstallIdentity(store, installIdentityId);
  const sessionId = createId("session");
  const tokenFamilyId = createId("refresh-family");
  const accessToken = issueOpaqueToken("nuudl_at");
  const refreshToken = issueOpaqueToken("nuudl_rt");
  const accessTokenExpiresAt = addMilliseconds(now, ACCESS_TOKEN_TTL_MS);
  const refreshTokenExpiresAt = addMilliseconds(now, REFRESH_TOKEN_TTL_MS);

  store.installSessions.unshift({
    id: sessionId,
    installIdentityId,
    accessTokenHash: hashToken(accessToken),
    tokenFamilyId,
    createdAt: now,
    accessTokenExpiresAt,
    status: "active",
    lastRefreshedAt: now,
    lastSeenAt: now,
  });

  store.refreshTokens.unshift({
    id: createId("refresh"),
    installIdentityId,
    installSessionId: sessionId,
    tokenHash: hashToken(refreshToken),
    tokenFamilyId,
    createdAt: now,
    expiresAt: refreshTokenExpiresAt,
  });

  installIdentity.accessToken = accessToken;
  setCurrentInstallIdentity(store, installIdentityId);

  enforceSessionLimit(store, installIdentityId, sessionId);

  return {
    sessionId,
    accessToken,
    accessTokenExpiresAt,
    refreshToken,
    refreshTokenExpiresAt,
  };
};

export const authenticateInstallSession = (store: ApiStore, accessToken: string) => {
  const session = store.installSessions.find((entry) => entry.accessTokenHash === hashToken(accessToken));

  if (!session || session.status !== "active" || isExpired(session.accessTokenExpiresAt)) {
    return null;
  }

  session.lastSeenAt = new Date().toISOString();
  return session;
};

export const rotateInstallRefreshToken = (store: ApiStore, refreshToken: string): SessionTokenBundle => {
  const now = new Date().toISOString();
  const currentToken = store.refreshTokens.find((entry) => entry.tokenHash === hashToken(refreshToken));

  if (!currentToken) {
    throw new Error("refresh_invalid");
  }

  const session = store.installSessions.find((entry) => entry.id === currentToken.installSessionId) ?? null;
  if (!session) {
    throw new Error("refresh_invalid");
  }

  if (currentToken.revokedAt || currentToken.usedAt || session.status !== "active" || isExpired(currentToken.expiresAt)) {
    revokeRefreshFamily(store, currentToken.tokenFamilyId, "refresh_reuse", now);
    throw new Error("refresh_reused");
  }

  const nextAccessToken = issueOpaqueToken("nuudl_at");
  const nextRefreshToken = issueOpaqueToken("nuudl_rt");
  const accessTokenExpiresAt = addMilliseconds(now, ACCESS_TOKEN_TTL_MS);
  const refreshTokenExpiresAt = addMilliseconds(now, REFRESH_TOKEN_TTL_MS);
  const nextRefreshTokenId = createId("refresh");

  currentToken.usedAt = now;
  currentToken.replacedByTokenId = nextRefreshTokenId;

  store.refreshTokens.unshift({
    id: nextRefreshTokenId,
    installIdentityId: currentToken.installIdentityId,
    installSessionId: currentToken.installSessionId,
    tokenHash: hashToken(nextRefreshToken),
    tokenFamilyId: currentToken.tokenFamilyId,
    createdAt: now,
    expiresAt: refreshTokenExpiresAt,
  });

  session.accessTokenHash = hashToken(nextAccessToken);
  session.accessTokenExpiresAt = accessTokenExpiresAt;
  session.lastRefreshedAt = now;
  session.lastSeenAt = now;

  const installIdentity = ensureInstallIdentity(store, currentToken.installIdentityId);
  installIdentity.accessToken = nextAccessToken;
  setCurrentInstallIdentity(store, currentToken.installIdentityId);

  return {
    sessionId: session.id,
    accessToken: nextAccessToken,
    accessTokenExpiresAt,
    refreshToken: nextRefreshToken,
    refreshTokenExpiresAt,
  };
};

export const startAccountLoginCode = (
  store: ApiStore,
  params: {
    emailNormalized: string;
    installIdentityId: string;
    username: string;
  }
) => {
  const now = new Date().toISOString();
  const codeRecord: AccountLoginCodeRecord = {
    id: createId("login-code"),
    emailNormalized: params.emailNormalized,
    username: params.username,
    installIdentityId: params.installIdentityId,
    code: issueLoginCode(),
    createdAt: now,
    expiresAt: addMilliseconds(now, ACCOUNT_LOGIN_CODE_TTL_MS),
    attemptCount: 0,
  };

  store.accountLoginCodes.unshift(codeRecord);
  store.accountLoginCodes = store.accountLoginCodes
    .filter((entry) => !entry.consumedAt && !isExpired(entry.expiresAt))
    .slice(0, 200);

  return codeRecord;
};

export const verifyAccountLoginCode = (
  store: ApiStore,
  params: {
    code: string;
    emailNormalized: string;
    installIdentityId: string;
    username: string;
  }
) => {
  const record = store.accountLoginCodes.find(
    (entry) =>
      !entry.consumedAt &&
      entry.code === params.code &&
      entry.emailNormalized === params.emailNormalized &&
      entry.installIdentityId === params.installIdentityId
  );

  if (!record || isExpired(record.expiresAt)) {
    throw new Error("login_code_invalid");
  }

  record.consumedAt = new Date().toISOString();
  return record;
};

export const findAccountByEmail = (store: ApiStore, emailNormalized: string) =>
  store.accounts.find((entry) => entry.emailNormalized === emailNormalized) ?? null;

export const findAccountByUsername = (store: ApiStore, username: string) =>
  store.accounts.find((entry) => entry.username === username) ?? null;

export const linkInstallIdentityToAccount = (
  store: ApiStore,
  params: {
    accountId: string;
    displayName?: string;
    discoverable?: boolean;
    emailNormalized: string;
    installIdentityId: string;
    username: string;
  }
) => {
  const now = new Date().toISOString();
  const installIdentity = ensureInstallIdentity(store, params.installIdentityId);
  let account = findAccountByEmail(store, params.emailNormalized) ?? findAccountByUsername(store, params.username);

  if (!account) {
    account = {
      id: createId("account"),
      username: params.username,
      emailNormalized: params.emailNormalized,
      emailVerifiedAt: now,
      discoverable: params.discoverable ?? false,
      createdAt: now,
      lastSeenAt: now,
    };
    store.accounts.unshift(account);
  } else {
    account.emailVerifiedAt = now;
    account.lastSeenAt = now;
    account.discoverable = params.discoverable ?? account.discoverable;
  }

  installIdentity.accountId = account.id;
  installIdentity.accountUsername = account.username;
  installIdentity.accountDisplayName = params.displayName ?? installIdentity.accountDisplayName ?? account.username;
  installIdentity.discoverable = account.discoverable;

  const existingLink = store.accountLinks.find(
    (link) => link.installIdentityId === installIdentity.id && link.unlinkedAt === null
  );
  if (!existingLink) {
    store.accountLinks.unshift({
      accountId: account.id,
      installIdentityId: installIdentity.id,
      linkedAt: now,
      unlinkedAt: null,
    });
  }

  const existingProfile = getAccountProfile(store, account.id);
  store.accountProfiles[account.id] = {
    accountId: account.id,
    displayName: params.displayName ?? existingProfile?.displayName ?? installIdentity.accountDisplayName ?? account.username,
    bio: existingProfile?.bio ?? "",
    avatarUrl: existingProfile?.avatarUrl ?? null,
    isCreator: existingProfile?.isCreator ?? false,
  };
  getAccountChannelPreferencesForCity(store, account.id, installIdentity.cityId);

  setCurrentInstallIdentity(store, installIdentity.id);
  return {
    account,
    installIdentity,
    profile: store.accountProfiles[account.id],
  };
};

export const unlinkInstallIdentityFromAccount = (store: ApiStore, installIdentityId: string) => {
  const installIdentity = getInstallIdentityById(store, installIdentityId);
  if (!installIdentity?.accountId) {
    return installIdentity ?? null;
  }

  store.accountLinks.forEach((link) => {
    if (link.installIdentityId === installIdentityId && link.unlinkedAt === null) {
      link.unlinkedAt = new Date().toISOString();
    }
  });

  installIdentity.accountId = undefined;
  installIdentity.accountUsername = undefined;
  installIdentity.accountDisplayName = undefined;
  installIdentity.discoverable = false;
  return installIdentity;
};

export const getOrCreateRiskState = (store: ApiStore, installIdentityId: string) => {
  if (!store.deviceRiskState[installIdentityId]) {
    store.deviceRiskState[installIdentityId] = {
      installIdentityId,
      score: 0,
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  return store.deviceRiskState[installIdentityId];
};

export const incrementRiskScore = (
  store: ApiStore,
  installIdentityId: string,
  increment: number,
  metadata: Record<string, unknown> = {},
) => {
  const next = getOrCreateRiskState(store, installIdentityId);
  next.score += increment;
  next.lastUpdatedAt = new Date().toISOString();

  if (next.score >= 30 && !next.flaggedAt) {
    next.flaggedAt = next.lastUpdatedAt;
  }

  if (next.score >= 50 && !next.restrictedAt) {
    next.restrictedAt = next.lastUpdatedAt;
  }

  const triggerSource =
    typeof metadata.routeName === "string" && metadata.routeName.trim().length > 0 ? metadata.routeName : "risk_score";
  const activeReadOnly = getActiveRestriction(store, installIdentityId, "read_only");
  const activePostingBlock = getActiveRestriction(store, installIdentityId, "posting_block");
  const activeReplyBlock = getActiveRestriction(store, installIdentityId, "reply_block");
  const activeChatBlock = getActiveRestriction(store, installIdentityId, "chat_request_block");

  if (next.score >= 50 && !activeReadOnly) {
    applyInstallRestriction(store, {
      installIdentityId,
      type: "read_only",
      reasonCode: "risk_score_restricted",
      triggerSource,
      durationMs: 24 * 60 * 60 * 1000,
      metadata: {
        score: next.score,
        ...metadata,
      },
    });

    recordAbuseEvent(store, {
      installIdentityId,
      routeName: triggerSource,
      kind: "risk_escalation_read_only",
      metadata: {
        score: next.score,
      },
    });
  } else if (next.score >= 30) {
    const restrictionMetadata = {
      score: next.score,
      ...metadata,
    };

    if (!activePostingBlock) {
      applyInstallRestriction(store, {
        installIdentityId,
        type: "posting_block",
        reasonCode: "risk_score_flagged",
        triggerSource,
        durationMs: 6 * 60 * 60 * 1000,
        metadata: restrictionMetadata,
      });
    }

    if (!activeReplyBlock) {
      applyInstallRestriction(store, {
        installIdentityId,
        type: "reply_block",
        reasonCode: "risk_score_flagged",
        triggerSource,
        durationMs: 6 * 60 * 60 * 1000,
        metadata: restrictionMetadata,
      });
    }

    if (!activeChatBlock) {
      applyInstallRestriction(store, {
        installIdentityId,
        type: "chat_request_block",
        reasonCode: "risk_score_flagged",
        triggerSource,
        durationMs: 6 * 60 * 60 * 1000,
        metadata: restrictionMetadata,
      });
    }

    if (!activePostingBlock || !activeReplyBlock || !activeChatBlock) {
      recordAbuseEvent(store, {
        installIdentityId,
        routeName: triggerSource,
        kind: "risk_escalation_flagged",
        metadata: {
          score: next.score,
        },
      });
    }
  }

  store.deviceRiskState[installIdentityId] = next;
  return {
    ...next,
    metadata,
  };
};

export const recordAbuseEvent = (
  store: ApiStore,
  entry: Omit<AbuseEventRecord, "id" | "createdAt"> & { createdAt?: string },
) => {
  const event: AbuseEventRecord = {
    id: createId("abuse"),
    installIdentityId: entry.installIdentityId,
    ipHash: entry.ipHash,
    routeName: entry.routeName,
    kind: entry.kind,
    metadata: entry.metadata,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };

  store.abuseEvents.unshift(event);
  return event;
};

export const applyInstallRestriction = (
  store: ApiStore,
  params: {
    installIdentityId: string;
    type: RestrictionType;
    reasonCode: string;
    triggerSource: string;
    durationMs: number;
    metadata?: Record<string, unknown>;
  },
) => {
  const startsAt = new Date().toISOString();
  const endsAt = addMilliseconds(startsAt, params.durationMs);
  const existing = store.installRestrictions.find(
    (entry) =>
      entry.installIdentityId === params.installIdentityId &&
      entry.type === params.type &&
      Date.parse(entry.endsAt) > Date.now(),
  );

  if (existing) {
    existing.endsAt = endsAt;
    existing.reasonCode = params.reasonCode;
    existing.triggerSource = params.triggerSource;
    existing.metadata = params.metadata ?? {};
    return existing;
  }

  const restriction: InstallRestrictionRecord = {
    id: createId("restriction"),
    installIdentityId: params.installIdentityId,
    type: params.type,
    reasonCode: params.reasonCode,
    triggerSource: params.triggerSource,
    metadata: params.metadata ?? {},
    startsAt,
    endsAt,
  };

  store.installRestrictions.unshift(restriction);
  return restriction;
};

export const clearInstallRestrictions = (
  store: ApiStore,
  params: {
    installIdentityId: string;
    type?: RestrictionType;
  },
) => {
  const clearedAt = new Date().toISOString();
  const cleared = store.installRestrictions.filter(
    (entry) =>
      entry.installIdentityId === params.installIdentityId &&
      (!params.type || entry.type === params.type) &&
      Date.parse(entry.endsAt) > Date.now(),
  );

  cleared.forEach((entry) => {
    entry.endsAt = clearedAt;
    entry.metadata = {
      ...entry.metadata,
      clearedAt,
    };
  });

  return cleared;
};

export const getActiveRestriction = (store: ApiStore, installIdentityId: string, type: RestrictionType) =>
  store.installRestrictions.find(
    (entry) => entry.installIdentityId === installIdentityId && entry.type === type && Date.parse(entry.endsAt) > Date.now(),
  ) ?? null;

export const getRateLimitCounter = (
  store: ApiStore,
  key: string,
  nowIso: string,
  windowMs: number,
) => {
  const existing = store.rateLimitCounters[key];
  if (!existing || Date.parse(existing.windowEndsAt) <= Date.now()) {
    store.rateLimitCounters[key] = {
      key,
      count: 0,
      windowEndsAt: addMilliseconds(nowIso, windowMs),
    };
  }

  return store.rateLimitCounters[key];
};

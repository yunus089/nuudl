import { readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  API_STORE_SNAPSHOT_PATH,
  resolveStorePersistence,
  summarizeConnectionTarget,
} from "./store-persistence.js";
import { getRateLimitReadiness } from "./rate-limit-store.js";
import { getSeedProfile, type ApiStore } from "./store.js";

const DATA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".data");
export const DEFAULT_API_UPLOADS_PATH = resolve(DATA_ROOT, "uploads");
const SERVICE_STARTED_AT = new Date().toISOString();

type MaybeStat = Awaited<ReturnType<typeof stat>> | null;

const safeStat = async (path: string): Promise<MaybeStat> => {
  try {
    return await stat(path);
  } catch {
    return null;
  }
};

const latestTimestamp = (values: Array<string | undefined>) =>
  [...values]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0];

const envFlag = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const normalizedBaseUrl = (...values: Array<string | undefined>) =>
  values
    .map((value) => value?.trim().replace(/\/$/, ""))
    .find((value): value is string => Boolean(value)) ?? null;

export const getApiUploadsPath = () => {
  const configuredPath = process.env.API_UPLOADS_DIR?.trim();
  return configuredPath ? resolve(configuredPath) : DEFAULT_API_UPLOADS_PATH;
};

export const getMediaUploadMaxBytes = () => {
  const parsed = Number.parseInt(process.env.MEDIA_UPLOAD_MAX_BYTES ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10 * 1024 * 1024;
};

const getInviteCodeCount = () =>
  (process.env.BETA_INVITE_CODES ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter((code) => code.length > 0).length;

const getBetaReadiness = (
  store: ApiStore,
  uploads: Awaited<ReturnType<typeof getUploadsSummary>>,
  snapshotStat: MaybeStat,
) => {
  const seedProfile = getSeedProfile();
  const allowLocalFallbacks = envFlag(process.env.ALLOW_LOCAL_FALLBACKS);
  const allowFakePayments = envFlag(process.env.ALLOW_FAKE_PAYMENTS);
  const betaInviteRequired = envFlag(process.env.BETA_INVITE_REQUIRED);
  const betaInviteCodeCount = getInviteCodeCount();
  const contentCounts = {
    chatMessages: store.chatMessages.length,
    chatRequests: store.chatRequests.length,
    ledgerEntries: store.ledger.length,
    moderationCases: store.moderationCases.length,
    notifications: store.notifications.length,
    posts: store.posts.length,
    reports: store.reports.length,
    replies: store.replies.length,
    tips: store.tips.length,
    uploads: uploads.fileCount,
    walletTopups: store.walletTopups.length,
  };
  const mutableRecordCount = Object.values(contentCounts).reduce((sum, value) => sum + value, 0);
  const checks = [
    {
      id: "seed-profile-clean",
      label: "API_SEED_PROFILE clean",
      ok: seedProfile === "clean",
      severity: "error" as const,
      detail:
        seedProfile === "clean"
          ? "Fresh bootstraps use an empty beta-safe store."
          : "Set API_SEED_PROFILE=clean before inviting external beta users.",
    },
    {
      id: "local-fallbacks-disabled",
      label: "Local fallbacks disabled",
      ok: !allowLocalFallbacks,
      severity: "error" as const,
      detail: allowLocalFallbacks
        ? "Set ALLOW_LOCAL_FALLBACKS=false outside local demo/dev."
        : "Consumer cannot silently fall back to local demo data.",
    },
    {
      id: "fake-payments-disabled",
      label: "Fake payments disabled",
      ok: !allowFakePayments,
      severity: "error" as const,
      detail: allowFakePayments
        ? "Set ALLOW_FAKE_PAYMENTS=false outside local demo/dev."
        : "Fake payment routes are not enabled by environment.",
    },
    {
      id: "beta-invite-gate",
      label: "Closed beta invite gate",
      ok: betaInviteRequired ? betaInviteCodeCount > 0 : false,
      severity: betaInviteRequired ? ("error" as const) : ("warning" as const),
      detail: betaInviteRequired
        ? betaInviteCodeCount > 0
          ? `${betaInviteCodeCount} invite code(s) configured.`
          : "BETA_INVITE_REQUIRED is true, but BETA_INVITE_CODES is empty."
        : "Invite gate is disabled. Use this only for local/internal tests or after public launch.",
    },
    {
      id: "mutable-data-empty",
      label: "No existing beta content",
      ok: mutableRecordCount === 0,
      severity: "warning" as const,
      detail:
        mutableRecordCount === 0
          ? "No posts, replies, reports, chats, wallet events or uploads are present."
          : "Content exists. This is fine after beta starts, but not before first external invites.",
    },
    {
      id: "snapshot-status-known",
      label: "Persistence status visible",
      ok: Boolean(snapshotStat?.isFile()) || resolveStorePersistence().activeDriver === "postgres_snapshot",
      severity: "warning" as const,
      detail: snapshotStat?.isFile()
        ? "Snapshot file exists."
        : "No snapshot file yet. A first write will create one when snapshot_file is active.",
    },
  ];
  const failedErrors = checks.filter((check) => !check.ok && check.severity === "error");
  const failedWarnings = checks.filter((check) => !check.ok && check.severity === "warning");

  return {
    checks,
    contentCounts,
    env: {
      allowFakePayments,
      allowLocalFallbacks,
      betaInviteCodeCount,
      betaInviteRequired,
      seedProfile,
    },
    mutableRecordCount,
    status: failedErrors.length ? "blocked" : failedWarnings.length ? "warning" : "ready",
  };
};

const getPersistenceReadiness = () => {
  const persistence = resolveStorePersistence();
  const redis = summarizeConnectionTarget(process.env.REDIS_URL);
  const postgresConfigured = persistence.database.configured && persistence.database.valid;
  const postgresActive = persistence.activeDriver === "postgres_snapshot";
  const postgresRequested =
    persistence.requestedDriver === "postgres" || persistence.requestedDriver === "postgres_snapshot";

  return {
    activeDriver: persistence.activeDriver,
    requestedDriver: persistence.requestedDriver,
    supportedDrivers: persistence.supportedDrivers,
    database: persistence.database,
    redis,
    rateLimit: getRateLimitReadiness(),
    schemaDraftPath: "db/schema.sql",
    postgresRuntime: {
      configured: postgresConfigured,
      normalizedRepositoryLayerImplemented: true,
      normalizedMirror: persistence.postgresNormalizedMirror,
      normalizedReadOverlay: persistence.postgresNormalizedReadOverlay,
      ready: postgresActive,
      snapshotAdapterImplemented: true,
      snapshotReady: persistence.postgresSnapshotReady,
      status: postgresActive
        ? "active_snapshot_adapter"
        : postgresRequested
          ? "missing_or_invalid_database_url"
        : postgresConfigured
          ? "configured_but_not_active"
          : "not_configured",
    },
    migrationRequired: !postgresActive,
    warning: persistence.warning,
    nextSteps: postgresActive
      ? [
          "Keep API_STORAGE_DRIVER=postgres or postgres_snapshot only for the private beta DB-backed snapshot mode.",
          "Migrate critical domains from the snapshot adapter into normalized table repositories.",
          "Start with install identities, sessions, accounts, posts, replies, votes, reports and moderation cases.",
        ]
      : [
          "Create the Postgres/PostGIS resource.",
          "Run db/schema.sql as the baseline schema.",
          "Set DATABASE_URL and API_STORAGE_DRIVER=postgres after the DB is reachable.",
          "Migrate critical domains from the snapshot adapter into normalized table repositories.",
        ],
  };
};

const getUploadsSummary = async () => {
  const uploadsPath = getApiUploadsPath();
  const directoryStat = await safeStat(uploadsPath);
  if (!directoryStat?.isDirectory()) {
    return {
      exists: false,
      fileCount: 0,
      latestFileAt: undefined as string | undefined,
      totalBytes: 0,
    };
  }

  const entries = await readdir(uploadsPath);
  const fileStats = await Promise.all(
    entries.map(async (entry) => {
      const currentStat = await safeStat(resolve(uploadsPath, entry));
      return currentStat?.isFile()
        ? {
            byteLength: Number(currentStat.size),
            modifiedAt: currentStat.mtime.toISOString(),
          }
        : null;
    }),
  );

  const files = fileStats.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return {
    exists: true,
    fileCount: files.length,
    latestFileAt: latestTimestamp(files.map((file) => file.modifiedAt)),
    totalBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
  };
};

export const getOpsStatus = async (store: ApiStore) => {
  const snapshotStat = await safeStat(API_STORE_SNAPSHOT_PATH);
  const uploads = await getUploadsSummary();
  const now = new Date();
  const apiPublicBaseUrl = normalizedBaseUrl(process.env.API_PUBLIC_BASE_URL, process.env.NUUDL_API_BASE_URL);
  const uploadsPath = getApiUploadsPath();

  return {
    beta: getBetaReadiness(store, uploads, snapshotStat),
    counts: {
      abuseEvents: store.abuseEvents.length,
      activeRestrictions: store.installRestrictions.filter((entry) => Date.parse(entry.endsAt) > now.getTime()).length,
      chatMessages: store.chatMessages.length,
      chatRequests: store.chatRequests.length,
      idempotencyKeys: Object.keys(store.idempotencyRecords).length,
      installSessions: store.installSessions.filter((entry) => entry.status === "active" && Date.parse(entry.accessTokenExpiresAt) > now.getTime()).length,
      ledgerEntries: store.ledger.length,
      moderationCases: store.moderationCases.length,
      posts: store.posts.length,
      refreshTokens: store.refreshTokens.filter((entry) => !entry.revokedAt && !entry.usedAt && Date.parse(entry.expiresAt) > now.getTime()).length,
      replies: store.replies.length,
      reports: store.reports.length,
      uploads: uploads.fileCount,
    },
    recent: {
      lastAbuseEventAt: latestTimestamp(store.abuseEvents.map((entry) => entry.createdAt)),
      lastAuditAt: latestTimestamp(store.auditLogs.map((entry) => entry.createdAt)),
      lastBackofficeActionAt: latestTimestamp(store.backofficeActions.map((entry) => entry.createdAt)),
    },
    runtime: {
      environment: process.env.NODE_ENV ?? "development",
      logLevel: process.env.API_LOG_LEVEL ?? process.env.LOG_LEVEL ?? "info",
      nodeVersion: process.version,
      now: now.toISOString(),
      pid: process.pid,
      startedAt: SERVICE_STARTED_AT,
      timestamp: now.toISOString(),
      uptimeSeconds: Math.max(0, Math.floor((now.getTime() - Date.parse(SERVICE_STARTED_AT)) / 1000)),
    },
    storage: {
      persistence: getPersistenceReadiness(),
      snapshotFile: {
        exists: Boolean(snapshotStat?.isFile()),
        path: API_STORE_SNAPSHOT_PATH,
        sizeBytes: snapshotStat?.isFile() ? Number(snapshotStat.size) : 0,
        updatedAt: snapshotStat?.isFile() ? snapshotStat.mtime.toISOString() : null,
      },
      uploadsDirectory: {
        defaultPath: DEFAULT_API_UPLOADS_PATH,
        exists: uploads.exists,
        fileCount: uploads.fileCount,
        maxUploadBytes: getMediaUploadMaxBytes(),
        path: uploadsPath,
        pathSource: uploadsPath === DEFAULT_API_UPLOADS_PATH ? "default" : "env",
        publicBaseUrl: apiPublicBaseUrl,
        totalBytes: uploads.totalBytes,
        updatedAt: uploads.latestFileAt ?? null,
        urlStrategy: apiPublicBaseUrl ? "configured_base_url" : "request_headers",
      },
    },
    legacy: {
      auditLogs: store.auditLogs.length,
      backofficeActions: store.backofficeActions.length,
      openModerationCases: store.moderationCases.filter((entry) => entry.status === "open").length,
      rateLimitCounters: Object.keys(store.rateLimitCounters).length,
    },
  };
};

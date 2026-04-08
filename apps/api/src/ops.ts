import { readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiStore } from "./store.js";

const DATA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".data");
export const API_STORE_SNAPSHOT_PATH = resolve(DATA_ROOT, "api-store.json");
export const API_UPLOADS_PATH = resolve(DATA_ROOT, "uploads");
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

const getUploadsSummary = async () => {
  const directoryStat = await safeStat(API_UPLOADS_PATH);
  if (!directoryStat?.isDirectory()) {
    return {
      exists: false,
      fileCount: 0,
      latestFileAt: undefined as string | undefined,
      totalBytes: 0,
    };
  }

  const entries = await readdir(API_UPLOADS_PATH);
  const fileStats = await Promise.all(
    entries.map(async (entry) => {
      const currentStat = await safeStat(resolve(API_UPLOADS_PATH, entry));
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

  return {
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
      snapshotFile: {
        exists: Boolean(snapshotStat?.isFile()),
        path: API_STORE_SNAPSHOT_PATH,
        sizeBytes: snapshotStat?.isFile() ? Number(snapshotStat.size) : 0,
        updatedAt: snapshotStat?.isFile() ? snapshotStat.mtime.toISOString() : null,
      },
      uploadsDirectory: {
        exists: uploads.exists,
        fileCount: uploads.fileCount,
        path: API_UPLOADS_PATH,
        totalBytes: uploads.totalBytes,
        updatedAt: uploads.latestFileAt ?? null,
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

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type {
  Account,
  AccountChannelPreferences,
  AccountLink,
  AccountProfile,
  ChatMessage,
  ChatRequest,
  Channel,
  CityHealthSnapshot,
  CityContext,
  CreatorReview,
  FeatureFlag,
  InstallIdentity,
  LedgerEntry,
  ModerationAction,
  ModerationCase,
  NotificationItem,
  Payout,
  PayoutAccount,
  PlusEntitlement,
  Post,
  Reply,
  Tip,
  VoteState,
  WalletBalance,
  WalletTopup,
} from "@veil/shared";
import type {
  AccountLoginCodeRecord,
  AbuseEventRecord,
  ApiStore,
  AuditLogEntry,
  BackofficeActionEntry,
  BackofficeRole,
  CreatorApplicationRecord,
  DeviceRiskStateRecord,
  GeoEventRecord,
  IdempotencyRecord,
  InstallSessionRecord,
  InstallRestrictionRecord,
  RateLimitCounterRecord,
  RefreshTokenRecord,
  ReportRecord,
} from "./store.js";

const { Pool } = pg;

const DATA_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".data");
const POSTGRES_SNAPSHOT_ROW_ID = "default";
const POSTGRES_SNAPSHOT_SCHEMA_VERSION = 1;
const POSTGRES_SNAPSHOT_TABLE = "api_store_snapshots";

export const API_STORE_SNAPSHOT_PATH = resolve(DATA_ROOT, "api-store.json");

export type StorePersistenceDriver = "snapshot_file" | "postgres_snapshot";
export type RequestedStorePersistenceDriver = StorePersistenceDriver | "postgres" | "unknown";

type ConnectionTargetSummary =
  | {
      configured: false;
      valid: false;
    }
  | {
      configured: true;
      database?: string;
      host?: string;
      port?: string;
      protocol?: string;
      valid: true;
    }
  | {
      configured: true;
      reason: string;
      valid: false;
    };

type StorePersistenceResolution = {
  activeDriver: StorePersistenceDriver;
  database: ConnectionTargetSummary;
  postgresNormalizedMirror: PostgresNormalizedMirrorStatus;
  postgresNormalizedReadOverlay: PostgresNormalizedReadOverlayStatus;
  postgresSnapshotReady: boolean;
  requestedDriver: RequestedStorePersistenceDriver;
  supportedDrivers: StorePersistenceDriver[];
  warning: string;
};

type NormalizedRepositoryCounts = {
  accountChannelPreferences: number;
  accountLinks: number;
  accountLoginCodes: number;
  accountProfiles: number;
  accounts: number;
  abuseEvents: number;
  auditLogs: number;
  backofficeActions: number;
  chatMessages: number;
  chatRequests: number;
  channels: number;
  cities: number;
  cityHealthSnapshots: number;
  creatorApplications: number;
  creatorReviews: number;
  deviceRiskStates: number;
  featureFlags: number;
  geoEvents: number;
  idempotencyRecords: number;
  installIdentities: number;
  installRestrictions: number;
  installSessions: number;
  ledgerEntries: number;
  moderationActions: number;
  moderationCases: number;
  notifications: number;
  payoutAccounts: number;
  payouts: number;
  posts: number;
  refreshTokens: number;
  replies: number;
  reports: number;
  tips: number;
  votes: number;
  walletBalances: number;
  walletTopups: number;
};

type PostgresNormalizedMirrorStatus = {
  counts: NormalizedRepositoryCounts;
  enabled: boolean;
  implemented: true;
  lastAttemptedAt: string | null;
  lastError?: string;
  lastFailedAt: string | null;
  lastSucceededAt: string | null;
  mode: "best_effort_upsert_only";
  readSource: "api_store_snapshots";
  ready: boolean;
  runtimeSourceOfTruth: "api_store_snapshots";
  status: "disabled" | "failed" | "not_checked" | "pending_schema" | "ready";
  tables: string[];
  writeTarget: "normalized_phase_a_tables";
};

type PostgresNormalizedReadOverlayStatus = {
  counts: NormalizedRepositoryCounts;
  enabled: boolean;
  fallbackSource: "api_store_snapshots";
  implemented: true;
  lastAttemptedAt: string | null;
  lastError?: string;
  lastFailedAt: string | null;
  lastSucceededAt: string | null;
  mode: "best_effort_read_overlay";
  ready: boolean;
  runtimeSourceOfTruth: "api_store_snapshots_with_normalized_overlay";
  source: "normalized_phase_a_tables";
  status: "disabled" | "failed" | "not_checked" | "pending_schema" | "ready";
  tables: string[];
};

let pool: pg.Pool | null = null;
let postgresSnapshotReady = false;
const emptyNormalizedRepositoryCounts = (): NormalizedRepositoryCounts => ({
  accountChannelPreferences: 0,
  accountLinks: 0,
  accountLoginCodes: 0,
  accountProfiles: 0,
  accounts: 0,
  abuseEvents: 0,
  auditLogs: 0,
  backofficeActions: 0,
  chatMessages: 0,
  chatRequests: 0,
  channels: 0,
  cities: 0,
  cityHealthSnapshots: 0,
  creatorApplications: 0,
  creatorReviews: 0,
  deviceRiskStates: 0,
  featureFlags: 0,
  geoEvents: 0,
  idempotencyRecords: 0,
  installIdentities: 0,
  installRestrictions: 0,
  installSessions: 0,
  ledgerEntries: 0,
  moderationActions: 0,
  moderationCases: 0,
  notifications: 0,
  payoutAccounts: 0,
  payouts: 0,
  posts: 0,
  refreshTokens: 0,
  replies: 0,
  reports: 0,
  tips: 0,
  votes: 0,
  walletBalances: 0,
  walletTopups: 0,
});

let postgresNormalizedMirror: PostgresNormalizedMirrorStatus = {
  counts: emptyNormalizedRepositoryCounts(),
  enabled: true,
  implemented: true,
  lastAttemptedAt: null,
  lastFailedAt: null,
  lastSucceededAt: null,
  mode: "best_effort_upsert_only",
  readSource: "api_store_snapshots",
  ready: false,
  runtimeSourceOfTruth: "api_store_snapshots",
  status: "not_checked",
  tables: [],
  writeTarget: "normalized_phase_a_tables",
};

let postgresNormalizedReadOverlay: PostgresNormalizedReadOverlayStatus = {
  counts: emptyNormalizedRepositoryCounts(),
  enabled: true,
  fallbackSource: "api_store_snapshots",
  implemented: true,
  lastAttemptedAt: null,
  lastFailedAt: null,
  lastSucceededAt: null,
  mode: "best_effort_read_overlay",
  ready: false,
  runtimeSourceOfTruth: "api_store_snapshots_with_normalized_overlay",
  source: "normalized_phase_a_tables",
  status: "not_checked",
  tables: [],
};

const supportedDrivers: StorePersistenceDriver[] = ["snapshot_file", "postgres_snapshot"];
const normalizedMirrorTables = [
  "cities",
  "accounts",
  "account_profiles",
  "install_identities",
  "account_links",
  "account_login_codes",
  "install_sessions",
  "refresh_tokens",
  "channels",
  "account_channel_preferences",
  "creator_applications",
  "creator_reviews",
  "wallet_balances",
  "wallet_topups",
  "ledger_entries",
  "tip_events",
  "payout_accounts",
  "payouts",
  "feature_flags",
  "city_health_snapshots",
  "posts",
  "replies",
  "votes",
  "chat_requests",
  "chat_messages",
  "notifications",
  "moderation_cases",
  "moderation_actions",
  "reports",
  "backoffice_actions",
  "audit_logs",
  "idempotency_keys",
  "install_security_state",
  "install_restrictions",
  "geo_events",
  "abuse_events",
  "rate_limit_counters",
];

const normalizeRequestedStorageDriver = (value: string | undefined): RequestedStorePersistenceDriver => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return "snapshot_file";
  }

  if (normalized === "snapshot_file" || normalized === "postgres_snapshot" || normalized === "postgres") {
    return normalized;
  }

  return "unknown";
};

export const summarizeConnectionTarget = (value: string | undefined): ConnectionTargetSummary => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return {
      configured: false,
      valid: false,
    };
  }

  try {
    const url = new URL(trimmed);
    return {
      configured: true,
      database: decodeURIComponent(url.pathname.replace(/^\/+/, "")) || undefined,
      host: url.hostname || undefined,
      port: url.port || undefined,
      protocol: url.protocol.replace(/:$/, "") || undefined,
      valid: true,
    };
  } catch {
    return {
      configured: true,
      reason: "Invalid connection URL format.",
      valid: false,
    };
  }
};

const isPostgresRequested = (driver: RequestedStorePersistenceDriver) =>
  driver === "postgres" || driver === "postgres_snapshot";

const usePostgresSsl = () => {
  const normalized = process.env.DATABASE_SSL?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "require";
};

export const resolveStorePersistence = (): StorePersistenceResolution => {
  const requestedDriver = normalizeRequestedStorageDriver(process.env.API_STORAGE_DRIVER);
  const database = summarizeConnectionTarget(process.env.DATABASE_URL);

  if (isPostgresRequested(requestedDriver)) {
    return {
      activeDriver: database.configured && database.valid ? "postgres_snapshot" : "snapshot_file",
      database,
      postgresNormalizedMirror,
      postgresNormalizedReadOverlay,
      postgresSnapshotReady,
      requestedDriver,
      supportedDrivers,
      warning:
        database.configured && database.valid
          ? "Postgres snapshot persistence is active when the API starts successfully. Phase A tables are mirrored and read as a best-effort overlay."
          : "API_STORAGE_DRIVER requests Postgres, but DATABASE_URL is missing or invalid.",
    };
  }

  return {
    activeDriver: "snapshot_file",
    database,
    postgresNormalizedMirror: {
      counts: emptyNormalizedRepositoryCounts(),
      enabled: false,
      implemented: true,
      lastAttemptedAt: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      mode: "best_effort_upsert_only",
      readSource: "api_store_snapshots",
      ready: false,
      runtimeSourceOfTruth: "api_store_snapshots",
      status: "disabled",
      tables: [],
      writeTarget: "normalized_phase_a_tables",
    },
    postgresNormalizedReadOverlay: {
      counts: emptyNormalizedRepositoryCounts(),
      enabled: false,
      fallbackSource: "api_store_snapshots",
      implemented: true,
      lastAttemptedAt: null,
      lastFailedAt: null,
      lastSucceededAt: null,
      mode: "best_effort_read_overlay",
      ready: false,
      runtimeSourceOfTruth: "api_store_snapshots_with_normalized_overlay",
      source: "normalized_phase_a_tables",
      status: "disabled",
      tables: [],
    },
    postgresSnapshotReady,
    requestedDriver,
    supportedDrivers,
    warning: database.configured
      ? "DATABASE_URL is configured, but API_STORAGE_DRIVER is snapshot_file. Runtime persists to apps/api/.data/api-store.json."
      : "No DATABASE_URL is active. Runtime persists to apps/api/.data/api-store.json.",
  };
};

const getPostgresPool = () => {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required for Postgres persistence.");
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: usePostgresSsl() ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
};

const ensurePostgresSnapshotTable = async () => {
  await getPostgresPool().query(`
    CREATE TABLE IF NOT EXISTS ${POSTGRES_SNAPSHOT_TABLE} (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      schema_version INTEGER NOT NULL DEFAULT ${POSTGRES_SNAPSHOT_SCHEMA_VERSION},
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  postgresSnapshotReady = true;
};

const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");

const getInstallAccountId = (store: ApiStore, installIdentityId: string) =>
  store.installIdentities.find((entry) => entry.id === installIdentityId)?.accountId ?? null;

const getNormalizedMirrorTables = async (client: pg.PoolClient) => {
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
    `,
    [normalizedMirrorTables],
  );

  return result.rows.map((row) => row.table_name);
};

const getNormalizedTableReadiness = async (client: pg.PoolClient) => {
  const tables = await getNormalizedMirrorTables(client);
  const tableSet = new Set(tables);
  const missingTables = normalizedMirrorTables.filter((tableName) => !tableSet.has(tableName));

  return {
    missingTables,
    tables,
  };
};

const ensureNormalizedMirrorTablesExist = async (client: pg.PoolClient) => {
  const { missingTables, tables } = await getNormalizedTableReadiness(client);

  if (missingTables.length > 0) {
    postgresNormalizedMirror = {
      ...postgresNormalizedMirror,
      lastError: `Missing tables: ${missingTables.join(", ")}`,
      ready: false,
      status: "pending_schema",
      tables,
    };
    return false;
  }

  return true;
};

const mirrorNormalizedTables = async (store: ApiStore) => {
  const client = await getPostgresPool().connect();
  const attemptedAt = new Date().toISOString();
  postgresNormalizedMirror = {
    ...postgresNormalizedMirror,
    lastAttemptedAt: attemptedAt,
    status: "not_checked",
  };

  try {
    const hasMirrorTables = await ensureNormalizedMirrorTablesExist(client);
    if (!hasMirrorTables) {
      return;
    }

    await client.query("BEGIN");

    for (const city of store.cities) {
      await client.query(
        `
          INSERT INTO cities (
            id,
            slug,
            label,
            country_code,
            centroid,
            is_explorer_enabled
          )
          VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7)
          ON CONFLICT (id) DO UPDATE SET
            slug = EXCLUDED.slug,
            label = EXCLUDED.label,
            country_code = EXCLUDED.country_code,
            centroid = EXCLUDED.centroid,
            is_explorer_enabled = EXCLUDED.is_explorer_enabled
        `,
        [city.id, city.slug, city.label, city.countryCode, city.lng, city.lat, city.isExplorerEnabled],
      );
    }

    for (const account of store.accounts) {
      await client.query(
        `
          INSERT INTO accounts (
            id,
            username,
            email_normalized,
            email_verified_at,
            discoverable,
            created_at,
            last_seen_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            email_normalized = EXCLUDED.email_normalized,
            email_verified_at = EXCLUDED.email_verified_at,
            discoverable = EXCLUDED.discoverable,
            last_seen_at = EXCLUDED.last_seen_at
        `,
        [
          account.id,
          account.username,
          account.emailNormalized,
          account.emailVerifiedAt,
          account.discoverable,
          account.createdAt,
          account.lastSeenAt,
        ],
      );
    }

    for (const profile of Object.values(store.accountProfiles)) {
      await client.query(
        `
          INSERT INTO account_profiles (
            account_id,
            display_name,
            bio,
            avatar_url,
            is_creator
          )
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (account_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            bio = EXCLUDED.bio,
            avatar_url = EXCLUDED.avatar_url,
            is_creator = EXCLUDED.is_creator,
            updated_at = NOW()
        `,
        [profile.accountId, profile.displayName, profile.bio, profile.avatarUrl, profile.isCreator],
      );
    }

    for (const installIdentity of store.installIdentities) {
      await client.query(
        `
          INSERT INTO install_identities (
            id,
            install_key,
            access_token,
            account_id,
            account_username,
            account_display_name,
            discoverable,
            city_id,
            city_label,
            adult_gate_accepted,
            adult_verified,
            plus_active,
            plus,
            created_at,
            last_seen_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, NOW())
          ON CONFLICT (id) DO UPDATE SET
            install_key = EXCLUDED.install_key,
            access_token = EXCLUDED.access_token,
            account_id = EXCLUDED.account_id,
            account_username = EXCLUDED.account_username,
            account_display_name = EXCLUDED.account_display_name,
            discoverable = EXCLUDED.discoverable,
            city_id = EXCLUDED.city_id,
            city_label = EXCLUDED.city_label,
            adult_gate_accepted = EXCLUDED.adult_gate_accepted,
            adult_verified = EXCLUDED.adult_verified,
            plus_active = EXCLUDED.plus_active,
            plus = EXCLUDED.plus,
            last_seen_at = NOW()
        `,
        [
          installIdentity.id,
          installIdentity.installKey,
          installIdentity.accessToken,
          installIdentity.accountId ?? null,
          installIdentity.accountUsername ?? null,
          installIdentity.accountDisplayName ?? null,
          installIdentity.discoverable ?? false,
          installIdentity.cityId,
          installIdentity.cityLabel,
          installIdentity.adultGateAccepted,
          installIdentity.adultVerified,
          installIdentity.plus.active,
          JSON.stringify(installIdentity.plus),
          installIdentity.createdAt,
        ],
      );
    }

    const linksBySafeConstraintOrder = [...store.accountLinks].sort((left, right) => {
      if (left.unlinkedAt && !right.unlinkedAt) {
        return -1;
      }

      if (!left.unlinkedAt && right.unlinkedAt) {
        return 1;
      }

      return Date.parse(left.linkedAt) - Date.parse(right.linkedAt);
    });

    for (const link of linksBySafeConstraintOrder) {
      await client.query(
        `
          INSERT INTO account_links (
            account_id,
            install_identity_id,
            linked_at,
            unlinked_at
          )
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (account_id, install_identity_id, linked_at) DO UPDATE SET
            unlinked_at = EXCLUDED.unlinked_at
        `,
        [link.accountId, link.installIdentityId, link.linkedAt, link.unlinkedAt],
      );
    }

    for (const code of store.accountLoginCodes) {
      await client.query(
        `
          INSERT INTO account_login_codes (
            id,
            email_normalized,
            username,
            install_identity_id,
            code_hash,
            attempt_count,
            created_at,
            expires_at,
            consumed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            attempt_count = EXCLUDED.attempt_count,
            consumed_at = EXCLUDED.consumed_at
        `,
        [
          code.id,
          code.emailNormalized,
          code.username,
          code.installIdentityId,
          code.codeHash ?? hashSecret(code.code),
          code.attemptCount,
          code.createdAt,
          code.expiresAt,
          code.consumedAt ?? null,
        ],
      );
    }

    for (const session of store.installSessions) {
      await client.query(
        `
          INSERT INTO install_sessions (
            id,
            install_identity_id,
            account_id,
            access_token_hash,
            token_family_id,
            status,
            created_at,
            last_refreshed_at,
            last_seen_at,
            access_token_expires_at,
            revoked_at,
            revocation_reason
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            account_id = EXCLUDED.account_id,
            access_token_hash = EXCLUDED.access_token_hash,
            token_family_id = EXCLUDED.token_family_id,
            status = EXCLUDED.status,
            last_refreshed_at = EXCLUDED.last_refreshed_at,
            last_seen_at = EXCLUDED.last_seen_at,
            access_token_expires_at = EXCLUDED.access_token_expires_at,
            revoked_at = EXCLUDED.revoked_at,
            revocation_reason = EXCLUDED.revocation_reason
        `,
        [
          session.id,
          session.installIdentityId,
          getInstallAccountId(store, session.installIdentityId),
          session.accessTokenHash,
          session.tokenFamilyId,
          session.status,
          session.createdAt,
          session.lastRefreshedAt,
          session.lastSeenAt,
          session.accessTokenExpiresAt,
          session.revokedAt ?? null,
          session.revocationReason ?? null,
        ],
      );
    }

    for (const token of store.refreshTokens) {
      await client.query(
        `
          INSERT INTO refresh_tokens (
            id,
            install_identity_id,
            install_session_id,
            token_hash,
            token_family_id,
            created_at,
            expires_at,
            used_at,
            revoked_at,
            revocation_reason
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            token_hash = EXCLUDED.token_hash,
            token_family_id = EXCLUDED.token_family_id,
            expires_at = EXCLUDED.expires_at,
            used_at = EXCLUDED.used_at,
            revoked_at = EXCLUDED.revoked_at,
            revocation_reason = EXCLUDED.revocation_reason
        `,
        [
          token.id,
          token.installIdentityId,
          token.installSessionId,
          token.tokenHash,
          token.tokenFamilyId,
          token.createdAt,
          token.expiresAt,
          token.usedAt ?? null,
          token.revokedAt ?? null,
          token.revocationReason ?? null,
        ],
      );
    }

    for (const token of store.refreshTokens.filter((entry) => entry.replacedByTokenId)) {
      await client.query(
        "UPDATE refresh_tokens SET replaced_by_token_id = $1 WHERE id = $2",
        [token.replacedByTokenId, token.id],
      );
    }

    for (const record of Object.values(store.idempotencyRecords)) {
      await client.query(
        `
          INSERT INTO idempotency_keys (
            id,
            scope,
            idempotency_key,
            request_hash,
            response_status,
            response_body,
            created_at,
            expires_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            scope = EXCLUDED.scope,
            idempotency_key = EXCLUDED.idempotency_key,
            request_hash = EXCLUDED.request_hash,
            response_status = EXCLUDED.response_status,
            response_body = EXCLUDED.response_body,
            created_at = EXCLUDED.created_at,
            expires_at = EXCLUDED.expires_at
        `,
        [
          record.id,
          record.scope,
          record.idempotencyKey,
          record.bodySignature,
          record.statusCode,
          JSON.stringify(record.response === undefined ? {} : record.response),
          record.createdAt,
          idempotencyRecordExpiresAt(record),
        ],
      );
    }

    for (const riskState of Object.values(store.deviceRiskState)) {
      const installIdentityId = nullableInstallIdentityId(store, riskState.installIdentityId);
      if (!installIdentityId) {
        continue;
      }

      await client.query(
        `
          INSERT INTO install_security_state (
            install_identity_id,
            device_risk_score,
            flagged_at,
            restricted_at,
            last_geo_city_id,
            last_geo_lat,
            last_geo_lng,
            last_geo_at,
            last_updated_at
          )
          VALUES ($1, $2, $3, $4, NULL, NULL, NULL, NULL, $5)
          ON CONFLICT (install_identity_id) DO UPDATE SET
            device_risk_score = EXCLUDED.device_risk_score,
            flagged_at = EXCLUDED.flagged_at,
            restricted_at = EXCLUDED.restricted_at,
            last_updated_at = EXCLUDED.last_updated_at
        `,
        [
          installIdentityId,
          Math.max(0, Math.trunc(riskState.score)),
          riskState.flaggedAt ?? null,
          riskState.restrictedAt ?? null,
          riskState.lastUpdatedAt,
        ],
      );
    }

    for (const restriction of store.installRestrictions) {
      const installIdentityId = nullableInstallIdentityId(store, restriction.installIdentityId);
      if (!installIdentityId) {
        continue;
      }

      await client.query(
        `
          INSERT INTO install_restrictions (
            id,
            install_identity_id,
            type,
            reason_code,
            trigger_source,
            metadata,
            starts_at,
            ends_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            type = EXCLUDED.type,
            reason_code = EXCLUDED.reason_code,
            trigger_source = EXCLUDED.trigger_source,
            metadata = EXCLUDED.metadata,
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at
        `,
        [
          restriction.id,
          installIdentityId,
          normalizeRestrictionType(restriction.type),
          restriction.reasonCode,
          restriction.triggerSource,
          JSON.stringify(restriction.metadata ?? {}),
          restriction.startsAt,
          restriction.endsAt,
        ],
      );
    }

    for (const event of store.geoEvents) {
      await client.query(
        `
          INSERT INTO geo_events (
            id,
            install_identity_id,
            account_id,
            city_id,
            lat,
            lng,
            kind,
            risk_delta,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
          ON CONFLICT (id) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            city_id = EXCLUDED.city_id,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            kind = EXCLUDED.kind,
            risk_delta = EXCLUDED.risk_delta,
            metadata = EXCLUDED.metadata,
            created_at = EXCLUDED.created_at
        `,
        [
          event.id,
          nullableInstallIdentityId(store, event.installIdentityId),
          knownAccountId(store, event.accountId),
          nullableCityId(store, event.cityId),
          event.lat ?? null,
          event.lng ?? null,
          event.kind,
          Math.trunc(event.riskDelta),
          JSON.stringify(event.metadata ?? {}),
          event.createdAt,
        ],
      );
    }

    for (const event of store.abuseEvents) {
      await client.query(
        `
          INSERT INTO abuse_events (
            id,
            install_identity_id,
            account_id,
            ip_hash,
            route_name,
            kind,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
          ON CONFLICT (id) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            ip_hash = EXCLUDED.ip_hash,
            route_name = EXCLUDED.route_name,
            kind = EXCLUDED.kind,
            metadata = EXCLUDED.metadata,
            created_at = EXCLUDED.created_at
        `,
        [
          event.id,
          nullableInstallIdentityId(store, event.installIdentityId),
          knownAccountId(store, event.accountId),
          event.ipHash ?? null,
          event.routeName,
          event.kind,
          JSON.stringify(event.metadata ?? {}),
          event.createdAt,
        ],
      );
    }

    for (const counter of Object.values(store.rateLimitCounters)) {
      await client.query(
        `
          INSERT INTO rate_limit_counters (
            key,
            count,
            window_ends_at,
            blocked_until,
            last_exceeded_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (key) DO UPDATE SET
            count = EXCLUDED.count,
            window_ends_at = EXCLUDED.window_ends_at,
            blocked_until = EXCLUDED.blocked_until,
            last_exceeded_at = EXCLUDED.last_exceeded_at,
            updated_at = NOW()
        `,
        [
          counter.key,
          Math.max(0, Math.trunc(counter.count)),
          counter.windowEndsAt,
          counter.blockedUntil ?? null,
          counter.lastExceededAt ?? null,
        ],
      );
    }

    for (const preferences of Object.values(store.accountChannelPreferences)) {
      await client.query(
        `
          INSERT INTO account_channel_preferences (
            account_id,
            city_id,
            favorite_channel_ids,
            joined_channel_ids,
            recent_channel_ids,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (account_id, city_id) DO UPDATE SET
            favorite_channel_ids = EXCLUDED.favorite_channel_ids,
            joined_channel_ids = EXCLUDED.joined_channel_ids,
            recent_channel_ids = EXCLUDED.recent_channel_ids,
            updated_at = EXCLUDED.updated_at
        `,
        [
          preferences.accountId,
          preferences.cityId,
          preferences.favoriteChannelIds,
          preferences.joinedChannelIds,
          preferences.recentChannelIds,
          preferences.updatedAt,
        ],
      );
    }

    for (const flag of store.featureFlags) {
      await client.query(
        `
          INSERT INTO feature_flags (
            id,
            key,
            label,
            description,
            enabled,
            audience,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW())
          ON CONFLICT (id) DO UPDATE SET
            key = EXCLUDED.key,
            label = EXCLUDED.label,
            description = EXCLUDED.description,
            enabled = EXCLUDED.enabled,
            audience = EXCLUDED.audience,
            updated_at = NOW()
        `,
        [
          flag.id,
          flag.key,
          flag.label,
          flag.description,
          flag.enabled,
          normalizeFeatureAudience(flag.audience),
        ],
      );
    }

    for (const health of store.cityHealth) {
      await client.query(
        `
          INSERT INTO city_health_snapshots (
            city_id,
            live_posts,
            open_reports,
            active_creators,
            wallet_volume_cents,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (city_id) DO UPDATE SET
            live_posts = EXCLUDED.live_posts,
            open_reports = EXCLUDED.open_reports,
            active_creators = EXCLUDED.active_creators,
            wallet_volume_cents = EXCLUDED.wallet_volume_cents,
            updated_at = NOW()
        `,
        [
          knownCityId(store, health.cityId),
          health.livePosts,
          health.openReports,
          health.activeCreators,
          health.walletVolumeCents,
        ],
      );
    }

    if (store.creatorApplication.id) {
      await client.query(
        `
          INSERT INTO creator_applications (
            id,
            install_identity_id,
            account_id,
            account_username,
            account_display_name,
            display_name,
            status,
            adult_verified,
            kyc_state,
            payout_state,
            submitted_at,
            reviewed_at,
            notes
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (id) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            account_username = EXCLUDED.account_username,
            account_display_name = EXCLUDED.account_display_name,
            display_name = EXCLUDED.display_name,
            status = EXCLUDED.status,
            adult_verified = EXCLUDED.adult_verified,
            kyc_state = EXCLUDED.kyc_state,
            payout_state = EXCLUDED.payout_state,
            submitted_at = EXCLUDED.submitted_at,
            reviewed_at = EXCLUDED.reviewed_at,
            notes = EXCLUDED.notes
        `,
        [
          store.creatorApplication.id,
          requiredInstallIdentityId(store, store.creatorApplication.installIdentityId),
          knownAccountId(store, store.creatorApplication.accountId),
          store.creatorApplication.accountUsername ?? null,
          store.creatorApplication.accountDisplayName ?? null,
          creatorApplicationDisplayName(store.creatorApplication),
          normalizeCreatorStatus(store.creatorApplication.status),
          store.creatorApplication.adultVerified,
          normalizeKycState(store.creatorApplication.kycState),
          normalizePayoutState(store.creatorApplication.payoutState),
          store.creatorApplication.submittedAt,
          store.creatorApplication.reviewedAt ?? null,
          store.creatorApplication.notes ?? "",
        ],
      );
    }

    for (const review of store.creatorReviews) {
      if (review.creatorApplicationId !== store.creatorApplication.id) {
        continue;
      }

      await client.query(
        `
          INSERT INTO creator_reviews (
            id,
            creator_application_id,
            reviewer_id,
            decision,
            note,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            creator_application_id = EXCLUDED.creator_application_id,
            reviewer_id = EXCLUDED.reviewer_id,
            decision = EXCLUDED.decision,
            note = EXCLUDED.note,
            created_at = EXCLUDED.created_at
        `,
        [
          review.id,
          review.creatorApplicationId,
          review.reviewerId,
          normalizeCreatorReviewDecision(review.decision),
          review.note,
          review.createdAt,
        ],
      );
    }

    for (const [ownerKey, wallet] of Object.entries(store.wallets)) {
      const owner = walletOwnerFromKey(store, ownerKey);

      await client.query(
        `
          INSERT INTO wallet_balances (
            owner_key,
            install_identity_id,
            account_id,
            currency,
            available_cents,
            pending_cents,
            lifetime_tipped_cents,
            lifetime_earned_cents,
            lifetime_paid_out_cents,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (owner_key) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            currency = EXCLUDED.currency,
            available_cents = EXCLUDED.available_cents,
            pending_cents = EXCLUDED.pending_cents,
            lifetime_tipped_cents = EXCLUDED.lifetime_tipped_cents,
            lifetime_earned_cents = EXCLUDED.lifetime_earned_cents,
            lifetime_paid_out_cents = EXCLUDED.lifetime_paid_out_cents,
            updated_at = NOW()
        `,
        [
          ownerKey,
          owner.installIdentityId,
          owner.accountId,
          wallet.currency,
          wallet.availableCents,
          wallet.pendingCents,
          wallet.lifetimeTippedCents,
          wallet.lifetimeEarnedCents,
          wallet.lifetimePaidOutCents,
        ],
      );
    }

    for (const topup of store.walletTopups) {
      await client.query(
        `
          INSERT INTO wallet_topups (
            id,
            install_identity_id,
            account_id,
            provider,
            status,
            gross_cents,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            provider = EXCLUDED.provider,
            status = EXCLUDED.status,
            gross_cents = EXCLUDED.gross_cents,
            created_at = EXCLUDED.created_at
        `,
        [
          topup.id,
          requiredInstallIdentityId(store, topup.installIdentityId),
          knownAccountId(store, topup.accountId),
          normalizeWalletTopupProvider(topup.provider),
          normalizeWalletTopupStatus(topup.status),
          topup.grossCents,
          topup.createdAt,
        ],
      );
    }

    for (const entry of store.ledger) {
      await client.query(
        `
          INSERT INTO ledger_entries (
            id,
            owner_key,
            install_identity_id,
            account_id,
            kind,
            status,
            gross_cents,
            platform_fee_cents,
            net_cents,
            ref_type,
            ref_id,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (id) DO UPDATE SET
            owner_key = EXCLUDED.owner_key,
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            kind = EXCLUDED.kind,
            status = EXCLUDED.status,
            gross_cents = EXCLUDED.gross_cents,
            platform_fee_cents = EXCLUDED.platform_fee_cents,
            net_cents = EXCLUDED.net_cents,
            ref_type = EXCLUDED.ref_type,
            ref_id = EXCLUDED.ref_id,
            created_at = EXCLUDED.created_at
        `,
        [
          entry.id,
          ledgerOwnerKey(store, entry),
          entry.installIdentityId,
          knownAccountId(store, entry.accountId),
          normalizeLedgerKind(entry.kind),
          normalizeLedgerStatus(entry.status),
          entry.grossCents,
          entry.platformFeeCents,
          entry.netCents,
          entry.refType,
          entry.refId,
          entry.createdAt,
        ],
      );
    }

    for (const tip of store.tips) {
      await client.query(
        `
          INSERT INTO tip_events (
            id,
            sender_install_identity_id,
            recipient_install_identity_id,
            sender_account_id,
            recipient_account_id,
            target_type,
            target_id,
            gross_cents,
            platform_fee_cents,
            creator_net_cents,
            status,
            ledger_entry_id,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12)
          ON CONFLICT (id) DO UPDATE SET
            sender_install_identity_id = EXCLUDED.sender_install_identity_id,
            recipient_install_identity_id = EXCLUDED.recipient_install_identity_id,
            sender_account_id = EXCLUDED.sender_account_id,
            recipient_account_id = EXCLUDED.recipient_account_id,
            target_type = EXCLUDED.target_type,
            target_id = EXCLUDED.target_id,
            gross_cents = EXCLUDED.gross_cents,
            platform_fee_cents = EXCLUDED.platform_fee_cents,
            creator_net_cents = EXCLUDED.creator_net_cents,
            status = EXCLUDED.status,
            created_at = EXCLUDED.created_at
        `,
        [
          tip.id,
          requiredInstallIdentityId(store, tip.senderInstallIdentityId),
          requiredInstallIdentityId(store, tip.recipientInstallIdentityId),
          knownAccountId(store, tip.senderAccountId),
          knownAccountId(store, tip.recipientAccountId),
          normalizeTipTargetType(tip.targetType),
          tip.targetId,
          tip.grossCents,
          tip.platformFeeCents,
          tip.creatorNetCents,
          normalizeLedgerStatus(tip.status),
          tip.createdAt,
        ],
      );
    }

    const payoutAccountIds = new Set(store.payoutAccounts.map((account) => account.id));
    for (const payoutAccount of store.payoutAccounts) {
      await client.query(
        `
          INSERT INTO payout_accounts (
            id,
            install_identity_id,
            account_id,
            provider,
            label,
            state,
            last_checked_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            provider = EXCLUDED.provider,
            label = EXCLUDED.label,
            state = EXCLUDED.state,
            last_checked_at = EXCLUDED.last_checked_at,
            updated_at = NOW()
        `,
        [
          payoutAccount.id,
          requiredInstallIdentityId(store, payoutAccount.installIdentityId),
          knownAccountId(store, payoutAccount.accountId),
          normalizePayoutAccountProvider(payoutAccount.provider),
          payoutAccount.label,
          normalizePayoutAccountState(payoutAccount.state),
          payoutAccount.lastCheckedAt,
        ],
      );
    }

    for (const payout of store.payouts) {
      if (!payoutAccountIds.has(payout.payoutAccountId)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO payouts (
            id,
            install_identity_id,
            account_id,
            payout_account_id,
            status,
            gross_cents,
            fee_cents,
            net_cents,
            requested_at,
            settled_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (id) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            payout_account_id = EXCLUDED.payout_account_id,
            status = EXCLUDED.status,
            gross_cents = EXCLUDED.gross_cents,
            fee_cents = EXCLUDED.fee_cents,
            net_cents = EXCLUDED.net_cents,
            requested_at = EXCLUDED.requested_at,
            settled_at = EXCLUDED.settled_at
        `,
        [
          payout.id,
          requiredInstallIdentityId(store, payout.installIdentityId),
          knownAccountId(store, payout.accountId),
          payout.payoutAccountId,
          normalizePayoutStatus(payout.status),
          payout.grossCents,
          payout.feeCents,
          payout.netCents,
          payout.requestedAt,
          payout.settledAt,
        ],
      );
    }

    for (const channel of store.channels) {
      await client.query(
        `
          INSERT INTO channels (
            id,
            slug,
            title,
            description,
            city_id,
            is_verified,
            is_exclusive,
            is_adult_only,
            member_count
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            slug = EXCLUDED.slug,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            city_id = EXCLUDED.city_id,
            is_verified = EXCLUDED.is_verified,
            is_exclusive = EXCLUDED.is_exclusive,
            is_adult_only = EXCLUDED.is_adult_only,
            member_count = EXCLUDED.member_count
        `,
        [
          channel.id,
          channel.slug,
          channel.title,
          channel.description,
          knownCityId(store, channel.cityId),
          channel.isVerified,
          channel.isExclusive,
          channel.isAdultOnly,
          channel.memberCount,
        ],
      );
    }

    for (const post of store.posts) {
      await client.query(
        `
          INSERT INTO posts (
            id,
            city_id,
            channel_id,
            install_identity_id,
            recipient_install_identity_id,
            account_id,
            account_username,
            account_display_name,
            account_is_creator,
            author_label,
            body,
            score,
            reply_count,
            tags,
            media,
            tip_total_cents,
            can_tip,
            is_pinned,
            moderation,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, $20)
          ON CONFLICT (id) DO UPDATE SET
            city_id = EXCLUDED.city_id,
            channel_id = EXCLUDED.channel_id,
            install_identity_id = EXCLUDED.install_identity_id,
            recipient_install_identity_id = EXCLUDED.recipient_install_identity_id,
            account_id = EXCLUDED.account_id,
            account_username = EXCLUDED.account_username,
            account_display_name = EXCLUDED.account_display_name,
            account_is_creator = EXCLUDED.account_is_creator,
            author_label = EXCLUDED.author_label,
            body = EXCLUDED.body,
            score = EXCLUDED.score,
            reply_count = EXCLUDED.reply_count,
            tags = EXCLUDED.tags,
            media = EXCLUDED.media,
            tip_total_cents = EXCLUDED.tip_total_cents,
            can_tip = EXCLUDED.can_tip,
            is_pinned = EXCLUDED.is_pinned,
            moderation = EXCLUDED.moderation,
            created_at = EXCLUDED.created_at
        `,
        [
          post.id,
          knownCityId(store, post.cityId),
          knownChannelId(store, post.channelId),
          requiredInstallIdentityId(store, post.recipientInstallIdentityId),
          nullableInstallIdentityId(store, post.recipientInstallIdentityId),
          knownAccountId(store, post.accountId),
          post.accountUsername ?? null,
          post.accountDisplayName ?? null,
          post.accountIsCreator ?? false,
          post.authorLabel,
          post.body,
          post.score,
          post.replyCount,
          post.tags,
          JSON.stringify(post.media ?? []),
          post.tipTotalCents,
          post.canTip,
          post.isPinned,
          normalizeModerationState(post.moderation),
          post.createdAt,
        ],
      );
    }

    for (const reply of store.replies) {
      const parentPost = store.posts.find((post) => post.id === reply.postId);
      if (!parentPost) {
        continue;
      }

      await client.query(
        `
          INSERT INTO replies (
            id,
            post_id,
            install_identity_id,
            recipient_install_identity_id,
            account_id,
            account_username,
            account_display_name,
            account_is_creator,
            author_label,
            body,
            score,
            tip_total_cents,
            can_tip,
            moderation,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (id) DO UPDATE SET
            post_id = EXCLUDED.post_id,
            install_identity_id = EXCLUDED.install_identity_id,
            recipient_install_identity_id = EXCLUDED.recipient_install_identity_id,
            account_id = EXCLUDED.account_id,
            account_username = EXCLUDED.account_username,
            account_display_name = EXCLUDED.account_display_name,
            account_is_creator = EXCLUDED.account_is_creator,
            author_label = EXCLUDED.author_label,
            body = EXCLUDED.body,
            score = EXCLUDED.score,
            tip_total_cents = EXCLUDED.tip_total_cents,
            can_tip = EXCLUDED.can_tip,
            moderation = EXCLUDED.moderation,
            created_at = EXCLUDED.created_at
        `,
        [
          reply.id,
          reply.postId,
          requiredInstallIdentityId(store, reply.recipientInstallIdentityId ?? parentPost.recipientInstallIdentityId),
          nullableInstallIdentityId(store, reply.recipientInstallIdentityId),
          knownAccountId(store, reply.accountId),
          reply.accountUsername ?? null,
          reply.accountDisplayName ?? null,
          reply.accountIsCreator ?? false,
          reply.authorLabel,
          reply.body,
          reply.score,
          reply.tipTotalCents,
          reply.canTip,
          normalizeModerationState(reply.moderation),
          reply.createdAt,
        ],
      );
    }

    const moderationCaseIds = new Set(store.moderationCases.map((caseItem) => caseItem.id));
    for (const caseItem of store.moderationCases) {
      await client.query(
        `
          INSERT INTO moderation_cases (
            id,
            city_id,
            target_type,
            target_id,
            account_id,
            reason,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (id) DO UPDATE SET
            city_id = EXCLUDED.city_id,
            target_type = EXCLUDED.target_type,
            target_id = EXCLUDED.target_id,
            account_id = EXCLUDED.account_id,
            reason = EXCLUDED.reason,
            status = EXCLUDED.status,
            created_at = EXCLUDED.created_at,
            updated_at = NOW()
        `,
        [
          caseItem.id,
          knownCityId(store, caseItem.cityId),
          normalizeModerationCaseTargetType(caseItem.targetType),
          caseItem.targetId,
          knownAccountId(store, caseItem.accountId),
          caseItem.reason,
          normalizeModerationCaseStatus(caseItem.status),
          caseItem.createdAt,
        ],
      );
    }

    for (const action of store.moderationActions) {
      if (!moderationCaseIds.has(action.moderationCaseId)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO moderation_actions (
            id,
            moderation_case_id,
            admin_identity_id,
            actor_label,
            actor_role,
            action,
            note,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            moderation_case_id = EXCLUDED.moderation_case_id,
            admin_identity_id = EXCLUDED.admin_identity_id,
            actor_label = EXCLUDED.actor_label,
            actor_role = EXCLUDED.actor_role,
            action = EXCLUDED.action,
            note = EXCLUDED.note,
            created_at = EXCLUDED.created_at
        `,
        [
          action.id,
          action.moderationCaseId,
          action.actorId,
          action.actorLabel,
          null,
          normalizeModerationAction(action.action),
          action.note,
          action.createdAt,
        ],
      );
    }

    for (const report of store.reports) {
      await client.query(
        `
          INSERT INTO reports (
            id,
            reporter_install_identity_id,
            account_id,
            city_id,
            target_type,
            target_id,
            reason,
            moderation_case_id,
            status,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO UPDATE SET
            reporter_install_identity_id = EXCLUDED.reporter_install_identity_id,
            account_id = EXCLUDED.account_id,
            city_id = EXCLUDED.city_id,
            target_type = EXCLUDED.target_type,
            target_id = EXCLUDED.target_id,
            reason = EXCLUDED.reason,
            moderation_case_id = EXCLUDED.moderation_case_id,
            status = EXCLUDED.status,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
        `,
        [
          report.id,
          requiredInstallIdentityId(store, report.reporterInstallIdentityId),
          knownAccountId(store, report.accountId),
          knownCityId(store, report.cityId),
          normalizeModerationCaseTargetType(report.targetType),
          report.targetId,
          report.reason,
          moderationCaseIds.has(report.moderationCaseId) ? report.moderationCaseId : null,
          normalizeReportStatus(report.status),
          report.createdAt,
          report.updatedAt,
        ],
      );
    }

    for (const report of store.reports.filter((entry) => moderationCaseIds.has(entry.moderationCaseId))) {
      await client.query(
        "UPDATE moderation_cases SET report_id = $1, updated_at = NOW() WHERE id = $2",
        [report.id, report.moderationCaseId],
      );
    }

    for (const [key, vote] of Object.entries(store.votes)) {
      const targetType = normalizeVoteTargetType(vote.targetType);
      const actorKey = voteActorKeyFromStoreKey(key, { ...vote, targetType });

      await client.query(
        `
          INSERT INTO votes (
            id,
            install_identity_id,
            account_id,
            actor_key,
            target_type,
            target_id,
            value,
            aggregate_score
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (actor_key, target_type, target_id) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            value = EXCLUDED.value,
            aggregate_score = EXCLUDED.aggregate_score
        `,
        [
          voteId(actorKey, targetType, vote.targetId),
          requiredInstallIdentityId(store, voteInstallIdentityId(store, vote, actorKey)),
          knownAccountId(store, voteAccountId(store, vote, actorKey)),
          actorKey,
          targetType,
          vote.targetId,
          normalizeVoteValue(vote.value),
          vote.aggregateScore,
        ],
      );
    }

    const chatRequestIds = new Set(store.chatRequests.map((chatRequest) => chatRequest.id));
    for (const chatRequest of store.chatRequests) {
      await client.query(
        `
          INSERT INTO chat_requests (
            id,
            from_install_identity_id,
            from_account_id,
            to_install_identity_id,
            to_account_id,
            post_id,
            status,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            from_install_identity_id = EXCLUDED.from_install_identity_id,
            from_account_id = EXCLUDED.from_account_id,
            to_install_identity_id = EXCLUDED.to_install_identity_id,
            to_account_id = EXCLUDED.to_account_id,
            post_id = EXCLUDED.post_id,
            status = EXCLUDED.status,
            created_at = EXCLUDED.created_at
        `,
        [
          chatRequest.id,
          requiredInstallIdentityId(store, chatRequest.fromInstallIdentityId),
          knownAccountId(store, chatRequest.fromAccountId),
          requiredInstallIdentityId(store, chatRequest.toInstallIdentityId),
          knownAccountId(store, chatRequest.toAccountId),
          knownPostId(store, chatRequest.postId),
          normalizeChatRequestStatus(chatRequest.status),
          chatRequest.createdAt,
        ],
      );
    }

    for (const message of store.chatMessages) {
      if (!chatRequestIds.has(message.chatRequestId)) {
        continue;
      }

      await client.query(
        `
          INSERT INTO chat_messages (
            id,
            chat_request_id,
            sender_install_identity_id,
            account_id,
            body,
            media,
            created_at,
            read_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            chat_request_id = EXCLUDED.chat_request_id,
            sender_install_identity_id = EXCLUDED.sender_install_identity_id,
            account_id = EXCLUDED.account_id,
            body = EXCLUDED.body,
            media = EXCLUDED.media,
            created_at = EXCLUDED.created_at,
            read_at = EXCLUDED.read_at
        `,
        [
          message.id,
          message.chatRequestId,
          requiredInstallIdentityId(store, message.senderInstallIdentityId),
          knownAccountId(store, message.accountId),
          message.body,
          JSON.stringify(message.media ?? []),
          message.createdAt,
          message.readAt,
        ],
      );
    }

    for (const notification of store.notifications) {
      const accountId = knownAccountId(store, notification.accountId);
      const installIdentityId =
        nullableInstallIdentityId(store, notification.installIdentityId) ?? (accountId ? null : store.installIdentity.id);

      await client.query(
        `
          INSERT INTO notifications (
            id,
            install_identity_id,
            account_id,
            kind,
            message,
            target_route,
            metadata,
            is_read,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            install_identity_id = EXCLUDED.install_identity_id,
            account_id = EXCLUDED.account_id,
            kind = EXCLUDED.kind,
            message = EXCLUDED.message,
            target_route = EXCLUDED.target_route,
            is_read = EXCLUDED.is_read,
            created_at = EXCLUDED.created_at
        `,
        [
          notification.id,
          installIdentityId,
          accountId,
          normalizeNotificationKind(notification.kind),
          notification.message,
          notification.targetRoute ?? null,
          notification.read,
          notification.createdAt,
        ],
      );
    }

    for (const action of store.backofficeActions) {
      await client.query(
        `
          INSERT INTO backoffice_actions (
            id,
            actor_id,
            actor_role,
            action,
            entity_type,
            entity_id,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
          ON CONFLICT (id) DO UPDATE SET
            actor_id = EXCLUDED.actor_id,
            actor_role = EXCLUDED.actor_role,
            action = EXCLUDED.action,
            entity_type = EXCLUDED.entity_type,
            entity_id = EXCLUDED.entity_id,
            metadata = EXCLUDED.metadata,
            created_at = EXCLUDED.created_at
        `,
        [
          action.id,
          action.actorId,
          normalizeBackofficeRole(action.actorRole),
          action.action,
          action.entityType,
          action.entityId,
          JSON.stringify(action.metadata ?? {}),
          action.createdAt,
        ],
      );
    }

    for (const auditLog of store.auditLogs) {
      await client.query(
        `
          INSERT INTO audit_logs (
            id,
            actor_type,
            actor_id,
            actor_role,
            action,
            entity_type,
            entity_id,
            summary,
            metadata,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
          ON CONFLICT (id) DO UPDATE SET
            actor_type = EXCLUDED.actor_type,
            actor_id = EXCLUDED.actor_id,
            actor_role = EXCLUDED.actor_role,
            action = EXCLUDED.action,
            entity_type = EXCLUDED.entity_type,
            entity_id = EXCLUDED.entity_id,
            summary = EXCLUDED.summary,
            metadata = EXCLUDED.metadata,
            created_at = EXCLUDED.created_at
        `,
        [
          auditLog.id,
          normalizeAuditActorType(auditLog.actorType),
          auditLog.actorId,
          auditLog.actorRole ? normalizeBackofficeRole(auditLog.actorRole) : null,
          auditLog.action,
          auditLog.entityType,
          auditLog.entityId,
          auditLog.summary,
          JSON.stringify(auditLog.metadata ?? {}),
          auditLog.createdAt,
        ],
      );
    }

    await client.query("COMMIT");
    postgresNormalizedMirror = {
      counts: {
        accountChannelPreferences: Object.keys(store.accountChannelPreferences).length,
        accountLinks: store.accountLinks.length,
        accountLoginCodes: store.accountLoginCodes.length,
        accountProfiles: Object.keys(store.accountProfiles).length,
        accounts: store.accounts.length,
        abuseEvents: store.abuseEvents.length,
        auditLogs: store.auditLogs.length,
        backofficeActions: store.backofficeActions.length,
        chatMessages: store.chatMessages.length,
        chatRequests: store.chatRequests.length,
        channels: store.channels.length,
        cities: store.cities.length,
        cityHealthSnapshots: store.cityHealth.length,
        creatorApplications: store.creatorApplication.id ? 1 : 0,
        creatorReviews: store.creatorReviews.length,
        deviceRiskStates: Object.keys(store.deviceRiskState).length,
        featureFlags: store.featureFlags.length,
        geoEvents: store.geoEvents.length,
        idempotencyRecords: Object.keys(store.idempotencyRecords).length,
        installIdentities: store.installIdentities.length,
        installRestrictions: store.installRestrictions.length,
        installSessions: store.installSessions.length,
        ledgerEntries: store.ledger.length,
        moderationActions: store.moderationActions.length,
        moderationCases: store.moderationCases.length,
        notifications: store.notifications.length,
        payoutAccounts: store.payoutAccounts.length,
        payouts: store.payouts.length,
        posts: store.posts.length,
        refreshTokens: store.refreshTokens.length,
        replies: store.replies.length,
        reports: store.reports.length,
        tips: store.tips.length,
        votes: Object.keys(store.votes).length,
        walletBalances: Object.keys(store.wallets).length,
        walletTopups: store.walletTopups.length,
      },
      enabled: true,
      implemented: true,
      lastAttemptedAt: attemptedAt,
      lastFailedAt: postgresNormalizedMirror.lastFailedAt,
      lastSucceededAt: new Date().toISOString(),
      mode: "best_effort_upsert_only",
      readSource: "api_store_snapshots",
      ready: true,
      runtimeSourceOfTruth: "api_store_snapshots",
      status: "ready",
      tables: normalizedMirrorTables,
      writeTarget: "normalized_phase_a_tables",
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    postgresNormalizedMirror = {
      ...postgresNormalizedMirror,
      lastError: error instanceof Error ? error.message : "Unknown normalized mirror failure.",
      lastFailedAt: new Date().toISOString(),
      ready: false,
      status: "failed",
    };
  } finally {
    client.release();
  }
};

const toIsoString = (value: unknown, fallback = new Date().toISOString()) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" || typeof value === "number") {
    const timestamp = Date.parse(String(value));
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : fallback;
  }

  return fallback;
};

const toOptionalIsoString = (value: unknown) => (value ? toIsoString(value) : undefined);
const toNullableIsoString = (value: unknown) => (value ? toIsoString(value) : null);

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeCountryCode = (value: unknown): CityContext["countryCode"] =>
  value === "AT" || value === "CH" ? value : "DE";

const normalizePlusEntitlement = (value: unknown, activeFallback: boolean): PlusEntitlement => {
  const candidate = value && typeof value === "object" ? (value as Partial<PlusEntitlement>) : {};
  const active = typeof candidate.active === "boolean" ? candidate.active : activeFallback;

  return {
    active,
    explorer: typeof candidate.explorer === "boolean" ? candidate.explorer : active,
    imageChat: typeof candidate.imageChat === "boolean" ? candidate.imageChat : active,
    noAds: typeof candidate.noAds === "boolean" ? candidate.noAds : active,
    weeklyBoosts: typeof candidate.weeklyBoosts === "number" ? candidate.weeklyBoosts : active ? 3 : 0,
    weeklyColorDrops: typeof candidate.weeklyColorDrops === "number" ? candidate.weeklyColorDrops : active ? 3 : 0,
  };
};

const normalizeModerationState = (value: unknown): Post["moderation"] =>
  value === "flagged" || value === "blocked" ? value : "visible";

const normalizeModerationCaseTargetType = (value: unknown): ModerationCase["targetType"] =>
  value === "reply" || value === "chat" || value === "user" || value === "channel" ? value : "post";

const normalizeModerationCaseStatus = (value: unknown): ModerationCase["status"] =>
  value === "reviewed" || value === "actioned" ? value : "open";

const normalizeReportStatus = (value: unknown): ReportRecord["status"] =>
  value === "reviewed" || value === "actioned" || value === "dismissed" ? value : "open";

const normalizeRestrictionType = (value: unknown): InstallRestrictionRecord["type"] =>
  value === "posting_block" ||
  value === "reply_block" ||
  value === "vote_block" ||
  value === "chat_request_block" ||
  value === "geo_switch_block" ||
  value === "read_only"
    ? value
    : "read_only";

const normalizeBackofficeRole = (value: unknown): BackofficeRole =>
  value === "owner" || value === "admin" || value === "moderator" ? value : "moderator";

const normalizeAuditActorType = (value: unknown): AuditLogEntry["actorType"] =>
  value === "install" || value === "admin" || value === "system" ? value : "system";

const normalizeChatRequestStatus = (value: unknown): ChatRequest["status"] =>
  value === "accepted" || value === "declined" ? value : "pending";

const normalizeNotificationKind = (value: unknown): NotificationItem["kind"] =>
  value === "reply" ||
  value === "vote" ||
  value === "tip" ||
  value === "chat_request" ||
  value === "moderation"
    ? value
    : "system";

const normalizeCreatorStatus = (value: unknown): CreatorApplicationRecord["status"] =>
  value === "submitted" || value === "under_review" || value === "approved" || value === "rejected"
    ? value
    : "draft";

const normalizeKycState = (value: unknown): CreatorApplicationRecord["kycState"] =>
  value === "pending" || value === "verified" ? value : "not_started";

const normalizePayoutState = (value: unknown): CreatorApplicationRecord["payoutState"] =>
  value === "ready" || value === "paused" ? value : "not_ready";

const normalizeCreatorReviewDecision = (value: unknown): CreatorReview["decision"] =>
  value === "approve" || value === "reject" ? value : "request_changes";

const creatorApplicationDisplayName = (application: CreatorApplicationRecord) =>
  application.accountDisplayName ?? application.accountUsername ?? "";

const normalizeWalletTopupProvider = (value: unknown): WalletTopup["provider"] =>
  value === "stripe" ? "stripe" : "fake";

const normalizeWalletTopupStatus = (value: unknown): WalletTopup["status"] =>
  value === "pending" || value === "failed" ? value : "succeeded";

const normalizeLedgerKind = (value: unknown): LedgerEntry["kind"] =>
  value === "tip_out" ||
  value === "tip_in" ||
  value === "platform_fee" ||
  value === "plus_purchase" ||
  value === "payout"
    ? value
    : "topup";

const normalizeLedgerStatus = (value: unknown): LedgerEntry["status"] =>
  value === "available" || value === "paid_out" ? value : "pending";

const normalizePayoutAccountProvider = (value: unknown): PayoutAccount["provider"] =>
  value === "adult_psp" ? "adult_psp" : "manual";

const normalizePayoutAccountState = (value: unknown): PayoutAccount["state"] =>
  value === "review_required" || value === "ready" || value === "paused" ? value : "draft";

const normalizePayoutStatus = (value: unknown): Payout["status"] =>
  value === "processing" || value === "paid" || value === "failed" || value === "held" ? value : "queued";

const normalizeFeatureAudience = (value: unknown): FeatureFlag["audience"] =>
  value === "plus" || value === "creators" || value === "admins" ? value : "all";

const normalizeTipTargetType = (value: unknown): Tip["targetType"] => (value === "reply" ? "reply" : "post");

const normalizeVoteTargetType = (value: unknown): VoteState["targetType"] => (value === "reply" ? "reply" : "post");

const normalizeVoteValue = (value: unknown): VoteState["value"] => {
  const numeric = Number(value);
  return numeric === -1 || numeric === 1 ? numeric : 0;
};

const normalizeModerationAction = (value: unknown): ModerationAction["action"] =>
  value === "hide_content" ||
  value === "block_content" ||
  value === "warn_user" ||
  value === "restrict_user" ||
  value === "approve_creator" ||
  value === "reject_creator" ||
  value === "pause_payouts" ||
  value === "verify_channel" ||
  value === "block" ||
  value === "flag" ||
  value === "restore"
    ? value
    : "dismiss";

const toMediaAssets = (value: unknown): Post["media"] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({
          id: typeof entry.id === "string" ? entry.id : "",
          kind: "image" as const,
          url: typeof entry.url === "string" ? entry.url : "",
        }))
        .filter((entry) => entry.id && entry.url)
    : [];

const toJsonRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const hasInstallIdentity = (store: ApiStore, installIdentityId: string | null | undefined) =>
  Boolean(installIdentityId && store.installIdentities.some((entry) => entry.id === installIdentityId));

const requiredInstallIdentityId = (store: ApiStore, installIdentityId: string | null | undefined) =>
  hasInstallIdentity(store, installIdentityId) ? (installIdentityId as string) : store.installIdentity.id;

const nullableInstallIdentityId = (store: ApiStore, installIdentityId: string | null | undefined) =>
  hasInstallIdentity(store, installIdentityId) ? installIdentityId : null;

const fallbackCityId = (store: ApiStore) => store.installIdentity.cityId ?? store.cities[0]?.id ?? "city-munich";

const knownCityId = (store: ApiStore, cityId: string | null | undefined) =>
  cityId && store.cities.some((city) => city.id === cityId) ? cityId : fallbackCityId(store);

const nullableCityId = (store: ApiStore, cityId: string | null | undefined) =>
  cityId && store.cities.some((city) => city.id === cityId) ? cityId : null;

const knownAccountId = (store: ApiStore, accountId: string | null | undefined) =>
  accountId && store.accounts.some((account) => account.id === accountId) ? accountId : null;

const knownChannelId = (store: ApiStore, channelId: string | null | undefined) =>
  channelId && store.channels.some((channel) => channel.id === channelId) ? channelId : null;

const knownPostId = (store: ApiStore, postId: string | null | undefined) =>
  postId && store.posts.some((post) => post.id === postId) ? postId : null;

const accountWalletOwnerKey = (accountId: string) => `account:${accountId}`;

const addMillisecondsToIso = (isoValue: string, milliseconds: number) => {
  const timestamp = Date.parse(isoValue);
  const base = Number.isFinite(timestamp) ? timestamp : Date.now();
  return new Date(base + milliseconds).toISOString();
};

const idempotencyRecordExpiresAt = (record: IdempotencyRecord) =>
  addMillisecondsToIso(record.createdAt, 24 * 60 * 60 * 1000);

const idempotencyRecordStoreKey = (record: Pick<IdempotencyRecord, "idempotencyKey" | "scope">) =>
  `${record.scope}:${record.idempotencyKey}`;

const walletOwnerFromKey = (store: ApiStore, ownerKey: string) => {
  if (ownerKey.startsWith("account:")) {
    return {
      accountId: knownAccountId(store, ownerKey.slice("account:".length)),
      installIdentityId: null,
    };
  }

  return {
    accountId: null,
    installIdentityId: nullableInstallIdentityId(store, ownerKey),
  };
};

const ledgerOwnerKey = (store: ApiStore, entry: LedgerEntry) => {
  const accountId = knownAccountId(store, entry.accountId);
  if (accountId) {
    return accountWalletOwnerKey(accountId);
  }

  return nullableInstallIdentityId(store, entry.installIdentityId);
};

const voteTargetKey = (targetType: VoteState["targetType"], targetId: string) => `${targetType}:${targetId}`;

const voteActorKeyFromStoreKey = (key: string, vote: VoteState) => {
  const suffix = `:${voteTargetKey(vote.targetType, vote.targetId)}`;
  if (key.endsWith(suffix)) {
    return key.slice(0, -suffix.length);
  }

  return vote.actorKey ?? vote.accountId ?? vote.installIdentityId ?? "unknown";
};

const voteInstallIdentityId = (store: ApiStore, vote: VoteState, actorKey: string) =>
  vote.installIdentityId ??
  (hasInstallIdentity(store, actorKey)
    ? actorKey
    : store.accountLinks.find((link) => link.accountId === actorKey && link.unlinkedAt === null)?.installIdentityId) ??
  store.installIdentity.id;

const voteAccountId = (store: ApiStore, vote: VoteState, actorKey: string) =>
  vote.accountId ?? (store.accounts.some((account) => account.id === actorKey) ? actorKey : null);

const voteId = (actorKey: string, targetType: VoteState["targetType"], targetId: string) =>
  `vote-${hashSecret(`${actorKey}:${targetType}:${targetId}`).slice(0, 32)}`;

const normalizedCounts = (params: {
  accountChannelPreferences: AccountChannelPreferences[];
  accountLinks: AccountLink[];
  accountLoginCodes: AccountLoginCodeRecord[];
  accountProfiles: AccountProfile[];
  accounts: Account[];
  abuseEvents: AbuseEventRecord[];
  auditLogs: AuditLogEntry[];
  backofficeActions: BackofficeActionEntry[];
  chatMessages: ChatMessage[];
  chatRequests: ChatRequest[];
  channels: Channel[];
  cities: CityContext[];
  cityHealthSnapshots: CityHealthSnapshot[];
  creatorApplications: CreatorApplicationRecord[];
  creatorReviews: CreatorReview[];
  deviceRiskStates: DeviceRiskStateRecord[];
  featureFlags: FeatureFlag[];
  geoEvents: GeoEventRecord[];
  idempotencyRecords: IdempotencyRecord[];
  installIdentities: InstallIdentity[];
  installRestrictions: InstallRestrictionRecord[];
  installSessions: InstallSessionRecord[];
  ledgerEntries: LedgerEntry[];
  moderationActions: ModerationAction[];
  moderationCases: ModerationCase[];
  notifications: NotificationItem[];
  payoutAccounts: PayoutAccount[];
  payouts: Payout[];
  posts: Post[];
  refreshTokens: RefreshTokenRecord[];
  replies: Reply[];
  reports: ReportRecord[];
  tips: Tip[];
  votes: VoteState[];
  walletBalances: WalletBalance[];
  walletTopups: WalletTopup[];
}): NormalizedRepositoryCounts => ({
  accountChannelPreferences: params.accountChannelPreferences.length,
  accountLinks: params.accountLinks.length,
  accountLoginCodes: params.accountLoginCodes.length,
  accountProfiles: params.accountProfiles.length,
  accounts: params.accounts.length,
  abuseEvents: params.abuseEvents.length,
  auditLogs: params.auditLogs.length,
  backofficeActions: params.backofficeActions.length,
  chatMessages: params.chatMessages.length,
  chatRequests: params.chatRequests.length,
  channels: params.channels.length,
  cities: params.cities.length,
  cityHealthSnapshots: params.cityHealthSnapshots.length,
  creatorApplications: params.creatorApplications.length,
  creatorReviews: params.creatorReviews.length,
  deviceRiskStates: params.deviceRiskStates.length,
  featureFlags: params.featureFlags.length,
  geoEvents: params.geoEvents.length,
  idempotencyRecords: params.idempotencyRecords.length,
  installIdentities: params.installIdentities.length,
  installRestrictions: params.installRestrictions.length,
  installSessions: params.installSessions.length,
  ledgerEntries: params.ledgerEntries.length,
  moderationActions: params.moderationActions.length,
  moderationCases: params.moderationCases.length,
  notifications: params.notifications.length,
  payoutAccounts: params.payoutAccounts.length,
  payouts: params.payouts.length,
  posts: params.posts.length,
  refreshTokens: params.refreshTokens.length,
  replies: params.replies.length,
  reports: params.reports.length,
  tips: params.tips.length,
  votes: params.votes.length,
  walletBalances: params.walletBalances.length,
  walletTopups: params.walletTopups.length,
});

const loadNormalizedReadOverlay = async (store: ApiStore): Promise<ApiStore> => {
  const client = await getPostgresPool().connect();
  const attemptedAt = new Date().toISOString();
  postgresNormalizedReadOverlay = {
    ...postgresNormalizedReadOverlay,
    lastAttemptedAt: attemptedAt,
    status: "not_checked",
  };

  try {
    const { missingTables, tables } = await getNormalizedTableReadiness(client);
    if (missingTables.length > 0) {
      postgresNormalizedReadOverlay = {
        ...postgresNormalizedReadOverlay,
        lastError: `Missing tables: ${missingTables.join(", ")}`,
        ready: false,
        status: "pending_schema",
        tables,
      };
      return store;
    }

    const citiesResult = await client.query<{
      country_code: string;
      id: string;
      is_explorer_enabled: boolean;
      label: string;
      lat: number | string;
      lng: number | string;
      slug: string;
    }>(`
      SELECT
        id,
        slug,
        label,
        country_code,
        ST_Y(centroid::geometry) AS lat,
        ST_X(centroid::geometry) AS lng,
        is_explorer_enabled
      FROM cities
      ORDER BY label ASC
    `);
    const accountsResult = await client.query<{
      created_at: Date | string;
      discoverable: boolean;
      email_normalized: string;
      email_verified_at: Date | string | null;
      id: string;
      last_seen_at: Date | string;
      username: string;
    }>("SELECT id, username, email_normalized, email_verified_at, discoverable, created_at, last_seen_at FROM accounts");
    const profilesResult = await client.query<{
      account_id: string;
      avatar_url: string | null;
      bio: string;
      display_name: string;
      is_creator: boolean;
    }>("SELECT account_id, display_name, bio, avatar_url, is_creator FROM account_profiles");
    const installIdentitiesResult = await client.query<{
      access_token: string;
      account_display_name: string | null;
      account_id: string | null;
      account_username: string | null;
      adult_gate_accepted: boolean;
      adult_verified: boolean;
      city_id: string;
      city_label: string;
      created_at: Date | string;
      discoverable: boolean;
      id: string;
      install_key: string;
      plus: unknown;
      plus_active: boolean;
    }>(`
      SELECT
        id,
        install_key,
        access_token,
        account_id,
        account_username,
        account_display_name,
        discoverable,
        city_id,
        city_label,
        adult_gate_accepted,
        adult_verified,
        plus,
        plus_active,
        created_at
      FROM install_identities
      ORDER BY last_seen_at DESC, created_at DESC
    `);
    const linksResult = await client.query<{
      account_id: string;
      install_identity_id: string;
      linked_at: Date | string;
      unlinked_at: Date | string | null;
    }>("SELECT account_id, install_identity_id, linked_at, unlinked_at FROM account_links ORDER BY linked_at DESC");
    const loginCodesResult = await client.query<{
      attempt_count: number;
      code_hash: string;
      consumed_at: Date | string | null;
      created_at: Date | string;
      email_normalized: string;
      expires_at: Date | string;
      id: string;
      install_identity_id: string;
      username: string;
    }>(`
      SELECT
        id,
        email_normalized,
        username,
        install_identity_id,
        code_hash,
        attempt_count,
        created_at,
        expires_at,
        consumed_at
      FROM account_login_codes
      WHERE consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 200
    `);
    const installSessionsResult = await client.query<{
      access_token_expires_at: Date | string;
      access_token_hash: string;
      created_at: Date | string;
      id: string;
      install_identity_id: string;
      last_refreshed_at: Date | string;
      last_seen_at: Date | string;
      revocation_reason: string | null;
      revoked_at: Date | string | null;
      status: string;
      token_family_id: string;
    }>(`
      SELECT
        id,
        install_identity_id,
        access_token_hash,
        token_family_id,
        status,
        created_at,
        last_refreshed_at,
        last_seen_at,
        access_token_expires_at,
        revoked_at,
        revocation_reason
      FROM install_sessions
      ORDER BY last_seen_at DESC, created_at DESC
    `);
    const refreshTokensResult = await client.query<{
      created_at: Date | string;
      expires_at: Date | string;
      id: string;
      install_identity_id: string;
      install_session_id: string;
      replaced_by_token_id: string | null;
      revocation_reason: string | null;
      revoked_at: Date | string | null;
      token_family_id: string;
      token_hash: string;
      used_at: Date | string | null;
    }>(`
      SELECT
        id,
        install_identity_id,
        install_session_id,
        token_hash,
        token_family_id,
        created_at,
        expires_at,
        used_at,
        replaced_by_token_id,
        revoked_at,
        revocation_reason
      FROM refresh_tokens
      ORDER BY created_at DESC
    `);
    const idempotencyRecordsResult = await client.query<{
      created_at: Date | string;
      id: string;
      idempotency_key: string;
      request_hash: string;
      response_body: unknown;
      response_status: number | string;
      scope: string;
    }>(`
      SELECT
        id,
        scope,
        idempotency_key,
        request_hash,
        response_status,
        response_body,
        created_at
      FROM idempotency_keys
      WHERE expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 500
    `);
    const deviceRiskStatesResult = await client.query<{
      device_risk_score: number | string;
      flagged_at: Date | string | null;
      install_identity_id: string;
      last_updated_at: Date | string;
      restricted_at: Date | string | null;
    }>(`
      SELECT
        install_identity_id,
        device_risk_score,
        flagged_at,
        restricted_at,
        last_updated_at
      FROM install_security_state
      ORDER BY last_updated_at DESC
    `);
    const installRestrictionsResult = await client.query<{
      ends_at: Date | string;
      id: string;
      install_identity_id: string;
      metadata: unknown;
      reason_code: string;
      starts_at: Date | string;
      trigger_source: string;
      type: string;
    }>(`
      SELECT
        id,
        install_identity_id,
        type,
        reason_code,
        trigger_source,
        metadata,
        starts_at,
        ends_at
      FROM install_restrictions
      ORDER BY starts_at DESC
      LIMIT 1000
    `);
    const geoEventsResult = await client.query<{
      account_id: string | null;
      city_id: string | null;
      created_at: Date | string;
      id: string;
      install_identity_id: string | null;
      kind: string;
      lat: number | string | null;
      lng: number | string | null;
      metadata: unknown;
      risk_delta: number | string;
    }>(`
      SELECT
        id,
        install_identity_id,
        account_id,
        city_id,
        lat,
        lng,
        kind,
        risk_delta,
        metadata,
        created_at
      FROM geo_events
      ORDER BY created_at DESC
      LIMIT 1000
    `);
    const abuseEventsResult = await client.query<{
      account_id: string | null;
      created_at: Date | string;
      id: string;
      install_identity_id: string | null;
      ip_hash: string | null;
      kind: string;
      metadata: unknown;
      route_name: string;
    }>(`
      SELECT
        id,
        install_identity_id,
        account_id,
        ip_hash,
        route_name,
        kind,
        metadata,
        created_at
      FROM abuse_events
      ORDER BY created_at DESC
      LIMIT 1000
    `);
    const rateLimitCountersResult = await client.query<{
      blocked_until: Date | string | null;
      count: number | string;
      key: string;
      last_exceeded_at: Date | string | null;
      window_ends_at: Date | string;
    }>(`
      SELECT
        key,
        count,
        window_ends_at,
        blocked_until,
        last_exceeded_at
      FROM rate_limit_counters
      WHERE window_ends_at > NOW()
        OR blocked_until > NOW()
      ORDER BY updated_at DESC
      LIMIT 1000
    `);
    const preferencesResult = await client.query<{
      account_id: string;
      city_id: string;
      favorite_channel_ids: string[] | string;
      joined_channel_ids: string[] | string;
      recent_channel_ids: string[] | string;
      updated_at: Date | string;
    }>(`
      SELECT
        account_id,
        city_id,
        favorite_channel_ids,
        joined_channel_ids,
        recent_channel_ids,
        updated_at
      FROM account_channel_preferences
    `);
    const featureFlagsResult = await client.query<{
      audience: string;
      description: string;
      enabled: boolean;
      id: string;
      key: string;
      label: string;
    }>(`
      SELECT
        id,
        key,
        label,
        description,
        enabled,
        audience
      FROM feature_flags
      ORDER BY key ASC
    `);
    const cityHealthResult = await client.query<{
      active_creators: number | string;
      city_id: string;
      live_posts: number | string;
      open_reports: number | string;
      wallet_volume_cents: number | string;
    }>(`
      SELECT
        city_id,
        live_posts,
        open_reports,
        active_creators,
        wallet_volume_cents
      FROM city_health_snapshots
      ORDER BY city_id ASC
    `);
    const creatorApplicationsResult = await client.query<{
      account_display_name: string | null;
      account_id: string | null;
      account_username: string | null;
      adult_verified: boolean;
      id: string;
      install_identity_id: string;
      kyc_state: string;
      notes: string;
      payout_state: string;
      reviewed_at: Date | string | null;
      status: string;
      submitted_at: Date | string | null;
    }>(`
      SELECT
        id,
        install_identity_id,
        account_id,
        account_username,
        account_display_name,
        status,
        adult_verified,
        kyc_state,
        payout_state,
        submitted_at,
        reviewed_at,
        notes
      FROM creator_applications
      ORDER BY submitted_at DESC NULLS LAST, id ASC
    `);
    const creatorReviewsResult = await client.query<{
      created_at: Date | string;
      creator_application_id: string;
      decision: string;
      id: string;
      note: string;
      reviewer_id: string;
    }>(`
      SELECT
        id,
        creator_application_id,
        reviewer_id,
        decision,
        note,
        created_at
      FROM creator_reviews
      ORDER BY created_at DESC
    `);
    const walletBalancesResult = await client.query<{
      available_cents: number | string;
      currency: string;
      lifetime_earned_cents: number | string;
      lifetime_paid_out_cents: number | string;
      lifetime_tipped_cents: number | string;
      owner_key: string;
      pending_cents: number | string;
    }>(`
      SELECT
        owner_key,
        currency,
        available_cents,
        pending_cents,
        lifetime_tipped_cents,
        lifetime_earned_cents,
        lifetime_paid_out_cents
      FROM wallet_balances
      ORDER BY owner_key ASC
    `);
    const walletTopupsResult = await client.query<{
      account_id: string | null;
      created_at: Date | string;
      gross_cents: number | string;
      id: string;
      install_identity_id: string;
      provider: string;
      status: string;
    }>(`
      SELECT
        id,
        install_identity_id,
        account_id,
        provider,
        status,
        gross_cents,
        created_at
      FROM wallet_topups
      ORDER BY created_at DESC
    `);
    const ledgerEntriesResult = await client.query<{
      account_id: string | null;
      created_at: Date | string;
      gross_cents: number | string;
      id: string;
      install_identity_id: string;
      kind: string;
      net_cents: number | string;
      platform_fee_cents: number | string;
      ref_id: string;
      ref_type: string;
      status: string;
    }>(`
      SELECT
        id,
        install_identity_id,
        account_id,
        kind,
        status,
        gross_cents,
        platform_fee_cents,
        net_cents,
        ref_type,
        ref_id,
        created_at
      FROM ledger_entries
      ORDER BY created_at DESC
    `);
    const tipsResult = await client.query<{
      created_at: Date | string;
      creator_net_cents: number | string;
      gross_cents: number | string;
      id: string;
      platform_fee_cents: number | string;
      recipient_account_id: string | null;
      recipient_install_identity_id: string;
      sender_account_id: string | null;
      sender_install_identity_id: string;
      status: string;
      target_id: string;
      target_type: string;
    }>(`
      SELECT
        id,
        sender_install_identity_id,
        recipient_install_identity_id,
        sender_account_id,
        recipient_account_id,
        target_type,
        target_id,
        gross_cents,
        platform_fee_cents,
        creator_net_cents,
        status,
        created_at
      FROM tip_events
      ORDER BY created_at DESC
    `);
    const payoutAccountsResult = await client.query<{
      account_id: string | null;
      id: string;
      install_identity_id: string;
      label: string;
      last_checked_at: Date | string | null;
      provider: string;
      state: string;
    }>(`
      SELECT
        id,
        install_identity_id,
        account_id,
        provider,
        label,
        state,
        last_checked_at
      FROM payout_accounts
      ORDER BY updated_at DESC, created_at DESC
    `);
    const payoutsResult = await client.query<{
      account_id: string | null;
      fee_cents: number | string;
      gross_cents: number | string;
      id: string;
      install_identity_id: string;
      net_cents: number | string;
      payout_account_id: string;
      requested_at: Date | string;
      settled_at: Date | string | null;
      status: string;
    }>(`
      SELECT
        id,
        install_identity_id,
        account_id,
        payout_account_id,
        status,
        gross_cents,
        fee_cents,
        net_cents,
        requested_at,
        settled_at
      FROM payouts
      ORDER BY requested_at DESC
    `);
    const channelsResult = await client.query<{
      city_id: string;
      description: string;
      id: string;
      is_adult_only: boolean;
      is_exclusive: boolean;
      is_verified: boolean;
      member_count: number;
      slug: string;
      title: string;
    }>(`
      SELECT
        id,
        slug,
        title,
        description,
        city_id,
        is_verified,
        is_exclusive,
        is_adult_only,
        member_count
      FROM channels
      ORDER BY city_id ASC, slug ASC
    `);
    const postsResult = await client.query<{
      account_display_name: string | null;
      account_id: string | null;
      account_is_creator: boolean;
      account_username: string | null;
      author_label: string;
      body: string;
      can_tip: boolean;
      channel_id: string | null;
      city_id: string;
      created_at: Date | string;
      id: string;
      install_identity_id: string;
      is_pinned: boolean;
      media: unknown;
      moderation: string;
      recipient_install_identity_id: string | null;
      reply_count: number;
      score: number;
      tags: string[] | string;
      tip_total_cents: number;
    }>(`
      SELECT
        id,
        city_id,
        channel_id,
        install_identity_id,
        recipient_install_identity_id,
        account_id,
        account_username,
        account_display_name,
        account_is_creator,
        author_label,
        body,
        score,
        reply_count,
        tags,
        media,
        tip_total_cents,
        can_tip,
        is_pinned,
        moderation,
        created_at
      FROM posts
      ORDER BY is_pinned DESC, created_at DESC
    `);
    const repliesResult = await client.query<{
      account_display_name: string | null;
      account_id: string | null;
      account_is_creator: boolean;
      account_username: string | null;
      author_label: string;
      body: string;
      can_tip: boolean;
      created_at: Date | string;
      id: string;
      install_identity_id: string;
      moderation: string;
      post_id: string;
      recipient_install_identity_id: string | null;
      score: number;
      tip_total_cents: number;
    }>(`
      SELECT
        id,
        post_id,
        install_identity_id,
        recipient_install_identity_id,
        account_id,
        account_username,
        account_display_name,
        account_is_creator,
        author_label,
        body,
        score,
        tip_total_cents,
        can_tip,
        moderation,
        created_at
      FROM replies
      ORDER BY created_at DESC
    `);
    const votesResult = await client.query<{
      account_id: string | null;
      actor_key: string;
      aggregate_score: number;
      install_identity_id: string;
      target_id: string;
      target_type: string;
      value: number;
    }>(`
      SELECT
        install_identity_id,
        account_id,
        actor_key,
        target_type,
        target_id,
        value,
        aggregate_score
      FROM votes
      ORDER BY created_at DESC
    `);
    const moderationCasesResult = await client.query<{
      account_id: string | null;
      city_id: string | null;
      created_at: Date | string;
      id: string;
      reason: string;
      status: string;
      target_id: string;
      target_type: string;
    }>(`
      SELECT
        id,
        city_id,
        target_type,
        target_id,
        account_id,
        reason,
        status,
        created_at
      FROM moderation_cases
      ORDER BY created_at DESC
    `);
    const moderationActionsResult = await client.query<{
      action: string;
      actor_label: string;
      admin_identity_id: string;
      created_at: Date | string;
      id: string;
      moderation_case_id: string;
      note: string;
    }>(`
      SELECT
        id,
        moderation_case_id,
        admin_identity_id,
        actor_label,
        action,
        note,
        created_at
      FROM moderation_actions
      ORDER BY created_at DESC
    `);
    const reportsResult = await client.query<{
      account_id: string | null;
      city_id: string;
      created_at: Date | string;
      id: string;
      moderation_case_id: string | null;
      reason: string;
      reporter_install_identity_id: string;
      status: string;
      target_id: string;
      target_type: string;
      updated_at: Date | string;
    }>(`
      SELECT
        id,
        reporter_install_identity_id,
        account_id,
        city_id,
        target_type,
        target_id,
        reason,
        moderation_case_id,
        status,
        created_at,
        updated_at
      FROM reports
      ORDER BY created_at DESC
    `);
    const chatRequestsResult = await client.query<{
      created_at: Date | string;
      from_account_id: string | null;
      from_install_identity_id: string;
      id: string;
      post_id: string | null;
      status: string;
      to_account_id: string | null;
      to_install_identity_id: string;
    }>(`
      SELECT
        id,
        from_install_identity_id,
        from_account_id,
        to_install_identity_id,
        to_account_id,
        post_id,
        status,
        created_at
      FROM chat_requests
      ORDER BY created_at DESC
    `);
    const chatMessagesResult = await client.query<{
      account_id: string | null;
      body: string;
      chat_request_id: string;
      created_at: Date | string;
      id: string;
      media: unknown;
      read_at: Date | string | null;
      sender_install_identity_id: string;
    }>(`
      SELECT
        id,
        chat_request_id,
        sender_install_identity_id,
        account_id,
        body,
        media,
        created_at,
        read_at
      FROM chat_messages
      ORDER BY created_at DESC
    `);
    const notificationsResult = await client.query<{
      account_id: string | null;
      created_at: Date | string;
      id: string;
      install_identity_id: string | null;
      is_read: boolean;
      kind: string;
      message: string;
      target_route: string | null;
    }>(`
      SELECT
        id,
        install_identity_id,
        account_id,
        kind,
        message,
        target_route,
        is_read,
        created_at
      FROM notifications
      ORDER BY created_at DESC
    `);
    const backofficeActionsResult = await client.query<{
      action: string;
      actor_id: string;
      actor_role: string;
      created_at: Date | string;
      entity_id: string;
      entity_type: string;
      id: string;
      metadata: unknown;
    }>(`
      SELECT
        id,
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        metadata,
        created_at
      FROM backoffice_actions
      ORDER BY created_at DESC
    `);
    const auditLogsResult = await client.query<{
      action: string;
      actor_id: string;
      actor_role: string | null;
      actor_type: string;
      created_at: Date | string;
      entity_id: string;
      entity_type: string;
      id: string;
      metadata: unknown;
      summary: string;
    }>(`
      SELECT
        id,
        actor_type,
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        summary,
        metadata,
        created_at
      FROM audit_logs
      ORDER BY created_at DESC
    `);

    const cities: CityContext[] = citiesResult.rows.map((city) => ({
      id: city.id,
      slug: city.slug,
      label: city.label,
      countryCode: normalizeCountryCode(city.country_code),
      lat: toNumber(city.lat),
      lng: toNumber(city.lng),
      isExplorerEnabled: Boolean(city.is_explorer_enabled),
    }));
    const accounts: Account[] = accountsResult.rows.map((account) => ({
      id: account.id,
      username: account.username,
      emailNormalized: account.email_normalized,
      emailVerifiedAt: toNullableIsoString(account.email_verified_at),
      discoverable: Boolean(account.discoverable),
      createdAt: toIsoString(account.created_at),
      lastSeenAt: toIsoString(account.last_seen_at),
    }));
    const accountProfiles = profilesResult.rows.map((profile): AccountProfile => ({
      accountId: profile.account_id,
      displayName: profile.display_name,
      bio: profile.bio,
      avatarUrl: profile.avatar_url,
      isCreator: Boolean(profile.is_creator),
    }));
    const installIdentities: InstallIdentity[] = installIdentitiesResult.rows.map((installIdentity) => ({
      id: installIdentity.id,
      installKey: installIdentity.install_key,
      accessToken: installIdentity.access_token,
      accountId: installIdentity.account_id ?? undefined,
      accountUsername: installIdentity.account_username ?? undefined,
      accountDisplayName: installIdentity.account_display_name ?? undefined,
      discoverable: Boolean(installIdentity.discoverable),
      cityId: installIdentity.city_id,
      cityLabel: installIdentity.city_label,
      adultGateAccepted: Boolean(installIdentity.adult_gate_accepted),
      adultVerified: Boolean(installIdentity.adult_verified),
      plus: normalizePlusEntitlement(installIdentity.plus, Boolean(installIdentity.plus_active)),
      createdAt: toIsoString(installIdentity.created_at),
    }));
    const accountLinks = linksResult.rows.map((link): AccountLink => ({
      accountId: link.account_id,
      installIdentityId: link.install_identity_id,
      linkedAt: toIsoString(link.linked_at),
      unlinkedAt: toNullableIsoString(link.unlinked_at),
    }));
    const accountLoginCodes = loginCodesResult.rows.map((code): AccountLoginCodeRecord => ({
      id: code.id,
      emailNormalized: code.email_normalized,
      username: code.username,
      installIdentityId: code.install_identity_id,
      code: "",
      codeHash: code.code_hash,
      createdAt: toIsoString(code.created_at),
      expiresAt: toIsoString(code.expires_at),
      attemptCount: code.attempt_count,
      consumedAt: toOptionalIsoString(code.consumed_at),
    }));
    const installSessions = installSessionsResult.rows.map((session): InstallSessionRecord => ({
      id: session.id,
      installIdentityId: session.install_identity_id,
      accessTokenHash: session.access_token_hash,
      tokenFamilyId: session.token_family_id,
      createdAt: toIsoString(session.created_at),
      accessTokenExpiresAt: toIsoString(session.access_token_expires_at),
      status: session.status === "revoked" ? "revoked" : "active",
      lastRefreshedAt: toIsoString(session.last_refreshed_at),
      lastSeenAt: toIsoString(session.last_seen_at),
      revokedAt: toOptionalIsoString(session.revoked_at),
      revocationReason: session.revocation_reason ?? undefined,
    }));
    const refreshTokens = refreshTokensResult.rows.map((token): RefreshTokenRecord => ({
      id: token.id,
      installIdentityId: token.install_identity_id,
      installSessionId: token.install_session_id,
      tokenHash: token.token_hash,
      tokenFamilyId: token.token_family_id,
      createdAt: toIsoString(token.created_at),
      expiresAt: toIsoString(token.expires_at),
      usedAt: toOptionalIsoString(token.used_at),
      replacedByTokenId: token.replaced_by_token_id ?? undefined,
      revokedAt: toOptionalIsoString(token.revoked_at),
      revocationReason: token.revocation_reason ?? undefined,
    }));
    const dbAccountIds = new Set(accounts.map((account) => account.id));
    const dbInstallIdentityIds = new Set(installIdentities.map((installIdentity) => installIdentity.id));
    const idempotencyRecords = idempotencyRecordsResult.rows.map((record): IdempotencyRecord => ({
      id: record.id,
      scope: record.scope,
      idempotencyKey: record.idempotency_key,
      bodySignature: record.request_hash,
      statusCode: toNumber(record.response_status, 200),
      response: record.response_body,
      createdAt: toIsoString(record.created_at),
    }));
    const deviceRiskStates = deviceRiskStatesResult.rows
      .filter((riskState) => dbInstallIdentityIds.has(riskState.install_identity_id))
      .map((riskState): DeviceRiskStateRecord => ({
        installIdentityId: riskState.install_identity_id,
        score: toNumber(riskState.device_risk_score),
        flaggedAt: toOptionalIsoString(riskState.flagged_at),
        restrictedAt: toOptionalIsoString(riskState.restricted_at),
        lastUpdatedAt: toIsoString(riskState.last_updated_at),
      }));
    const installRestrictions = installRestrictionsResult.rows
      .filter((restriction) => dbInstallIdentityIds.has(restriction.install_identity_id))
      .map((restriction): InstallRestrictionRecord => ({
        id: restriction.id,
        installIdentityId: restriction.install_identity_id,
        type: normalizeRestrictionType(restriction.type),
        reasonCode: restriction.reason_code,
        triggerSource: restriction.trigger_source,
        metadata: toJsonRecord(restriction.metadata),
        startsAt: toIsoString(restriction.starts_at),
        endsAt: toIsoString(restriction.ends_at),
      }));
    const abuseEvents = abuseEventsResult.rows.map((event): AbuseEventRecord => ({
      id: event.id,
      installIdentityId:
        event.install_identity_id && dbInstallIdentityIds.has(event.install_identity_id)
          ? event.install_identity_id
          : undefined,
      accountId: event.account_id && dbAccountIds.has(event.account_id) ? event.account_id : undefined,
      ipHash: event.ip_hash ?? undefined,
      routeName: event.route_name,
      kind: event.kind,
      metadata: toJsonRecord(event.metadata),
      createdAt: toIsoString(event.created_at),
    }));
    const rateLimitCounters = rateLimitCountersResult.rows.map((counter): RateLimitCounterRecord => ({
      key: counter.key,
      count: toNumber(counter.count),
      windowEndsAt: toIsoString(counter.window_ends_at),
      blockedUntil: toOptionalIsoString(counter.blocked_until),
      lastExceededAt: toOptionalIsoString(counter.last_exceeded_at),
    }));
    const accountChannelPreferences = preferencesResult.rows.map((preference): AccountChannelPreferences => ({
      accountId: preference.account_id,
      cityId: preference.city_id,
      favoriteChannelIds: toStringArray(preference.favorite_channel_ids),
      joinedChannelIds: toStringArray(preference.joined_channel_ids),
      recentChannelIds: toStringArray(preference.recent_channel_ids),
      updatedAt: toIsoString(preference.updated_at),
    }));
    const featureFlags = featureFlagsResult.rows.map((flag): FeatureFlag => ({
      id: flag.id,
      key: flag.key,
      label: flag.label,
      description: flag.description,
      enabled: Boolean(flag.enabled),
      audience: normalizeFeatureAudience(flag.audience),
    }));
    const creatorApplications = creatorApplicationsResult.rows.map((application): CreatorApplicationRecord => ({
      id: application.id,
      installIdentityId: application.install_identity_id,
      accountId: application.account_id ?? undefined,
      accountUsername: application.account_username ?? undefined,
      accountDisplayName: application.account_display_name ?? undefined,
      status: normalizeCreatorStatus(application.status),
      adultVerified: Boolean(application.adult_verified),
      kycState: normalizeKycState(application.kyc_state),
      payoutState: normalizePayoutState(application.payout_state),
      submittedAt: toNullableIsoString(application.submitted_at),
      reviewedAt: toOptionalIsoString(application.reviewed_at),
      notes: application.notes,
    }));
    const creatorApplicationIds = new Set(creatorApplications.map((application) => application.id));
    const creatorReviews = creatorReviewsResult.rows
      .filter((review) => creatorApplicationIds.has(review.creator_application_id))
      .map((review): CreatorReview => ({
        id: review.id,
        creatorApplicationId: review.creator_application_id,
        reviewerId: review.reviewer_id,
        decision: normalizeCreatorReviewDecision(review.decision),
        note: review.note,
        createdAt: toIsoString(review.created_at),
      }));
    const wallets = Object.fromEntries(
      walletBalancesResult.rows.map((wallet) => [
        wallet.owner_key,
        {
          currency: "EUR" as const,
          availableCents: toNumber(wallet.available_cents),
          pendingCents: toNumber(wallet.pending_cents),
          lifetimeTippedCents: toNumber(wallet.lifetime_tipped_cents),
          lifetimeEarnedCents: toNumber(wallet.lifetime_earned_cents),
          lifetimePaidOutCents: toNumber(wallet.lifetime_paid_out_cents),
        },
      ]),
    );
    const walletTopups = walletTopupsResult.rows.map((topup): WalletTopup => ({
      id: topup.id,
      installIdentityId: topup.install_identity_id,
      accountId: topup.account_id ?? undefined,
      provider: normalizeWalletTopupProvider(topup.provider),
      status: normalizeWalletTopupStatus(topup.status),
      grossCents: toNumber(topup.gross_cents),
      createdAt: toIsoString(topup.created_at),
    }));
    const ledgerEntries = ledgerEntriesResult.rows.map((entry): LedgerEntry => ({
      id: entry.id,
      installIdentityId: entry.install_identity_id,
      accountId: entry.account_id ?? undefined,
      kind: normalizeLedgerKind(entry.kind),
      status: normalizeLedgerStatus(entry.status),
      grossCents: toNumber(entry.gross_cents),
      platformFeeCents: toNumber(entry.platform_fee_cents),
      netCents: toNumber(entry.net_cents),
      refType: entry.ref_type,
      refId: entry.ref_id,
      createdAt: toIsoString(entry.created_at),
    }));
    const tips = tipsResult.rows.map((tip): Tip => ({
      id: tip.id,
      senderInstallIdentityId: tip.sender_install_identity_id,
      recipientInstallIdentityId: tip.recipient_install_identity_id,
      senderAccountId: tip.sender_account_id ?? undefined,
      recipientAccountId: tip.recipient_account_id ?? undefined,
      targetType: normalizeTipTargetType(tip.target_type),
      targetId: tip.target_id,
      grossCents: toNumber(tip.gross_cents),
      platformFeeCents: toNumber(tip.platform_fee_cents),
      creatorNetCents: toNumber(tip.creator_net_cents),
      status: normalizeLedgerStatus(tip.status),
      createdAt: toIsoString(tip.created_at),
    }));
    const payoutAccounts = payoutAccountsResult.rows.map((account): PayoutAccount => ({
      id: account.id,
      installIdentityId: account.install_identity_id,
      accountId: account.account_id ?? undefined,
      provider: normalizePayoutAccountProvider(account.provider),
      label: account.label,
      state: normalizePayoutAccountState(account.state),
      lastCheckedAt: toNullableIsoString(account.last_checked_at),
    }));
    const payoutAccountIds = new Set(payoutAccounts.map((account) => account.id));
    const payouts = payoutsResult.rows
      .filter((payout) => payoutAccountIds.has(payout.payout_account_id))
      .map((payout): Payout => ({
        id: payout.id,
        installIdentityId: payout.install_identity_id,
        accountId: payout.account_id ?? undefined,
        payoutAccountId: payout.payout_account_id,
        status: normalizePayoutStatus(payout.status),
        grossCents: toNumber(payout.gross_cents),
        feeCents: toNumber(payout.fee_cents),
        netCents: toNumber(payout.net_cents),
        requestedAt: toIsoString(payout.requested_at),
        settledAt: toNullableIsoString(payout.settled_at),
      }));
    const dbCityIds = new Set(cities.map((city) => city.id));
    const geoEvents = geoEventsResult.rows.map((event): GeoEventRecord => ({
      id: event.id,
      installIdentityId:
        event.install_identity_id && dbInstallIdentityIds.has(event.install_identity_id)
          ? event.install_identity_id
          : undefined,
      accountId: event.account_id && dbAccountIds.has(event.account_id) ? event.account_id : undefined,
      cityId: event.city_id && dbCityIds.has(event.city_id) ? event.city_id : undefined,
      lat: toOptionalNumber(event.lat),
      lng: toOptionalNumber(event.lng),
      kind: event.kind,
      riskDelta: toNumber(event.risk_delta),
      metadata: toJsonRecord(event.metadata),
      createdAt: toIsoString(event.created_at),
    }));
    const cityHealth = cityHealthResult.rows.map((health): CityHealthSnapshot => ({
      cityId: dbCityIds.has(health.city_id) ? health.city_id : fallbackCityId(store),
      livePosts: toNumber(health.live_posts),
      openReports: toNumber(health.open_reports),
      activeCreators: toNumber(health.active_creators),
      walletVolumeCents: toNumber(health.wallet_volume_cents),
    }));
    const snapshotChannelJoinedById = new Map(store.channels.map((channel) => [channel.id, channel.joined]));
    const channels: Channel[] = channelsResult.rows.map((channel) => ({
      id: channel.id,
      slug: channel.slug,
      title: channel.title,
      description: channel.description,
      cityId: dbCityIds.has(channel.city_id) ? channel.city_id : fallbackCityId(store),
      memberCount: toNumber(channel.member_count),
      isVerified: Boolean(channel.is_verified),
      isExclusive: Boolean(channel.is_exclusive),
      isAdultOnly: Boolean(channel.is_adult_only),
      joined: snapshotChannelJoinedById.get(channel.id) ?? false,
    }));
    const posts: Post[] = postsResult.rows.map((post) => ({
      id: post.id,
      cityId: dbCityIds.has(post.city_id) ? post.city_id : fallbackCityId(store),
      channelId: post.channel_id,
      recipientInstallIdentityId: post.recipient_install_identity_id ?? post.install_identity_id,
      accountId: post.account_id ?? undefined,
      accountUsername: post.account_username ?? undefined,
      accountDisplayName: post.account_display_name ?? undefined,
      accountIsCreator: Boolean(post.account_is_creator),
      body: post.body,
      authorLabel: post.author_label,
      score: toNumber(post.score),
      replyCount: toNumber(post.reply_count),
      createdAt: toIsoString(post.created_at),
      tags: toStringArray(post.tags),
      media: toMediaAssets(post.media),
      tipTotalCents: toNumber(post.tip_total_cents),
      canTip: Boolean(post.can_tip),
      isPinned: Boolean(post.is_pinned),
      moderation: normalizeModerationState(post.moderation),
    }));
    const replies: Reply[] = repliesResult.rows.map((reply) => ({
      id: reply.id,
      postId: reply.post_id,
      recipientInstallIdentityId: reply.recipient_install_identity_id ?? reply.install_identity_id,
      accountId: reply.account_id ?? undefined,
      accountUsername: reply.account_username ?? undefined,
      accountDisplayName: reply.account_display_name ?? undefined,
      accountIsCreator: Boolean(reply.account_is_creator),
      body: reply.body,
      authorLabel: reply.author_label,
      score: toNumber(reply.score),
      createdAt: toIsoString(reply.created_at),
      tipTotalCents: toNumber(reply.tip_total_cents),
      canTip: Boolean(reply.can_tip),
      moderation: normalizeModerationState(reply.moderation),
    }));
    const votes = votesResult.rows.map((vote): VoteState => ({
      accountId: vote.account_id ?? undefined,
      actorKey: vote.actor_key,
      installIdentityId: vote.install_identity_id,
      targetId: vote.target_id,
      targetType: normalizeVoteTargetType(vote.target_type),
      value: normalizeVoteValue(vote.value),
      aggregateScore: toNumber(vote.aggregate_score),
    }));
    const moderationCases = moderationCasesResult.rows.map((caseItem): ModerationCase => ({
      id: caseItem.id,
      cityId: caseItem.city_id && dbCityIds.has(caseItem.city_id) ? caseItem.city_id : fallbackCityId(store),
      targetType: normalizeModerationCaseTargetType(caseItem.target_type),
      targetId: caseItem.target_id,
      accountId: caseItem.account_id ?? undefined,
      reason: caseItem.reason,
      status: normalizeModerationCaseStatus(caseItem.status),
      createdAt: toIsoString(caseItem.created_at),
    }));
    const moderationCaseIds = new Set(moderationCases.map((caseItem) => caseItem.id));
    const moderationActions = moderationActionsResult.rows
      .filter((action) => moderationCaseIds.has(action.moderation_case_id))
      .map((action): ModerationAction => ({
        id: action.id,
        moderationCaseId: action.moderation_case_id,
        actorId: action.admin_identity_id,
        actorLabel: action.actor_label,
        action: normalizeModerationAction(action.action),
        note: action.note,
        createdAt: toIsoString(action.created_at),
      }));
    const reports = reportsResult.rows.map((report): ReportRecord => ({
      id: report.id,
      reporterInstallIdentityId: report.reporter_install_identity_id,
      accountId: report.account_id ?? undefined,
      cityId: dbCityIds.has(report.city_id) ? report.city_id : fallbackCityId(store),
      targetType: normalizeModerationCaseTargetType(report.target_type),
      targetId: report.target_id,
      reason: report.reason,
      moderationCaseId: report.moderation_case_id ?? "",
      status: normalizeReportStatus(report.status),
      createdAt: toIsoString(report.created_at),
      updatedAt: toIsoString(report.updated_at),
    }));
    const chatMessages: ChatMessage[] = chatMessagesResult.rows.map((message) => ({
      id: message.id,
      chatRequestId: message.chat_request_id,
      senderInstallIdentityId: message.sender_install_identity_id,
      accountId: message.account_id ?? undefined,
      body: message.body,
      media: toMediaAssets(message.media),
      createdAt: toIsoString(message.created_at),
      readAt: toNullableIsoString(message.read_at),
    }));
    const latestMessageAtByRequest = new Map<string, string>();
    for (const message of chatMessages) {
      const currentLatest = latestMessageAtByRequest.get(message.chatRequestId);
      if (!currentLatest || message.createdAt.localeCompare(currentLatest) > 0) {
        latestMessageAtByRequest.set(message.chatRequestId, message.createdAt);
      }
    }
    const chatRequests: ChatRequest[] = chatRequestsResult.rows.map((request) => {
      const createdAt = toIsoString(request.created_at);

      return {
        id: request.id,
        fromInstallIdentityId: request.from_install_identity_id,
        fromAccountId: request.from_account_id ?? undefined,
        toInstallIdentityId: request.to_install_identity_id,
        toAccountId: request.to_account_id ?? undefined,
        postId: request.post_id ?? "",
        status: normalizeChatRequestStatus(request.status),
        createdAt,
        lastActivityAt: latestMessageAtByRequest.get(request.id) ?? createdAt,
      };
    });
    const notifications: NotificationItem[] = notificationsResult.rows.map((notification) => ({
      id: notification.id,
      kind: normalizeNotificationKind(notification.kind),
      message: notification.message,
      accountId: notification.account_id ?? undefined,
      installIdentityId: notification.install_identity_id ?? undefined,
      createdAt: toIsoString(notification.created_at),
      read: Boolean(notification.is_read),
      targetRoute: notification.target_route ?? undefined,
    }));
    const backofficeActions = backofficeActionsResult.rows.map((action): BackofficeActionEntry => ({
      id: action.id,
      actorId: action.actor_id,
      actorRole: normalizeBackofficeRole(action.actor_role),
      action: action.action,
      entityType: action.entity_type,
      entityId: action.entity_id,
      metadata: toJsonRecord(action.metadata),
      createdAt: toIsoString(action.created_at),
    }));
    const auditLogs = auditLogsResult.rows.map((auditLog): AuditLogEntry => ({
      id: auditLog.id,
      actorType: normalizeAuditActorType(auditLog.actor_type),
      actorId: auditLog.actor_id,
      actorRole: auditLog.actor_role ? normalizeBackofficeRole(auditLog.actor_role) : undefined,
      action: auditLog.action,
      entityType: auditLog.entity_type,
      entityId: auditLog.entity_id,
      summary: auditLog.summary,
      metadata: toJsonRecord(auditLog.metadata),
      createdAt: toIsoString(auditLog.created_at),
    }));
    const counts = normalizedCounts({
      accountChannelPreferences,
      accountLinks,
      accountLoginCodes,
      accountProfiles,
      accounts,
      abuseEvents,
      auditLogs,
      backofficeActions,
      chatMessages,
      chatRequests,
      channels,
      cities,
      cityHealthSnapshots: cityHealth,
      creatorApplications,
      creatorReviews,
      deviceRiskStates,
      featureFlags,
      geoEvents,
      idempotencyRecords,
      installIdentities,
      installRestrictions,
      installSessions,
      ledgerEntries,
      moderationActions,
      moderationCases,
      notifications,
      payoutAccounts,
      payouts,
      posts,
      refreshTokens,
      replies,
      reports,
      tips,
      votes,
      walletBalances: Object.values(wallets),
      walletTopups,
    });
    const accountProfileRecord = Object.fromEntries(
      accountProfiles.map((profile) => [profile.accountId, profile]),
    );
    const accountChannelPreferenceRecord = Object.fromEntries(
      accountChannelPreferences.map((preference) => [`${preference.accountId}:${preference.cityId}`, preference]),
    );
    const idempotencyRecord = Object.fromEntries(
      idempotencyRecords.map((record) => [idempotencyRecordStoreKey(record), record]),
    );
    const deviceRiskStateRecord = Object.fromEntries(
      deviceRiskStates.map((riskState) => [riskState.installIdentityId, riskState]),
    );
    const rateLimitCounterRecord = Object.fromEntries(
      rateLimitCounters.map((counter) => [counter.key, counter]),
    );
    const voteRecord = Object.fromEntries(
      votes.map((vote) => [vote.actorKey ? `${vote.actorKey}:${voteTargetKey(vote.targetType, vote.targetId)}` : voteTargetKey(vote.targetType, vote.targetId), vote]),
    );
    const overlaidStore: ApiStore = {
      ...store,
      ...(cities.length > 0 ? { cities } : {}),
      ...(accounts.length > 0 ? { accounts } : {}),
      ...(accountProfiles.length > 0 ? { accountProfiles: accountProfileRecord } : {}),
      ...(accountLinks.length > 0 ? { accountLinks } : {}),
      ...(accountLoginCodes.length > 0 ? { accountLoginCodes } : {}),
      ...(installSessions.length > 0 ? { installSessions } : {}),
      ...(refreshTokens.length > 0 ? { refreshTokens } : {}),
      ...(Object.keys(idempotencyRecord).length > 0 ? { idempotencyRecords: idempotencyRecord } : {}),
      ...(Object.keys(deviceRiskStateRecord).length > 0 ? { deviceRiskState: deviceRiskStateRecord } : {}),
      ...(installRestrictions.length > 0 ? { installRestrictions } : {}),
      ...(geoEvents.length > 0 ? { geoEvents } : {}),
      ...(abuseEvents.length > 0 ? { abuseEvents } : {}),
      ...(Object.keys(rateLimitCounterRecord).length > 0 ? { rateLimitCounters: rateLimitCounterRecord } : {}),
      ...(accountChannelPreferences.length > 0 ? { accountChannelPreferences: accountChannelPreferenceRecord } : {}),
      ...(featureFlags.length > 0 ? { featureFlags } : {}),
      ...(cityHealth.length > 0 ? { cityHealth } : {}),
      ...(creatorApplications.length > 0 ? { creatorApplication: creatorApplications[0] } : {}),
      ...(creatorReviews.length > 0 ? { creatorReviews } : {}),
      ...(Object.keys(wallets).length > 0 ? { wallets } : {}),
      ...(walletTopups.length > 0 ? { walletTopups } : {}),
      ...(ledgerEntries.length > 0 ? { ledger: ledgerEntries } : {}),
      ...(tips.length > 0 ? { tips } : {}),
      ...(payoutAccounts.length > 0 ? { payoutAccounts } : {}),
      ...(payouts.length > 0 ? { payouts } : {}),
      ...(channels.length > 0 ? { channels } : {}),
      ...(posts.length > 0 ? { posts } : {}),
      ...(replies.length > 0 ? { replies } : {}),
      ...(votes.length > 0 ? { votes: voteRecord } : {}),
      ...(chatRequests.length > 0 ? { chatRequests } : {}),
      ...(chatMessages.length > 0 ? { chatMessages } : {}),
      ...(moderationCases.length > 0 ? { moderationCases } : {}),
      ...(moderationActions.length > 0 ? { moderationActions } : {}),
      ...(notifications.length > 0 ? { notifications } : {}),
      ...(reports.length > 0 ? { reports } : {}),
      ...(backofficeActions.length > 0 ? { backofficeActions } : {}),
      ...(auditLogs.length > 0 ? { auditLogs } : {}),
    };

    if (installIdentities.length > 0) {
      overlaidStore.installIdentities = installIdentities;
      overlaidStore.installIdentity =
        installIdentities.find((entry) => entry.id === store.installIdentity.id) ?? installIdentities[0] ?? store.installIdentity;
    }

    if (Object.keys(wallets).length > 0) {
      const currentInstall = overlaidStore.installIdentities.find((entry) => entry.id === overlaidStore.installIdentity.id);
      const currentWalletOwnerKey = currentInstall?.accountId
        ? accountWalletOwnerKey(currentInstall.accountId)
        : overlaidStore.installIdentity.id;
      overlaidStore.wallet = wallets[currentWalletOwnerKey] ?? wallets[overlaidStore.installIdentity.id] ?? overlaidStore.wallet;
    }

    postgresNormalizedReadOverlay = {
      counts,
      enabled: true,
      fallbackSource: "api_store_snapshots",
      implemented: true,
      lastAttemptedAt: attemptedAt,
      lastFailedAt: postgresNormalizedReadOverlay.lastFailedAt,
      lastSucceededAt: new Date().toISOString(),
      mode: "best_effort_read_overlay",
      ready: true,
      runtimeSourceOfTruth: "api_store_snapshots_with_normalized_overlay",
      source: "normalized_phase_a_tables",
      status: "ready",
      tables: normalizedMirrorTables,
    };

    return overlaidStore;
  } catch (error) {
    postgresNormalizedReadOverlay = {
      ...postgresNormalizedReadOverlay,
      lastError: error instanceof Error ? error.message : "Unknown normalized read overlay failure.",
      lastFailedAt: new Date().toISOString(),
      ready: false,
      status: "failed",
    };
    return store;
  } finally {
    client.release();
  }
};

const loadFileSnapshot = async (fallbackFactory: () => ApiStore): Promise<ApiStore> => {
  try {
    const raw = await readFile(API_STORE_SNAPSHOT_PATH, "utf8");
    return JSON.parse(raw) as ApiStore;
  } catch (error) {
    const readError = error as NodeJS.ErrnoException;
    if (readError.code === "ENOENT") {
      return fallbackFactory();
    }

    throw error;
  }
};

const persistFileSnapshot = async (store: ApiStore) => {
  await mkdir(dirname(API_STORE_SNAPSHOT_PATH), { recursive: true });
  await writeFile(API_STORE_SNAPSHOT_PATH, JSON.stringify(store, null, 2), "utf8");
};

const loadPostgresSnapshot = async (fallbackFactory: () => ApiStore): Promise<ApiStore> => {
  await ensurePostgresSnapshotTable();
  const result = await getPostgresPool().query<{ payload: ApiStore }>(
    `SELECT payload FROM ${POSTGRES_SNAPSHOT_TABLE} WHERE id = $1 LIMIT 1`,
    [POSTGRES_SNAPSHOT_ROW_ID],
  );

  const payload = result.rows[0]?.payload;
  if (payload) {
    return loadNormalizedReadOverlay(payload);
  }

  const fallback = fallbackFactory();
  await persistPostgresSnapshot(fallback);
  return loadNormalizedReadOverlay(fallback);
};

const persistPostgresSnapshot = async (store: ApiStore) => {
  await ensurePostgresSnapshotTable();
  await getPostgresPool().query(
    `
      INSERT INTO ${POSTGRES_SNAPSHOT_TABLE} (id, payload, schema_version)
      VALUES ($1, $2::jsonb, $3)
      ON CONFLICT (id) DO UPDATE SET
        payload = EXCLUDED.payload,
        schema_version = EXCLUDED.schema_version,
        updated_at = NOW()
    `,
    [POSTGRES_SNAPSHOT_ROW_ID, JSON.stringify(store), POSTGRES_SNAPSHOT_SCHEMA_VERSION],
  );
  await mirrorNormalizedTables(store);
};

export const loadStoreSnapshot = async (fallbackFactory: () => ApiStore): Promise<ApiStore> => {
  const persistence = resolveStorePersistence();

  if (isPostgresRequested(persistence.requestedDriver)) {
    if (!persistence.database.configured || !persistence.database.valid) {
      throw new Error("API_STORAGE_DRIVER requests Postgres, but DATABASE_URL is missing or invalid.");
    }

    return loadPostgresSnapshot(fallbackFactory);
  }

  return loadFileSnapshot(fallbackFactory);
};

export const persistStoreSnapshot = async (store: ApiStore) => {
  const persistence = resolveStorePersistence();

  if (isPostgresRequested(persistence.requestedDriver)) {
    if (!persistence.database.configured || !persistence.database.valid) {
      throw new Error("API_STORAGE_DRIVER requests Postgres, but DATABASE_URL is missing or invalid.");
    }

    await persistPostgresSnapshot(store);
    return;
  }

  await persistFileSnapshot(store);
};

export const closeStorePersistence = async () => {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
};

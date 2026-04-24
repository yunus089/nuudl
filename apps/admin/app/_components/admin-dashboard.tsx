"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreatorApplication, LedgerEntry } from "@veil/shared";
import { adminApi } from "../_lib/admin-api";
import type {
  AdminAuditLogItem,
  AdminBackofficeActionItem,
  AdminDataBundle,
  AdminModerationCaseItem,
  AdminNavSection,
  AdminOpsResponse,
  AdminReportItem,
  BackofficeProfile,
  BackofficeRole,
  BackofficeSessionResponse,
  RestrictionType,
} from "../_lib/admin-types";

const STORAGE_KEY = "nuudl-admin-profile-v1";

const profileOptions: BackofficeProfile[] = [
  { id: "moderator-berlin", label: "Moderator", role: "moderator" },
  { id: "admin-ops", label: "Admin", role: "admin" },
  { id: "owner-root", label: "Owner", role: "owner" },
];

const navSections: AdminNavSection[] = [
  { id: "dashboard", label: "Dashboard", minRole: "moderator" },
  { id: "ops", label: "Ops", minRole: "moderator" },
  { id: "reports", label: "Reports", minRole: "moderator" },
  { id: "moderation", label: "Moderation", minRole: "moderator" },
  { id: "security", label: "Security", minRole: "moderator" },
  { id: "audit", label: "Audit", minRole: "moderator" },
  { id: "creators", label: "Creators", minRole: "admin" },
  { id: "payouts", label: "Payouts", minRole: "admin" },
  { id: "channels", label: "Channels", minRole: "admin" },
  { id: "flags", label: "Flags", minRole: "admin" },
  { id: "roles", label: "Rollen", minRole: "owner" },
];

const roleRank: Record<BackofficeRole, number> = {
  moderator: 0,
  admin: 1,
  owner: 2,
};

const backofficeRoleOptions: BackofficeRole[] = ["moderator", "admin", "owner"];

const canAccess = (currentRole: BackofficeRole, minRole: BackofficeRole) => roleRank[currentRole] >= roleRank[minRole];

const restrictionOptions: Array<{ label: string; value: RestrictionType }> = [
  { label: "Posting block", value: "posting_block" },
  { label: "Reply block", value: "reply_block" },
  { label: "Vote block", value: "vote_block" },
  { label: "Chat request block", value: "chat_request_block" },
  { label: "Geo switch block", value: "geo_switch_block" },
  { label: "Read-only", value: "read_only" },
];

const restrictionDurationMinutes = (type: RestrictionType) => (type === "read_only" ? 24 * 60 : 6 * 60);

const formatEuro = (cents: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const formatBytes = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

type OpsConnectionTarget = AdminOpsResponse["ops"]["storage"]["persistence"]["database"];

const persistenceDriverLabel = (driver: AdminOpsResponse["ops"]["storage"]["persistence"]["activeDriver"]) =>
  driver === "postgres_snapshot" ? "Postgres Snapshot" : "Snapshot File";

const requestedDriverLabel = (driver: AdminOpsResponse["ops"]["storage"]["persistence"]["requestedDriver"]) => {
  switch (driver) {
    case "postgres":
      return "Postgres";
    case "postgres_snapshot":
      return "Postgres Snapshot";
    case "snapshot_file":
      return "Snapshot File";
    default:
      return "Unbekannt";
  }
};

const connectionTargetLabel = (target: OpsConnectionTarget) => {
  if (!target.configured) {
    return "Nicht konfiguriert";
  }

  if (!target.valid) {
    return target.reason;
  }

  return [target.protocol, target.host, target.database].filter(Boolean).join(" / ") || "Konfiguriert";
};

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const ledgerLabel = (entry: LedgerEntry) => {
  switch (entry.kind) {
    case "topup":
      return "Top-up";
    case "tip_out":
      return "Tip out";
    case "tip_in":
      return "Creator revenue";
    case "platform_fee":
      return "Platform fee";
    case "plus_purchase":
      return "Plus purchase";
    default:
      return "Payout";
  }
};

const defaultProfile = profileOptions[1];

const readStoredProfile = (): BackofficeProfile => {
  if (typeof window === "undefined") {
    return defaultProfile;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultProfile;
  }

  try {
    const parsed = JSON.parse(raw) as BackofficeProfile;
    const match = profileOptions.find((option) => option.id === parsed.id && option.role === parsed.role);
    return match ?? defaultProfile;
  } catch {
    return defaultProfile;
  }
};

const writeStoredProfile = (profile: BackofficeProfile) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }
};

const backofficeAuthModeLabel = (session: BackofficeSessionResponse | null) => {
  if (!session) {
    return "Session wird geladen";
  }

  return session.authMode === "loopback_dev_headers" ? "Loopback-Dev" : "Server-Session";
};

const creatorStatusLabel = (application: CreatorApplication | null) => {
  if (!application) {
    return "Keine Antraege";
  }

  if (application.status === "approved") {
    return "Freigegeben";
  }

  if (application.status === "rejected") {
    return "Abgelehnt";
  }

  return "In Pruefung";
};

const previewMetaLabel = (body: { cityId?: string; createdAt?: string; mediaCount?: number; moderation?: string }) => {
  const parts = [
    body.cityId ?? null,
    body.createdAt ? formatTime(body.createdAt) : null,
    typeof body.mediaCount === "number" && body.mediaCount > 0 ? `${body.mediaCount} Bild${body.mediaCount > 1 ? "er" : ""}` : null,
    body.moderation ? `Status ${body.moderation}` : null,
  ].filter(Boolean);

  return parts.join(" • ");
};

type AuditContext = {
  accountDisplayName: string | null;
  accountId: string | null;
  accountUsername: string | null;
  installIdentityId: string | null;
  installLabel: string | null;
};

const hasAuditContext = (context: AuditContext) =>
  Boolean(
    context.accountDisplayName || context.accountId || context.accountUsername || context.installIdentityId || context.installLabel
  );

const auditContextLabel = (context: AuditContext) => {
  const accountPart = context.accountUsername
    ? `${context.accountDisplayName ?? context.accountUsername} @${context.accountUsername}`
    : context.accountDisplayName ?? null;
  const installPart = context.installIdentityId ? context.installLabel ?? context.installIdentityId : null;

  if (accountPart && installPart) {
    return `${accountPart} • ${installPart}`;
  }

  return accountPart ?? installPart ?? "ohne Kontext";
};

const auditContextSearchText = (context: AuditContext) =>
  [
    context.accountDisplayName,
    context.accountId,
    context.accountUsername,
    context.accountUsername ? `@${context.accountUsername}` : null,
    context.installIdentityId,
    context.installLabel,
  ]
    .filter(Boolean)
    .join(" ");

const relatedAuditContextsLabel = (contexts: AuditContext[] | undefined) => {
  if (!contexts?.length) {
    return null;
  }

  return contexts.map((context) => auditContextLabel(context)).join(" • ");
};

const humanizeAuditKey = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const buildAuditMetadataSummary = (metadata?: Record<string, unknown>) => {
  if (!metadata) {
    return [];
  }

  return Object.entries(metadata)
    .flatMap(([key, value]) => {
      if (value === null || value === undefined || key.endsWith("At")) {
        return [];
      }

      if (typeof value === "number" && key === "amountCents") {
        return `${humanizeAuditKey(key)}: ${formatEuro(value)}`;
      }

      if (Array.isArray(value)) {
        if (!value.length) {
          return [];
        }

        return `${humanizeAuditKey(key)}: ${value.slice(0, 2).join(", ")}${value.length > 2 ? ` +${value.length - 2}` : ""}`;
      }

      if (typeof value === "object") {
        return [];
      }

      return `${humanizeAuditKey(key)}: ${String(value)}`;
    })
    .slice(0, 4);
};

const auditEntrySearchText = (entry: AdminAuditLogItem) =>
  [
    entry.action,
    entry.actorType,
    entry.entityType,
    entry.entityId,
    entry.summary,
    auditContextSearchText(entry.actorContext),
    auditContextSearchText(entry.targetContext),
    ...(entry.relatedTargetContexts?.map((context) => auditContextSearchText(context)) ?? []),
    ...buildAuditMetadataSummary(entry.metadata),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const backofficeActionSearchText = (entry: AdminBackofficeActionItem) =>
  [
    entry.action,
    entry.actorId,
    entry.actorRole,
    entry.entityType,
    entry.entityId,
    auditContextSearchText(entry.targetContext),
    ...(entry.relatedTargetContexts?.map((context) => auditContextSearchText(context)) ?? []),
    ...buildAuditMetadataSummary(entry.metadata),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const renderAuditContextChips = (label: string, context: AuditContext) => {
  if (!hasAuditContext(context)) {
    return (
      <div className="auditContextGroup">
        <span className="auditContextLabel">{label}</span>
        <div className="tag-row">
          <span className="auditContextChip quiet">ohne Kontext</span>
        </div>
      </div>
    );
  }

  return (
    <div className="auditContextGroup">
      <span className="auditContextLabel">{label}</span>
      <div className="tag-row">
        {context.accountUsername ? (
          <span className="auditContextChip account">
            {context.accountDisplayName ?? context.accountUsername} @{context.accountUsername}
          </span>
        ) : context.accountDisplayName ? (
          <span className="auditContextChip account">{context.accountDisplayName}</span>
        ) : null}
        {context.accountId ? <span className="auditContextChip quiet">{context.accountId}</span> : null}
        {context.installIdentityId ? (
          <span className="auditContextChip install">{context.installLabel ?? context.installIdentityId}</span>
        ) : null}
      </div>
    </div>
  );
};

const renderRelatedAuditContextChips = (contexts: AuditContext[] | undefined) => {
  if (!contexts?.length) {
    return null;
  }

  return (
    <div className="auditContextGroup">
      <span className="auditContextLabel">Weitere Beteiligte</span>
      <div className="tag-row">
        {contexts.map((context, index) => (
          <span className="auditContextChip quiet" key={`${context.accountId ?? "account"}:${context.installIdentityId ?? "install"}:${index}`}>
            {auditContextLabel(context)}
          </span>
        ))}
      </div>
    </div>
  );
};

const renderAuditMetadataChips = (metadata?: Record<string, unknown>) => {
  const summary = buildAuditMetadataSummary(metadata);
  if (!summary.length) {
    return null;
  }

  return (
    <div className="auditContextGroup">
      <span className="auditContextLabel">Metadaten</span>
      <div className="tag-row">
        {summary.map((item) => (
          <span className="auditContextChip quiet" key={item}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

const renderBackofficeActorChips = (entry: AdminBackofficeActionItem) => (
  <div className="auditContextGroup">
    <span className="auditContextLabel">Actor</span>
    <div className="tag-row">
      <span className="tag">{entry.actorRole}</span>
      <span className="auditContextChip quiet">{entry.actorId}</span>
    </div>
  </div>
);

const renderTargetPreview = (item: AdminReportItem["targetPreview"] | AdminModerationCaseItem["targetPreview"]) => (
  <div className="contentPreview">
    <div className="contentPreviewHead">
      <div>
        <h4 className="contentPreviewTitle">{item.title}</h4>
        <p className="contentPreviewSubtitle">{item.subtitle}</p>
      </div>
      <span className="tag">{item.targetType}</span>
    </div>
    {item.body ? <p className="contentPreviewBody">{item.body}</p> : null}
    {previewMetaLabel(item) ? <div className="contentPreviewMeta">{previewMetaLabel(item)}</div> : null}
  </div>
);

export function AdminDashboard() {
  const [profile, setProfile] = useState<BackofficeProfile>(defaultProfile);
  const [session, setSession] = useState<BackofficeSessionResponse | null>(null);
  const [data, setData] = useState<AdminDataBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [selectedRestrictions, setSelectedRestrictions] = useState<Record<string, RestrictionType>>({});
  const [auditQuery, setAuditQuery] = useState("");
  const [auditActorFilter, setAuditActorFilter] = useState<"all" | "install" | "admin">("all");
  const [auditEntityFilter, setAuditEntityFilter] = useState("all");
  const [backofficeQuery, setBackofficeQuery] = useState("");
  const [backofficeRoleFilter, setBackofficeRoleFilter] = useState<"all" | BackofficeRole>("all");
  const [backofficeEntityFilter, setBackofficeEntityFilter] = useState("all");

  const loadDashboard = async (nextProfile: BackofficeProfile) => {
    setLoading(true);
    setError(null);

    try {
      const nextSession = await adminApi.getSession(nextProfile);
      const nextData = await adminApi.loadDashboard(nextProfile, nextSession);
      setSession(nextSession);
      setData(nextData);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Backoffice data could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setProfile(readStoredProfile());
  }, []);

  useEffect(() => {
    writeStoredProfile(profile);
    void loadDashboard(profile);
  }, [profile]);

  const runAction = async (actionKey: string, handler: () => Promise<unknown>) => {
    setActiveAction(actionKey);
    setError(null);

    try {
      await handler();
      await loadDashboard(profile);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setActiveAction(null);
    }
  };

  const currentRole = session?.actor.role ?? profile.role;
  const currentActorId = session?.user.id ?? profile.id;
  const currentActorLabel = session?.user.displayName ?? (session ? session.actor.role : profile.label);
  const currentSessionId = session?.session.id ?? null;
  const allowLocalRoleSwitch = session?.authMode === "loopback_dev_headers";

  const visibleSections = useMemo(
    () => navSections.filter((section) => canAccess(currentRole, section.minRole)),
    [currentRole]
  );

  const summary = data?.overview.counts;
  const creatorApplication = data?.creatorApplications[0] ?? null;
  const creatorWallet = creatorApplication ? data?.wallets[creatorApplication.installIdentityId] : null;
  const creatorPendingCents = creatorWallet?.pendingCents ?? 0;
  const securityCounts = data?.security.counts;
  const ops = data?.ops.ops;
  const betaReadiness = ops?.beta;
  const persistence = ops?.storage.persistence;
  const postgresRuntime = persistence?.postgresRuntime;
  const canManageSecurity = canAccess(currentRole, "admin");
  const canManageChannels = canAccess(currentRole, "admin");
  const canManageFlags = canAccess(currentRole, "admin");
  const backofficeUsers = data?.backofficeUsers ?? [];
  const activeBackofficeUsers = backofficeUsers.filter((user) => user.status === "active").length;
  const disabledBackofficeUsers = backofficeUsers.filter((user) => user.status === "disabled").length;
  const getSelectedRestriction = (installIdentityId: string) => selectedRestrictions[installIdentityId] ?? "posting_block";
  const auditBaseLogs = useMemo(
    () => (currentRole === "moderator" ? data?.auditLogs.slice(0, 8) ?? [] : data?.auditLogs ?? []),
    [currentRole, data?.auditLogs]
  );
  const backofficeBaseActions = useMemo(
    () => (currentRole === "moderator" ? data?.backofficeActions.slice(0, 8) ?? [] : data?.backofficeActions ?? []),
    [currentRole, data?.backofficeActions]
  );
  const auditEntityOptions = useMemo(
    () => [...new Set(auditBaseLogs.map((entry) => entry.entityType))].sort(),
    [auditBaseLogs]
  );
  const backofficeEntityOptions = useMemo(
    () => [...new Set(backofficeBaseActions.map((entry) => entry.entityType))].sort(),
    [backofficeBaseActions]
  );
  const filteredAuditLogs = useMemo(() => {
    const normalizedQuery = auditQuery.trim().toLowerCase();

    return auditBaseLogs.filter((entry) => {
      if (auditActorFilter !== "all" && entry.actorType !== auditActorFilter) {
        return false;
      }
      if (auditEntityFilter !== "all" && entry.entityType !== auditEntityFilter) {
        return false;
      }
      if (normalizedQuery && !auditEntrySearchText(entry).includes(normalizedQuery)) {
        return false;
      }

      return true;
    });
  }, [auditActorFilter, auditBaseLogs, auditEntityFilter, auditQuery]);
  const filteredBackofficeActions = useMemo(() => {
    const normalizedQuery = backofficeQuery.trim().toLowerCase();

    return backofficeBaseActions.filter((entry) => {
      if (backofficeRoleFilter !== "all" && entry.actorRole !== backofficeRoleFilter) {
        return false;
      }
      if (backofficeEntityFilter !== "all" && entry.entityType !== backofficeEntityFilter) {
        return false;
      }
      if (normalizedQuery && !backofficeActionSearchText(entry).includes(normalizedQuery)) {
        return false;
      }

      return true;
    });
  }, [backofficeBaseActions, backofficeEntityFilter, backofficeQuery, backofficeRoleFilter]);
  const hasAuditFilters = Boolean(auditQuery) || auditActorFilter !== "all" || auditEntityFilter !== "all";
  const hasBackofficeFilters =
    Boolean(backofficeQuery) || backofficeRoleFilter !== "all" || backofficeEntityFilter !== "all";

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-top">
          <div>
            <div className="eyebrow">Admin Backoffice</div>
            <h1 className="title">Live operations for moderation, creator review, payouts, and audit.</h1>
            <p className="subtitle">
              This view now reads from the live API surface and derives role gating from the server-validated
              backoffice session. Local role switching stays available only on loopback dev.
            </p>
          </div>
          <div className="hero-badges">
            <span className="pill">Phase A</span>
            <span className="pill">Live API reads</span>
            <span className="pill">Role-aware UI</span>
          </div>
        </div>

        <div className="toolbar">
          {allowLocalRoleSwitch ? (
            <div className="controlGroup">
              <label className="controlLabel" htmlFor="backoffice-role">
                Rolle
              </label>
              <select
                className="controlInput"
                id="backoffice-role"
                value={profile.id}
                onChange={(event) => {
                  const nextProfile = profileOptions.find((option) => option.id === event.target.value) ?? defaultProfile;
                  setProfile(nextProfile);
                }}
              >
                {profileOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="controlGroup">
              <span className="controlLabel">Session-Modus</span>
              <div className="actorPill">{backofficeAuthModeLabel(session)}</div>
            </div>
          )}
          <div className="controlGroup">
            <span className="controlLabel">Aktiver Actor</span>
            <div className="actorPill">
              {currentActorLabel} <span className="actorMeta">{currentActorId}</span>
            </div>
          </div>
          {currentSessionId ? (
            <div className="controlGroup">
              <span className="controlLabel">Operator-Session</span>
              <div className="actorPill">
                Session <span className="actorMeta">{currentSessionId}</span>
              </div>
            </div>
          ) : null}
          <button className="actionButton strong" disabled={loading} onClick={() => void loadDashboard(profile)} type="button">
            {loading ? "Laedt..." : "Neu laden"}
          </button>
        </div>

        {error ? <div className="errorBanner">{error}</div> : null}

        <div className="status-grid">
          <div className="status-card">
            <div className="status-label">Open cases</div>
            <div className="status-value">{summary?.openCases ?? "—"}</div>
            <div className="status-note">Moderation queue from /admin/overview.</div>
          </div>
          <div className="status-card">
            <div className="status-label">Reports</div>
            <div className="status-value">{summary?.reports ?? "—"}</div>
            <div className="status-note">Current report volume across the live store.</div>
          </div>
          <div className="status-card">
            <div className="status-label">Ledger entries</div>
            <div className="status-value">{summary?.ledgerEntries ?? "—"}</div>
            <div className="status-note">Live ledger rows for finance and review.</div>
          </div>
          <div className="status-card">
            <div className="status-label">Creator status</div>
            <div className="status-value">{creatorStatusLabel(creatorApplication)}</div>
            <div className="status-note">Role-gated creator workflow for Phase A.</div>
          </div>
          <div className="status-card">
            <div className="status-label">Active restrictions</div>
            <div className="status-value">{securityCounts?.activeRestrictions ?? "—"}</div>
            <div className="status-note">Current blocking or read-only restrictions.</div>
          </div>
          <div className="status-card">
            <div className="status-label">Flagged installs</div>
            <div className="status-value">{securityCounts?.flaggedInstalls ?? "—"}</div>
            <div className="status-note">Installs with elevated risk score.</div>
          </div>
          <div className="status-card">
            <div className="status-label">API uptime</div>
            <div className="status-value">{ops ? `${ops.runtime.uptimeSeconds}s` : "—"}</div>
            <div className="status-note">Live runtime from /admin/ops.</div>
          </div>
          <div className="status-card">
            <div className="status-label">Uploads</div>
            <div className="status-value">{ops?.counts.uploads ?? "—"}</div>
            <div className="status-note">Stored media files in the local beta stack.</div>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="navRail panel">
          <div className="section-head compact">
            <div>
              <h2 className="section-title">Navigation</h2>
              <div className="section-meta">Visible sections depend on the local backoffice role.</div>
            </div>
          </div>
          <div className="nav-links">
            {visibleSections.map((section) => (
              <a className="nav-link" href={`#${section.id}`} key={section.id}>
                {section.label}
              </a>
            ))}
          </div>
        </aside>

        <div className="content">
          <article className="panel section" id="dashboard">
            <div className="section-head">
              <div>
                <h2 className="section-title">Dashboard</h2>
                <div className="section-meta">Counts and wallet state from /admin/overview.</div>
              </div>
              <span className="tag good">{currentActorLabel}</span>
            </div>
            <div className="metrics">
              <div className="metric">
                <div className="metric-value">{summary?.posts ?? "—"}</div>
                <div className="metric-label">Posts</div>
              </div>
              <div className="metric">
                <div className="metric-value">{summary?.replies ?? "—"}</div>
                <div className="metric-label">Replies</div>
              </div>
              <div className="metric">
                <div className="metric-value">{summary?.blockedContent ?? "—"}</div>
                <div className="metric-label">Blocked content</div>
              </div>
              <div className="metric">
                <div className="metric-value">{data ? formatEuro(data.overview.wallet.availableCents) : "—"}</div>
                <div className="metric-label">Viewer wallet snapshot</div>
              </div>
            </div>
          </article>

          <article className="panel section" id="ops">
            <div className="section-head">
              <div>
                <h2 className="section-title">Ops</h2>
                <div className="section-meta">Runtime, persistence and upload storage from /admin/ops.</div>
              </div>
              <span className={`tag ${postgresRuntime?.ready || ops?.storage.snapshotFile.exists ? "good" : "warn"}`}>
                {postgresRuntime?.ready ? "Postgres aktiv" : ops?.storage.snapshotFile.exists ? "Snapshot aktiv" : "Kein Persist"}
              </span>
            </div>
            <div className="metrics">
              <div className="metric">
                <div className="metric-value">{persistence ? persistenceDriverLabel(persistence.activeDriver) : "—"}</div>
                <div className="metric-label">Aktive Persistenz</div>
              </div>
              <div className="metric">
                <div className="metric-value">{postgresRuntime?.ready ? "Ja" : persistence?.database.configured ? "Konfiguriert" : "Nein"}</div>
                <div className="metric-label">Postgres</div>
              </div>
              <div className="metric">
                <div className="metric-value">{ops ? `${ops.runtime.uptimeSeconds}s` : "—"}</div>
                <div className="metric-label">Uptime</div>
              </div>
              <div className="metric">
                <div className="metric-value">{ops?.counts.installSessions ?? "—"}</div>
                <div className="metric-label">Sessions</div>
              </div>
              <div className="metric">
                <div className="metric-value">{ops?.counts.refreshTokens ?? "—"}</div>
                <div className="metric-label">Refresh tokens</div>
              </div>
              <div className="metric">
                <div className="metric-value">{ops?.counts.idempotencyKeys ?? "—"}</div>
                <div className="metric-label">Idempotency keys</div>
              </div>
            </div>
            <div className="detail-grid card-list spaced">
              <div className="detail-card">
                <div className="section-head compact">
                  <div>
                    <h3 className="section-title">Beta Preflight</h3>
                    <div className="section-meta">Read-only readiness for deploy and first invites.</div>
                  </div>
                  <span
                    className={`tag ${
                      betaReadiness?.status === "ready"
                        ? "good"
                        : betaReadiness?.status === "blocked"
                          ? "danger"
                          : "warn"
                    }`}
                  >
                    {betaReadiness?.status ?? "—"}
                  </span>
                </div>
                <div className="metrics compactMetrics">
                  <div className="metric">
                    <div className="metric-value">{betaReadiness?.env.seedProfile ?? "—"}</div>
                    <div className="metric-label">Seed profile</div>
                  </div>
                  <div className="metric">
                    <div className="metric-value">{betaReadiness?.env.betaInviteRequired ? "An" : "Aus"}</div>
                    <div className="metric-label">Invite gate</div>
                  </div>
                  <div className="metric">
                    <div className="metric-value">{betaReadiness?.mutableRecordCount ?? "—"}</div>
                    <div className="metric-label">Mutable records</div>
                  </div>
                </div>
                <div className="card-list">
                  {betaReadiness?.checks.map((check) => (
                    <div className="list-item compactItem" key={check.id}>
                      <div className="item-top">
                        <div>
                          <h4 className="item-title">{check.label}</h4>
                          <p className="item-subtitle">{check.detail}</p>
                        </div>
                        <span className={`tag ${check.ok ? "good" : check.severity === "error" ? "danger" : "warn"}`}>
                          {check.ok ? "ok" : check.severity}
                        </span>
                      </div>
                    </div>
                  )) ?? <div className="emptyState">Preflight wird geladen.</div>}
                </div>
              </div>
              <div className="detail-card">
                <div className="section-head compact">
                  <div>
                    <h3 className="section-title">Datenbank</h3>
                    <div className="section-meta">Aktueller DB- und Repository-Status.</div>
                  </div>
                </div>
                <div className="card-list">
                  <div className="list-item compactItem">
                    <div className="item-top">
                      <div>
                        <h4 className="item-title">
                          {postgresRuntime?.ready
                            ? "Postgres Snapshot aktiv"
                            : persistence?.database.configured
                              ? "Postgres konfiguriert"
                              : "Postgres nicht aktiv"}
                        </h4>
                        <p className="item-subtitle">{persistence ? connectionTargetLabel(persistence.database) : "—"}</p>
                      </div>
                      <span className={`tag ${postgresRuntime?.ready ? "good" : "warn"}`}>
                        {persistence ? requestedDriverLabel(persistence.requestedDriver) : "—"}
                      </span>
                    </div>
                    <div className="contentPreviewMeta">
                      {persistence?.warning ?? "Noch kein Persistence-Status geladen."}
                    </div>
                    <div className="tag-row">
                      <span className={`tag ${postgresRuntime?.snapshotReady ? "good" : "warn"}`}>
                        Snapshot {postgresRuntime?.snapshotReady ? "ready" : "pending"}
                      </span>
                      <span className={`tag ${postgresRuntime?.normalizedMirror.ready ? "good" : "warn"}`}>
                        Mirror {postgresRuntime?.normalizedMirror.status ?? "—"}
                      </span>
                      <span className={`tag ${postgresRuntime?.normalizedReadOverlay.ready ? "good" : "warn"}`}>
                        Read overlay {postgresRuntime?.normalizedReadOverlay.status ?? "—"}
                      </span>
                    </div>
                    <div className="contentPreviewMeta">
                      Schema: {persistence?.schemaDraftPath ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="detail-card">
                <div className="section-head compact">
                  <div>
                    <h3 className="section-title">Snapshot file</h3>
                    <div className="section-meta">Persisted API store for the closed beta.</div>
                  </div>
                </div>
                <div className="card-list">
                  <div className="list-item compactItem">
                    <div className="item-top">
                      <div>
                        <h4 className="item-title">{ops?.storage.snapshotFile.exists ? "api-store.json" : "Nicht vorhanden"}</h4>
                        <p className="item-subtitle">{ops?.storage.snapshotFile.path ?? "—"}</p>
                      </div>
                      <span className="tag">{ops ? formatBytes(ops.storage.snapshotFile.sizeBytes) : "—"}</span>
                    </div>
                    <div className="contentPreviewMeta">
                      {ops?.storage.snapshotFile.updatedAt ? `Aktualisiert ${formatTime(ops.storage.snapshotFile.updatedAt)}` : "Noch kein Persist-Write"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="detail-card">
                <div className="section-head compact">
                  <div>
                    <h3 className="section-title">Uploads</h3>
                    <div className="section-meta">Dateien im lokalen Media-Verzeichnis.</div>
                  </div>
                </div>
                <div className="card-list">
                  <div className="list-item compactItem">
                    <div className="item-top">
                      <div>
                        <h4 className="item-title">{ops?.storage.uploadsDirectory.fileCount ?? 0} Dateien</h4>
                        <p className="item-subtitle">{ops?.storage.uploadsDirectory.path ?? "—"}</p>
                      </div>
                      <span className="tag">{ops ? formatBytes(ops.storage.uploadsDirectory.totalBytes) : "—"}</span>
                    </div>
                    <div className="contentPreviewMeta">
                      {ops?.storage.uploadsDirectory.updatedAt
                        ? `Letzte Datei ${formatTime(ops.storage.uploadsDirectory.updatedAt)}`
                        : "Noch keine Uploads gespeichert"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="panel section" id="reports">
            <div className="section-head">
              <div>
                <h2 className="section-title">Reports</h2>
                <div className="section-meta">Incoming reports from /admin/reports.</div>
              </div>
              <span className="tag warn">{data?.reports.filter((item) => item.status === "open").length ?? 0} open</span>
            </div>
            <div className="card-list">
              {loading ? (
                <div className="emptyState">Berichte werden geladen.</div>
              ) : data?.reportItems.length ? (
                data.reportItems.map((item) => (
                  <div className="list-item" key={item.report.id}>
                    <div className="item-top">
                      <div>
                        <h3 className="item-title">{item.report.reason}</h3>
                        <p className="item-subtitle">
                          Case {item.report.moderationCaseId}
                          {item.moderationCase ? ` • ${item.moderationCase.status}` : ""}
                        </p>
                      </div>
                      <span className={`tag ${item.report.status === "open" ? "warn" : "good"}`}>{item.report.status}</span>
                    </div>
                    {renderTargetPreview(item.targetPreview)}
                  </div>
                ))
              ) : (
                <div className="emptyState">Keine Reports vorhanden.</div>
              )}
            </div>
          </article>

          <article className="panel section" id="moderation">
            <div className="section-head">
              <div>
                <h2 className="section-title">Moderation</h2>
                <div className="section-meta">Case actions hit /admin/moderation/actions directly.</div>
              </div>
            </div>
            <div className="card-list">
              {loading ? (
                <div className="emptyState">Moderation cases werden geladen.</div>
              ) : data?.moderationCaseItems.length ? (
                data.moderationCaseItems.map((item) => (
                  <div className="list-item" key={item.caseItem.id}>
                    <div className="item-top">
                      <div>
                        <h3 className="item-title">{item.targetPreview.title}</h3>
                        <p className="item-subtitle">
                          {item.caseItem.reason} • {formatTime(item.caseItem.createdAt)}
                          {item.linkedReports.length ? ` • ${item.linkedReports.length} Report${item.linkedReports.length > 1 ? "s" : ""}` : ""}
                        </p>
                      </div>
                      <span className={`tag ${item.caseItem.status === "open" ? "warn" : "good"}`}>{item.caseItem.status}</span>
                    </div>
                    {renderTargetPreview(item.targetPreview)}
                    <div className="inlineActions">
                      <button
                        className="actionButton"
                        disabled={activeAction === `flag-${item.caseItem.id}`}
                        onClick={() =>
                          void runAction(`flag-${item.caseItem.id}`, () =>
                            adminApi.moderateCase(profile, { action: "flag", caseId: item.caseItem.id, note: "Flagged from backoffice." })
                          )
                        }
                        type="button"
                      >
                        Flaggen
                      </button>
                      <button
                        className="actionButton danger"
                        disabled={activeAction === `block-${item.caseItem.id}`}
                        onClick={() =>
                          void runAction(`block-${item.caseItem.id}`, () =>
                            adminApi.moderateCase(profile, { action: "block", caseId: item.caseItem.id, note: "Blocked from backoffice." })
                          )
                        }
                        type="button"
                      >
                        Blocken
                      </button>
                      <button
                        className="actionButton quiet"
                        disabled={activeAction === `restore-${item.caseItem.id}`}
                        onClick={() =>
                          void runAction(`restore-${item.caseItem.id}`, () =>
                            adminApi.moderateCase(profile, { action: "restore", caseId: item.caseItem.id, note: "Restored from backoffice." })
                          )
                        }
                        type="button"
                      >
                        Wiederherstellen
                      </button>
                      <button
                        className="actionButton quiet"
                        disabled={activeAction === `dismiss-${item.caseItem.id}`}
                        onClick={() =>
                          void runAction(`dismiss-${item.caseItem.id}`, () =>
                            adminApi.moderateCase(profile, { action: "dismiss", caseId: item.caseItem.id, note: "Dismissed from backoffice." })
                          )
                        }
                        type="button"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="emptyState">Keine offenen Moderationsfaelle.</div>
              )}
            </div>
          </article>

          <article className="panel section" id="security">
            <div className="section-head">
              <div>
                <h2 className="section-title">Security</h2>
                <div className="section-meta">Aktive Restrictions, Abuse-Events und Risk-Scores fuer Moderation und Ops.</div>
              </div>
              <span className="tag warn">{securityCounts?.abuseEvents ?? 0} events</span>
            </div>
            <div className="metrics">
              <div className="metric">
                <div className="metric-value">{securityCounts?.activeRestrictions ?? "—"}</div>
                <div className="metric-label">Aktive Restrictions</div>
              </div>
              <div className="metric">
                <div className="metric-value">{securityCounts?.flaggedInstalls ?? "—"}</div>
                <div className="metric-label">Flagged installs</div>
              </div>
              <div className="metric">
                <div className="metric-value">{securityCounts?.restrictedInstalls ?? "—"}</div>
                <div className="metric-label">Restricted installs</div>
              </div>
              <div className="metric">
                <div className="metric-value">{securityCounts?.abuseEvents ?? "—"}</div>
                <div className="metric-label">Abuse events</div>
              </div>
            </div>
            <div className="detail-grid securityGrid">
              <div className="detail-card">
                <div className="section-head compact">
                  <div>
                    <h3 className="section-title">Restrictions</h3>
                    <div className="section-meta">Aktuell wirksame Einschraenkungen.</div>
                  </div>
                </div>
                <div className="card-list">
                  {data?.security.activeRestrictions.length ? (
                    data.security.activeRestrictions.map((entry) => (
                      <div className="list-item compactItem" key={entry.id}>
                        <div className="item-top">
                          <div>
                            <h4 className="item-title">{entry.type}</h4>
                            <p className="item-subtitle">
                              {entry.installIdentityId} • {entry.reasonCode}
                            </p>
                          </div>
                          <span className="tag warn">bis {formatTime(entry.endsAt)}</span>
                        </div>
                        <div className="contentPreviewMeta">{entry.triggerSource}</div>
                        {canManageSecurity ? (
                          <div className="inlineActions">
                            <button
                              className="actionButton quiet"
                              disabled={activeAction === `clear-restriction-${entry.id}`}
                              onClick={() =>
                                void runAction(`clear-restriction-${entry.id}`, () =>
                                  adminApi.updateSecurityRestriction(profile, {
                                    action: "clear",
                                    installIdentityId: entry.installIdentityId,
                                    note: "Cleared from security panel.",
                                    type: entry.type,
                                  })
                                )
                              }
                              type="button"
                            >
                              Aufheben
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="emptyState">Keine aktiven Restrictions.</div>
                  )}
                </div>
              </div>
              <div className="detail-card">
                <div className="section-head compact">
                  <div>
                    <h3 className="section-title">Risk scores</h3>
                    <div className="section-meta">Hohe Scores zuerst fuer schnelle Sichtung.</div>
                  </div>
                </div>
                <div className="card-list">
                  {data?.security.riskStates.length ? (
                    data.security.riskStates.map((entry) => (
                      <div className="list-item compactItem" key={entry.installIdentityId}>
                        <div className="item-top">
                          <div>
                            <h4 className="item-title">{entry.installIdentityId}</h4>
                            <p className="item-subtitle">
                              {entry.flaggedAt ? `flagged ${formatTime(entry.flaggedAt)}` : "nicht flagged"}
                              {entry.restrictedAt ? ` • restricted ${formatTime(entry.restrictedAt)}` : ""}
                            </p>
                          </div>
                          <span className={`tag ${entry.score >= 50 ? "warn" : "good"}`}>Score {entry.score}</span>
                        </div>
                        <div className="contentPreviewMeta">Aktualisiert {formatTime(entry.lastUpdatedAt)}</div>
                        {canManageSecurity ? (
                          <div className="inlineActions">
                            <select
                              className="controlInput inlineSelect"
                              onChange={(event) =>
                                setSelectedRestrictions((current) => ({
                                  ...current,
                                  [entry.installIdentityId]: event.target.value as RestrictionType,
                                }))
                              }
                              value={getSelectedRestriction(entry.installIdentityId)}
                            >
                              {restrictionOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <button
                              className="actionButton"
                              disabled={activeAction === `apply-restriction-${entry.installIdentityId}`}
                              onClick={() =>
                                void runAction(`apply-restriction-${entry.installIdentityId}`, () =>
                                  adminApi.updateSecurityRestriction(profile, {
                                    action: "apply",
                                    durationMinutes: restrictionDurationMinutes(getSelectedRestriction(entry.installIdentityId)),
                                    installIdentityId: entry.installIdentityId,
                                    note: `${getSelectedRestriction(entry.installIdentityId)} from security panel.`,
                                    type: getSelectedRestriction(entry.installIdentityId),
                                  })
                                )
                              }
                              type="button"
                            >
                              Sperre anwenden
                            </button>
                            <button
                              className="actionButton quiet"
                              disabled={activeAction === `clear-all-${entry.installIdentityId}`}
                              onClick={() =>
                                void runAction(`clear-all-${entry.installIdentityId}`, () =>
                                  adminApi.updateSecurityRestriction(profile, {
                                    action: "clear",
                                    installIdentityId: entry.installIdentityId,
                                    note: "Cleared all active restrictions from security panel.",
                                  })
                                )
                              }
                              type="button"
                            >
                              Alles freigeben
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="emptyState">Noch keine Risk-State-Eintraege.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="card-list spaced">
              <div className="section-head compact">
                <div>
                  <h3 className="section-title">Recent abuse events</h3>
                  <div className="section-meta">Letzte Signale aus Rate Limits, Restrictions und Session-Missbrauch.</div>
                </div>
              </div>
              {data?.security.recentAbuseEvents.length ? (
                data.security.recentAbuseEvents.map((entry) => (
                  <div className="list-item compactItem" key={entry.id}>
                    <div className="item-top">
                      <div>
                        <h4 className="item-title">{entry.kind}</h4>
                        <p className="item-subtitle">
                          {entry.installIdentityId ?? "ohne install"} • {entry.routeName}
                        </p>
                      </div>
                      <span className="tag">{formatTime(entry.createdAt)}</span>
                    </div>
                    {entry.ipHash ? <div className="contentPreviewMeta">IP hash {entry.ipHash.slice(0, 12)}…</div> : null}
                  </div>
                ))
              ) : (
                <div className="emptyState">Noch keine Abuse-Events gespeichert.</div>
              )}
            </div>
          </article>

          <article className="panel section" id="audit">
            <div className="section-head">
              <div>
                <h2 className="section-title">Audit</h2>
                <div className="section-meta">
                    {currentRole === "moderator"
                    ? `Moderatoren sehen serverseitig nur die letzten 8 Audit-Eintraege. Geladen: ${auditBaseLogs.length} von ${data?.overview.counts.auditLogs ?? auditBaseLogs.length}.`
                    : "Admins und Owner sehen den kompletten Live-Audit-Stream."}
                </div>
              </div>
            </div>
            <div className="detail-grid securityGrid">
              <div className="detail-card">
                <div className="section-head compact">
                  <div>
                    <h3 className="section-title">System- und Nutzerereignisse</h3>
                    <div className="section-meta">Account- und Install-Kontext aus dem Audit-Stream.</div>
                  </div>
                </div>
                <div className="miniToolbar">
                  <div className="controlGroup compactControl">
                    <label className="controlLabel" htmlFor="audit-query">
                      Suche
                    </label>
                    <input
                      className="controlInput compactInput"
                      id="audit-query"
                      onChange={(event) => setAuditQuery(event.target.value)}
                      placeholder="Action, Entity, Account, Install"
                      type="text"
                      value={auditQuery}
                    />
                  </div>
                  <div className="controlGroup compactControl">
                    <label className="controlLabel" htmlFor="audit-actor-filter">
                      Actor
                    </label>
                    <select
                      className="controlInput compactInput"
                      id="audit-actor-filter"
                      onChange={(event) => setAuditActorFilter(event.target.value as "all" | "install" | "admin")}
                      value={auditActorFilter}
                    >
                      <option value="all">Alle</option>
                      <option value="install">Install</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="controlGroup compactControl">
                    <label className="controlLabel" htmlFor="audit-entity-filter">
                      Entity
                    </label>
                    <select
                      className="controlInput compactInput"
                      id="audit-entity-filter"
                      onChange={(event) => setAuditEntityFilter(event.target.value)}
                      value={auditEntityFilter}
                    >
                      <option value="all">Alle</option>
                      {auditEntityOptions.map((entityType) => (
                        <option key={entityType} value={entityType}>
                          {entityType}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filterSummary">
                    <span className="pill compactPill">
                      {filteredAuditLogs.length} / {auditBaseLogs.length} geladen
                    </span>
                    {currentRole === "moderator" && (data?.overview.counts.auditLogs ?? auditBaseLogs.length) > auditBaseLogs.length ? (
                      <span className="pill compactPill">{data?.overview.counts.auditLogs} gesamt</span>
                    ) : null}
                    {hasAuditFilters ? (
                      <button
                        className="actionButton quiet"
                        onClick={() => {
                          setAuditQuery("");
                          setAuditActorFilter("all");
                          setAuditEntityFilter("all");
                        }}
                        type="button"
                      >
                        Filter zuruecksetzen
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="timeline">
                  {filteredAuditLogs.length ? filteredAuditLogs.map((entry) => (
                    <div className="timeline-row" key={entry.id}>
                      <div className="timeline-marker" />
                      <div className="timeline-card">
                        <div className="timeline-top">
                          <span className="timeline-kind">{entry.action}</span>
                          <span className="timeline-time">{formatTime(entry.createdAt)}</span>
                        </div>
                        <h3 className="item-title">{entry.actorType === "admin" ? "Backoffice action" : "System event"}</h3>
                        <p className="item-subtitle">{`${entry.entityType} ${entry.entityId}`}</p>
                        {entry.summary ? <p className="contentPreviewBody">{entry.summary}</p> : null}
                        <div className="auditContextStack">
                          {renderAuditContextChips("Actor", entry.actorContext)}
                          {renderAuditContextChips("Target", entry.targetContext)}
                          {renderRelatedAuditContextChips(entry.relatedTargetContexts)}
                          {renderAuditMetadataChips(entry.metadata)}
                        </div>
                      </div>
                    </div>
                  )) : <div className="emptyState">Keine Audit-Events fuer diese Filter vorhanden.</div>}
                </div>
              </div>
              <div className="detail-card">
                <div className="section-head compact">
                  <div>
                    <h3 className="section-title">Backoffice-Aktionen</h3>
                    <div className="section-meta">Wer im Backoffice was auf welchem Ziel ausgelöst hat.</div>
                  </div>
                </div>
                <div className="miniToolbar">
                  <div className="controlGroup compactControl">
                    <label className="controlLabel" htmlFor="backoffice-query">
                      Suche
                    </label>
                    <input
                      className="controlInput compactInput"
                      id="backoffice-query"
                      onChange={(event) => setBackofficeQuery(event.target.value)}
                      placeholder="Action, Rolle, Entity, Kontext"
                      type="text"
                      value={backofficeQuery}
                    />
                  </div>
                  <div className="controlGroup compactControl">
                    <label className="controlLabel" htmlFor="backoffice-role-filter">
                      Rolle
                    </label>
                    <select
                      className="controlInput compactInput"
                      id="backoffice-role-filter"
                      onChange={(event) => setBackofficeRoleFilter(event.target.value as "all" | BackofficeRole)}
                      value={backofficeRoleFilter}
                    >
                      <option value="all">Alle</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                  <div className="controlGroup compactControl">
                    <label className="controlLabel" htmlFor="backoffice-entity-filter">
                      Entity
                    </label>
                    <select
                      className="controlInput compactInput"
                      id="backoffice-entity-filter"
                      onChange={(event) => setBackofficeEntityFilter(event.target.value)}
                      value={backofficeEntityFilter}
                    >
                      <option value="all">Alle</option>
                      {backofficeEntityOptions.map((entityType) => (
                        <option key={entityType} value={entityType}>
                          {entityType}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="filterSummary">
                    <span className="pill compactPill">
                      {filteredBackofficeActions.length} / {backofficeBaseActions.length} geladen
                    </span>
                    {currentRole === "moderator" &&
                    (data?.overview.counts.backofficeActions ?? backofficeBaseActions.length) > backofficeBaseActions.length ? (
                      <span className="pill compactPill">{data?.overview.counts.backofficeActions} gesamt</span>
                    ) : null}
                    {hasBackofficeFilters ? (
                      <button
                        className="actionButton quiet"
                        onClick={() => {
                          setBackofficeQuery("");
                          setBackofficeRoleFilter("all");
                          setBackofficeEntityFilter("all");
                        }}
                        type="button"
                      >
                        Filter zuruecksetzen
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="card-list">
                  {filteredBackofficeActions.length ? (
                    filteredBackofficeActions.map((entry) => (
                      <div className="list-item compactItem" key={entry.id}>
                        <div className="item-top">
                          <div>
                            <h4 className="item-title">{entry.action}</h4>
                            <p className="item-subtitle">{`${entry.entityType} ${entry.entityId}`}</p>
                          </div>
                          <span className="tag">{entry.actorRole}</span>
                        </div>
                        <div className="auditContextStack">
                          {renderBackofficeActorChips(entry)}
                          {renderAuditContextChips("Target", entry.targetContext)}
                          {renderRelatedAuditContextChips(entry.relatedTargetContexts)}
                          {renderAuditMetadataChips(entry.metadata)}
                        </div>
                        <div className="contentPreviewMeta">{formatTime(entry.createdAt)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="emptyState">Keine Backoffice-Aktionen fuer diese Filter vorhanden.</div>
                  )}
                </div>
              </div>
            </div>
          </article>

          {canAccess(currentRole, "admin") ? (
            <article className="panel section" id="creators">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Creators</h2>
                  <div className="section-meta">Applications from /admin/creator-applications with real review actions.</div>
                </div>
                <span className="tag warn">{creatorApplication?.status ?? "none"}</span>
              </div>
              <div className="card-list">
                {creatorApplication ? (
                  <div className="list-item">
                    <div className="item-top">
                      <div>
                        <h3 className="item-title">{creatorApplication.installIdentityId}</h3>
                        <p className="item-subtitle">
                          {creatorApplication.status} • KYC {creatorApplication.kycState} • Payout {creatorApplication.payoutState}
                        </p>
                      </div>
                      <span className={`tag ${creatorApplication.status === "approved" ? "good" : "warn"}`}>
                        {creatorApplication.status}
                      </span>
                    </div>
                    <div className="inlineActions">
                      <button
                        className="actionButton"
                        disabled={activeAction === `approve-${creatorApplication.id}`}
                        onClick={() =>
                          void runAction(`approve-${creatorApplication.id}`, () =>
                            adminApi.reviewCreator(profile, {
                              action: "approve",
                              applicationId: creatorApplication.id,
                              note: "Approved from admin backoffice.",
                            })
                          )
                        }
                        type="button"
                      >
                        Freigeben
                      </button>
                      <button
                        className="actionButton danger"
                        disabled={activeAction === `reject-${creatorApplication.id}`}
                        onClick={() =>
                          void runAction(`reject-${creatorApplication.id}`, () =>
                            adminApi.reviewCreator(profile, {
                              action: "reject",
                              applicationId: creatorApplication.id,
                              note: "Rejected from admin backoffice.",
                            })
                          )
                        }
                        type="button"
                      >
                        Ablehnen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="emptyState">Keine Creator-Antraege vorhanden.</div>
                )}
              </div>
            </article>
          ) : null}

          {canAccess(currentRole, "admin") ? (
            <article className="panel section" id="payouts">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Payouts</h2>
                  <div className="section-meta">Ledger and wallet state from /admin/ledger.</div>
                </div>
                <span className="tag good">{formatEuro(creatorPendingCents)}</span>
              </div>
              <div className="metrics">
                <div className="metric">
                  <div className="metric-value">{formatEuro(creatorPendingCents)}</div>
                  <div className="metric-label">Creator pending</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{creatorWallet ? formatEuro(creatorWallet.availableCents) : "—"}</div>
                  <div className="metric-label">Creator available</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{creatorWallet ? formatEuro(creatorWallet.lifetimePaidOutCents) : "—"}</div>
                  <div className="metric-label">Lifetime paid out</div>
                </div>
                <div className="metric">
                  <div className="metric-value">{data?.ledger.length ?? 0}</div>
                  <div className="metric-label">Ledger rows</div>
                </div>
              </div>
              <div className="inlineActions">
                <button
                  className="actionButton"
                  disabled={
                    !creatorApplication ||
                    creatorPendingCents < 100 ||
                    activeAction === `payout-${creatorApplication?.id ?? "none"}`
                  }
                  onClick={() => {
                    if (!creatorApplication) {
                      return;
                    }

                    void runAction(`payout-${creatorApplication.id}`, () =>
                      adminApi.createPayout(profile, {
                        amountCents: creatorPendingCents,
                        applicationId: creatorApplication.id,
                      })
                    );
                  }}
                  type="button"
                >
                  Pending auszahlen
                </button>
              </div>
              <div className="card-list spaced">
                {data?.ledger.slice(0, 8).map((entry) => (
                  <div className="list-item" key={entry.id}>
                    <div className="item-top">
                      <div>
                        <h3 className="item-title">{ledgerLabel(entry)}</h3>
                        <p className="item-subtitle">
                          {entry.installIdentityId} • {entry.refType} {entry.refId}
                        </p>
                      </div>
                      <span className="tag">{formatEuro(entry.netCents)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {canAccess(currentRole, "admin") ? (
            <article className="panel section" id="channels">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Channels</h2>
                  <div className="section-meta">Live channel controls from /admin/channels.</div>
                </div>
                <span className="tag">{data?.channels.length ?? 0} Channels</span>
              </div>
              <div className="card-list">
                {data?.channels.length ? (
                  data.channels.map((channel) => (
                    <div className="list-item" key={channel.id}>
                      <div className="item-top">
                        <div>
                          <h3 className="item-title">{channel.title}</h3>
                          <p className="item-subtitle">
                            {channel.cityLabel} • /{channel.slug} • {channel.postCount} Posts • {channel.openReportCount} offene Reports
                          </p>
                        </div>
                        <span className={`tag ${channel.isVerified ? "good" : "warn"}`}>
                          {channel.isVerified ? "verifiziert" : "nicht verifiziert"}
                        </span>
                      </div>
                      <div className="contentPreview">{channel.description}</div>
                      <div className="tag-row">
                        <span className={`tag ${channel.isAdultOnly ? "warn" : "good"}`}>
                          {channel.isAdultOnly ? "18+" : "nicht adult-only"}
                        </span>
                        <span className={`tag ${channel.isExclusive ? "warn" : "good"}`}>
                          {channel.isExclusive ? "exklusiv" : "offen"}
                        </span>
                        <span className="tag">{channel.memberCount} Mitglieder</span>
                      </div>
                      {canManageChannels ? (
                        <div className="inlineActions">
                          <button
                            className="actionButton quiet"
                            disabled={activeAction === `channel-verified-${channel.id}`}
                            onClick={() =>
                              void runAction(`channel-verified-${channel.id}`, () =>
                                adminApi.updateChannel(profile, channel.id, { isVerified: !channel.isVerified })
                              )
                            }
                            type="button"
                          >
                            {channel.isVerified ? "Verifizierung entfernen" : "Verifizieren"}
                          </button>
                          <button
                            className="actionButton quiet"
                            disabled={activeAction === `channel-exclusive-${channel.id}`}
                            onClick={() =>
                              void runAction(`channel-exclusive-${channel.id}`, () =>
                                adminApi.updateChannel(profile, channel.id, { isExclusive: !channel.isExclusive })
                              )
                            }
                            type="button"
                          >
                            {channel.isExclusive ? "Auf offen setzen" : "Exklusiv markieren"}
                          </button>
                          <button
                            className="actionButton quiet"
                            disabled={activeAction === `channel-adult-${channel.id}`}
                            onClick={() =>
                              void runAction(`channel-adult-${channel.id}`, () =>
                                adminApi.updateChannel(profile, channel.id, { isAdultOnly: !channel.isAdultOnly })
                              )
                            }
                            type="button"
                          >
                            {channel.isAdultOnly ? "18+ entfernen" : "18+ setzen"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="emptyState">Keine Channels geladen.</div>
                )}
              </div>
            </article>
          ) : null}

          {canAccess(currentRole, "admin") ? (
            <article className="panel section" id="flags">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Flags</h2>
                  <div className="section-meta">Live feature flags from /admin/feature-flags.</div>
                </div>
                <span className="tag">{data?.featureFlags.filter((flag) => flag.enabled).length ?? 0} aktiv</span>
              </div>
              <div className="card-list">
                {data?.featureFlags.length ? (
                  data.featureFlags.map((flag) => (
                    <div className="list-item" key={flag.id}>
                      <div className="item-top">
                        <div>
                          <h3 className="item-title">{flag.label}</h3>
                          <p className="item-subtitle">
                            {flag.key} • audience: {flag.audience}
                          </p>
                        </div>
                        <span className={`tag ${flag.enabled ? "good" : "warn"}`}>
                          {flag.enabled ? "aktiv" : "inaktiv"}
                        </span>
                      </div>
                      <div className="contentPreview">{flag.description}</div>
                      {canManageFlags ? (
                        <div className="inlineActions">
                          <button
                            className="actionButton"
                            disabled={activeAction === `flag-enabled-${flag.id}`}
                            onClick={() =>
                              void runAction(`flag-enabled-${flag.id}`, () =>
                                adminApi.updateFeatureFlag(profile, flag.id, { enabled: !flag.enabled })
                              )
                            }
                            type="button"
                          >
                            {flag.enabled ? "Deaktivieren" : "Aktivieren"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="emptyState">Keine Feature Flags vorhanden.</div>
                )}
              </div>
            </article>
          ) : null}

          {canAccess(currentRole, "owner") ? (
            <article className="panel section" id="roles">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Rollenverwaltung</h2>
                  <div className="section-meta">Owner-only Backoffice-User aus /admin/backoffice/users.</div>
                </div>
                <div className="tag-row noMargin">
                  <span className="tag good">{activeBackofficeUsers} aktiv</span>
                  <span className={`tag ${disabledBackofficeUsers ? "warn" : "good"}`}>{disabledBackofficeUsers} deaktiviert</span>
                </div>
              </div>
              <div className="card-list">
                {backofficeUsers.length ? (
                  backofficeUsers.map((user) => {
                    const isCurrentUser = user.id === currentActorId;
                    return (
                      <div className="list-item" key={user.id}>
                        <div className="item-top">
                          <div>
                            <h3 className="item-title">{user.displayName}</h3>
                            <p className="item-subtitle">
                              {user.id} • zuletzt {formatTime(user.lastSeenAt)}
                            </p>
                          </div>
                          <span className={`tag ${user.status === "active" ? "good" : "warn"}`}>
                            {user.status === "active" ? "aktiv" : "deaktiviert"}
                          </span>
                        </div>
                        <div className="tag-row">
                          <span className="tag">{user.role}</span>
                          <span className="auditContextChip quiet">{user.activeSessionCount} aktive Sessions</span>
                          <span className="auditContextChip quiet">{user.revokedSessionCount} widerrufen</span>
                          {isCurrentUser ? <span className="auditContextChip account">aktuelle Session</span> : null}
                        </div>
                        <div className="contentPreview">
                          <div className="contentPreviewHead">
                            <div>
                              <h4 className="contentPreviewTitle">Berechtigungen</h4>
                              <p className="contentPreviewSubtitle">{user.permissions.sections.join(", ")}</p>
                            </div>
                            <span className="tag">{user.permissions.actions.length} Aktionen</span>
                          </div>
                          <div className="tag-row">
                            {user.sessions.length ? (
                              user.sessions.map((operatorSession) => (
                                <span
                                  className={`auditContextChip ${operatorSession.status === "active" ? "account" : "quiet"}`}
                                  key={operatorSession.id}
                                >
                                  {operatorSession.status} • {formatTime(operatorSession.lastSeenAt)}
                                </span>
                              ))
                            ) : (
                              <span className="auditContextChip quiet">keine Sessions</span>
                            )}
                          </div>
                        </div>
                        <div className="inlineActions">
                          <select
                            className="controlInput inlineSelect"
                            disabled={isCurrentUser || activeAction === `role-${user.id}`}
                            onChange={(event) => {
                              const nextRole = event.target.value as BackofficeRole;
                              if (nextRole === user.role) {
                                return;
                              }

                              void runAction(`role-${user.id}`, () =>
                                adminApi.updateBackofficeUser(profile, user.id, {
                                  note: `Role changed from ${user.role} to ${nextRole}`,
                                  role: nextRole,
                                })
                              );
                            }}
                            value={user.role}
                          >
                            {backofficeRoleOptions.map((roleOption) => (
                              <option key={roleOption} value={roleOption}>
                                {roleOption}
                              </option>
                            ))}
                          </select>
                          <button
                            className={`actionButton ${user.status === "active" ? "danger" : "quiet"}`}
                            disabled={isCurrentUser || activeAction === `status-${user.id}`}
                            onClick={() =>
                              void runAction(`status-${user.id}`, () =>
                                adminApi.updateBackofficeUser(profile, user.id, {
                                  disabled: user.status === "active",
                                  note: user.status === "active" ? "Owner disabled backoffice user" : "Owner enabled backoffice user",
                                })
                              )
                            }
                            type="button"
                          >
                            {user.status === "active" ? "Deaktivieren" : "Aktivieren"}
                          </button>
                          <button
                            className="actionButton quiet"
                            disabled={user.activeSessionCount < 1 || isCurrentUser || activeAction === `sessions-${user.id}`}
                            onClick={() =>
                              void runAction(`sessions-${user.id}`, () =>
                                adminApi.updateBackofficeUser(profile, user.id, {
                                  note: "Owner revoked active backoffice sessions",
                                  revokeSessions: true,
                                })
                              )
                            }
                            type="button"
                          >
                            Sessions widerrufen
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="emptyState">Noch keine Backoffice-User in dieser Runtime.</div>
                )}
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <p className="footer-note">
        Live admin UI only. Existing API endpoints are now the primary data source; sections without API support remain
        explicitly gated placeholders instead of shared mock data.
      </p>
    </main>
  );
}

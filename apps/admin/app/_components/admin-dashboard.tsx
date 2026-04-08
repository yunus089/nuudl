"use client";

import { useEffect, useMemo, useState } from "react";
import type { CreatorApplication, LedgerEntry } from "@veil/shared";
import { adminApi } from "../_lib/admin-api";
import type {
  AdminDataBundle,
  AdminModerationCaseItem,
  AdminNavSection,
  AdminReportItem,
  BackofficeProfile,
  BackofficeRole,
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

const auditContextLabel = (context: {
  accountDisplayName: string | null;
  accountId: string | null;
  accountUsername: string | null;
  installIdentityId: string | null;
  installLabel: string | null;
}) => {
  const accountPart = context.accountUsername
    ? `${context.accountDisplayName ?? context.accountUsername} @${context.accountUsername}`
    : context.accountDisplayName ?? null;
  const installPart = context.installIdentityId ? context.installLabel ?? context.installIdentityId : null;

  if (accountPart && installPart) {
    return `${accountPart} • ${installPart}`;
  }

  return accountPart ?? installPart ?? "ohne Kontext";
};

const relatedAuditContextsLabel = (
  contexts:
    | Array<{
        accountDisplayName: string | null;
        accountId: string | null;
        accountUsername: string | null;
        installIdentityId: string | null;
        installLabel: string | null;
      }>
    | undefined,
) => {
  if (!contexts?.length) {
    return null;
  }

  return contexts.map((context) => auditContextLabel(context)).join(" • ");
};

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
  const [data, setData] = useState<AdminDataBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [selectedRestrictions, setSelectedRestrictions] = useState<Record<string, RestrictionType>>({});

  const loadDashboard = async (nextProfile: BackofficeProfile) => {
    setLoading(true);
    setError(null);

    try {
      const nextData = await adminApi.loadDashboard(nextProfile);
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

  const visibleSections = useMemo(
    () => navSections.filter((section) => canAccess(profile.role, section.minRole)),
    [profile.role]
  );

  const summary = data?.overview.counts;
  const creatorApplication = data?.creatorApplications[0] ?? null;
  const creatorWallet = creatorApplication ? data?.wallets[creatorApplication.installIdentityId] : null;
  const creatorPendingCents = creatorWallet?.pendingCents ?? 0;
  const securityCounts = data?.security.counts;
  const ops = data?.ops.ops;
  const canManageSecurity = canAccess(profile.role, "admin");
  const getSelectedRestriction = (installIdentityId: string) => selectedRestrictions[installIdentityId] ?? "posting_block";

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-top">
          <div>
            <div className="eyebrow">Admin Backoffice</div>
            <h1 className="title">Live operations for moderation, creator review, payouts, and audit.</h1>
            <p className="subtitle">
              This view now reads from the existing API surface instead of shared mock data and applies a local
              backoffice role model for UI gating.
            </p>
          </div>
          <div className="hero-badges">
            <span className="pill">Phase A</span>
            <span className="pill">Live API reads</span>
            <span className="pill">Role-aware UI</span>
          </div>
        </div>

        <div className="toolbar">
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
          <div className="controlGroup">
            <span className="controlLabel">Aktiver Actor</span>
            <div className="actorPill">
              {profile.label} <span className="actorMeta">{profile.id}</span>
            </div>
          </div>
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
              <span className="tag good">{profile.label}</span>
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
              <span className={`tag ${ops?.storage.snapshotFile.exists ? "good" : "warn"}`}>
                {ops?.storage.snapshotFile.exists ? "Snapshot aktiv" : "Kein Snapshot"}
              </span>
            </div>
            <div className="metrics">
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
                  {profile.role === "moderator"
                    ? "Moderators get a limited recent audit view."
                    : "Admins and owners get the full live audit stream."}
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
                <div className="timeline">
                  {(profile.role === "moderator" ? data?.auditLogs.slice(0, 8) : data?.auditLogs)?.map((entry) => (
                    <div className="timeline-row" key={entry.id}>
                      <div className="timeline-marker" />
                      <div className="timeline-card">
                        <div className="timeline-top">
                          <span className="timeline-kind">{entry.action}</span>
                          <span className="timeline-time">{formatTime(entry.createdAt)}</span>
                        </div>
                        <h3 className="item-title">{entry.actorType === "admin" ? "Backoffice action" : "System event"}</h3>
                        <p className="item-subtitle">{`${entry.entityType} ${entry.entityId}`}</p>
                        <div className="contentPreviewMeta">Actor: {auditContextLabel(entry.actorContext)}</div>
                        <div className="contentPreviewMeta">Target: {auditContextLabel(entry.targetContext)}</div>
                        {relatedAuditContextsLabel(entry.relatedTargetContexts) ? (
                          <div className="contentPreviewMeta">Weitere Beteiligte: {relatedAuditContextsLabel(entry.relatedTargetContexts)}</div>
                        ) : null}
                      </div>
                    </div>
                  )) ?? <div className="emptyState">Keine Audit-Events vorhanden.</div>}
                </div>
              </div>
              <div className="detail-card">
                <div className="section-head compact">
                  <div>
                    <h3 className="section-title">Backoffice-Aktionen</h3>
                    <div className="section-meta">Wer im Backoffice was auf welchem Ziel ausgelöst hat.</div>
                  </div>
                </div>
                <div className="card-list">
                  {(profile.role === "moderator" ? data?.backofficeActions.slice(0, 8) : data?.backofficeActions)?.length ? (
                    (profile.role === "moderator" ? data?.backofficeActions.slice(0, 8) : data?.backofficeActions)?.map((entry) => (
                      <div className="list-item compactItem" key={entry.id}>
                        <div className="item-top">
                          <div>
                            <h4 className="item-title">{entry.action}</h4>
                            <p className="item-subtitle">{`${entry.entityType} ${entry.entityId}`}</p>
                          </div>
                          <span className="tag">{entry.actorRole}</span>
                        </div>
                        <div className="contentPreviewMeta">Actor: {entry.actorId}</div>
                        <div className="contentPreviewMeta">Target: {auditContextLabel(entry.targetContext)}</div>
                        {relatedAuditContextsLabel(entry.relatedTargetContexts) ? (
                          <div className="contentPreviewMeta">Weitere Beteiligte: {relatedAuditContextsLabel(entry.relatedTargetContexts)}</div>
                        ) : null}
                        <div className="contentPreviewMeta">{formatTime(entry.createdAt)}</div>
                      </div>
                    ))
                  ) : (
                    <div className="emptyState">Keine Backoffice-Aktionen vorhanden.</div>
                  )}
                </div>
              </div>
            </div>
          </article>

          {canAccess(profile.role, "admin") ? (
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

          {canAccess(profile.role, "admin") ? (
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

          {canAccess(profile.role, "admin") ? (
            <article className="panel section" id="channels">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Channels</h2>
                  <div className="section-meta">Role-gated placeholder until a dedicated admin channel endpoint ships.</div>
                </div>
              </div>
              <div className="mutedBox">
                Channels and channel verification are intentionally gated to admin and owner. This UI placeholder is
                ready for the next API slice without depending on shared mock data.
              </div>
            </article>
          ) : null}

          {canAccess(profile.role, "admin") ? (
            <article className="panel section" id="flags">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Flags</h2>
                  <div className="section-meta">Phase A UI gate for release and policy controls.</div>
                </div>
              </div>
              <div className="mutedBox">
                Feature flags are reserved for admin and owner. The API surface for live flag reads is still pending, so
                this section stays production-like without inventing client-side mock state.
              </div>
            </article>
          ) : null}

          {canAccess(profile.role, "owner") ? (
            <article className="panel section" id="roles">
              <div className="section-head">
                <div>
                  <h2 className="section-title">Rollenverwaltung</h2>
                  <div className="section-meta">Owner-only placeholder for the upcoming backoffice identity layer.</div>
                </div>
                <span className="tag good">Owner only</span>
              </div>
              <div className="mutedBox">
                Phase A introduces the owner/admin/moderator model in the UI. The next step is a real backoffice user
                store and permission API behind this placeholder.
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

"use client";

import type {
  AdminAuditLogsResponse,
  AdminBackofficeUsersResponse,
  AdminChannelsResponse,
  AdminCreatorApplicationsResponse,
  AdminDataBundle,
  AdminFeatureFlagsResponse,
  AdminLedgerResponse,
  AdminOpsResponse,
  AdminOverviewResponse,
  AdminReportsResponse,
  RestrictionType,
  AdminSecurityResponse,
  BackofficeProfile,
  BackofficeSessionResponse,
} from "./admin-types";

const PROXY_ROOT = "/api/backoffice";

const parseError = async (response: Response) => {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Request failed with status ${response.status}.`;
  } catch {
    return `Request failed with status ${response.status}.`;
  }
};

const buildHeaders = (profile: BackofficeProfile, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  headers.set("x-backoffice-id", profile.id);
  headers.set("x-backoffice-role", profile.role);
  headers.set("x-admin-id", profile.id);
  headers.set("x-admin-role", profile.role);

  if (init?.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
};

async function fetchJson<T>(root: string, path: string, profile: BackofficeProfile, init?: RequestInit): Promise<T> {
  const response = await fetch(`${root}${path}`, {
    ...init,
    headers: buildHeaders(profile, init),
    cache: "no-store",
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

async function requestJson<T>(path: string, profile: BackofficeProfile, init?: RequestInit): Promise<T> {
  return fetchJson<T>(PROXY_ROOT, path, profile, init);
}

export const adminApi = {
  getSession(profile: BackofficeProfile): Promise<BackofficeSessionResponse> {
    return requestJson<BackofficeSessionResponse>("/admin/backoffice/session", profile);
  },

  async loadDashboard(profile: BackofficeProfile, session?: BackofficeSessionResponse): Promise<AdminDataBundle> {
    const actorRole = session?.actor.role ?? profile.role;
    const [
      overview,
      reportsResponse,
      auditResponse,
      creatorResponse,
      ledgerResponse,
      securityResponse,
      opsResponse,
      channelsResponse,
      featureFlagsResponse,
      backofficeUsersResponse,
    ] = await Promise.all([
      requestJson<AdminOverviewResponse>("/admin/overview", profile),
      requestJson<AdminReportsResponse>("/admin/reports", profile),
      requestJson<AdminAuditLogsResponse>("/admin/audit-logs", profile),
      actorRole === "moderator"
        ? Promise.resolve({ applications: [] } satisfies AdminCreatorApplicationsResponse)
        : requestJson<AdminCreatorApplicationsResponse>("/admin/creator-applications", profile),
      actorRole === "moderator"
        ? Promise.resolve({ backofficeActions: [], ledger: [], wallets: {} } satisfies AdminLedgerResponse)
        : requestJson<AdminLedgerResponse>("/admin/ledger", profile),
      requestJson<AdminSecurityResponse>("/admin/security", profile),
      requestJson<AdminOpsResponse>("/admin/ops", profile),
      actorRole === "moderator"
        ? Promise.resolve({ channels: [] } satisfies AdminChannelsResponse)
        : requestJson<AdminChannelsResponse>("/admin/channels", profile),
      actorRole === "moderator"
        ? Promise.resolve({ featureFlags: [] } satisfies AdminFeatureFlagsResponse)
        : requestJson<AdminFeatureFlagsResponse>("/admin/feature-flags", profile),
      actorRole === "owner"
        ? requestJson<AdminBackofficeUsersResponse>("/admin/backoffice/users", profile)
        : Promise.resolve({
            totals: { active: 0, disabled: 0, owners: 0 },
            users: [],
          } satisfies AdminBackofficeUsersResponse),
    ]);

    return {
      auditLogs: auditResponse.auditLogs,
      backofficeActions: auditResponse.backofficeActions,
      backofficeUsers: backofficeUsersResponse.users,
      channels: channelsResponse.channels,
      creatorApplications: creatorResponse.applications,
      featureFlags: featureFlagsResponse.featureFlags,
      ledger: ledgerResponse.ledger,
      moderationCases: reportsResponse.moderationCases,
      moderationCaseItems: reportsResponse.moderationCaseItems,
      ops: opsResponse,
      overview,
      reports: reportsResponse.reports,
      reportItems: reportsResponse.reportItems,
      security: securityResponse,
      wallets: ledgerResponse.wallets,
    };
  },

  moderateCase(profile: BackofficeProfile, body: { action: "block" | "flag" | "restore" | "dismiss"; caseId: string; note?: string }) {
    return requestJson("/admin/moderation/actions", profile, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  reviewCreator(profile: BackofficeProfile, body: { action: "approve" | "reject"; applicationId: string; note?: string }) {
    return requestJson("/admin/creator-approvals", profile, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  createPayout(profile: BackofficeProfile, body: { amountCents: number; applicationId: string }) {
    return requestJson("/admin/payouts", profile, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  updateSecurityRestriction(
    profile: BackofficeProfile,
    body: {
      action: "apply" | "clear";
      durationMinutes?: number;
      installIdentityId: string;
      note?: string;
      type?: RestrictionType;
    }
  ) {
    return requestJson("/admin/security/restrictions", profile, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  updateChannel(
    profile: BackofficeProfile,
    channelId: string,
    body: {
      description?: string;
      isAdultOnly?: boolean;
      isExclusive?: boolean;
      isVerified?: boolean;
      memberCount?: number;
      title?: string;
    }
  ) {
    return requestJson(`/admin/channels/${encodeURIComponent(channelId)}`, profile, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  updateFeatureFlag(
    profile: BackofficeProfile,
    flagId: string,
    body: {
      audience?: "all" | "plus" | "creators" | "admins";
      description?: string;
      enabled?: boolean;
      label?: string;
    }
  ) {
    return requestJson(`/admin/feature-flags/${encodeURIComponent(flagId)}`, profile, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  updateBackofficeUser(
    profile: BackofficeProfile,
    userId: string,
    body: {
      disabled?: boolean;
      displayName?: string;
      note?: string;
      revokeSessions?: boolean;
      role?: BackofficeProfile["role"];
    }
  ) {
    return requestJson(`/admin/backoffice/users/${encodeURIComponent(userId)}`, profile, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
};

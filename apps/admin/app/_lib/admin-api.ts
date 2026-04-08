"use client";

import type {
  AdminAuditLogsResponse,
  AdminCreatorApplicationsResponse,
  AdminDataBundle,
  AdminLedgerResponse,
  AdminOpsResponse,
  AdminOverviewResponse,
  AdminReportsResponse,
  RestrictionType,
  AdminSecurityResponse,
  BackofficeProfile,
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
  async loadDashboard(profile: BackofficeProfile): Promise<AdminDataBundle> {
    const [overview, reportsResponse, auditResponse, creatorResponse, ledgerResponse, securityResponse, opsResponse] = await Promise.all([
      requestJson<AdminOverviewResponse>("/admin/overview", profile),
      requestJson<AdminReportsResponse>("/admin/reports", profile),
      requestJson<AdminAuditLogsResponse>("/admin/audit-logs", profile),
      profile.role === "moderator"
        ? Promise.resolve({ applications: [] } satisfies AdminCreatorApplicationsResponse)
        : requestJson<AdminCreatorApplicationsResponse>("/admin/creator-applications", profile),
      profile.role === "moderator"
        ? Promise.resolve({ ledger: [], wallets: {} } satisfies AdminLedgerResponse)
        : requestJson<AdminLedgerResponse>("/admin/ledger", profile),
      requestJson<AdminSecurityResponse>("/admin/security", profile),
      requestJson<AdminOpsResponse>("/admin/ops", profile),
    ]);

    return {
      auditLogs: auditResponse.auditLogs,
      backofficeActions: auditResponse.backofficeActions,
      creatorApplications: creatorResponse.applications,
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
};

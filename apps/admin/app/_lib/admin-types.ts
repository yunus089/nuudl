import type { AuditLogEntry, CreatorApplication, LedgerEntry, ModerationCase, Report, WalletBalance } from "@veil/shared";

export type RestrictionType = "posting_block" | "reply_block" | "vote_block" | "chat_request_block" | "geo_switch_block" | "read_only";

export type BackofficeRole = "moderator" | "admin" | "owner";

export type AdminOverviewResponse = {
  counts: {
    auditLogs: number;
    blockedContent: number;
    ledgerEntries: number;
    openCases: number;
    posts: number;
    reports: number;
    replies: number;
  };
  wallet: WalletBalance;
};

export type AdminReportsResponse = {
  auditLogs: AuditLogEntry[];
  moderationCases: ModerationCase[];
  moderationCaseItems: AdminModerationCaseItem[];
  reportItems: AdminReportItem[];
  reports: Report[];
};

export type AdminAuditLogItem = AuditLogEntry & {
  actorContext: {
    accountDisplayName: string | null;
    accountId: string | null;
    accountUsername: string | null;
    installIdentityId: string | null;
    installLabel: string | null;
  };
  targetContext: {
    accountDisplayName: string | null;
    accountId: string | null;
    accountUsername: string | null;
    installIdentityId: string | null;
    installLabel: string | null;
  };
  relatedTargetContexts?: Array<{
    accountDisplayName: string | null;
    accountId: string | null;
    accountUsername: string | null;
    installIdentityId: string | null;
    installLabel: string | null;
  }>;
};

export type AdminBackofficeActionItem = {
  id: string;
  actorId: string;
  actorRole: BackofficeRole;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  actorContext: AdminAuditLogItem["actorContext"];
  targetContext: AdminAuditLogItem["targetContext"];
  relatedTargetContexts?: AdminAuditLogItem["relatedTargetContexts"];
};

export type AdminTargetPreview = {
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

export type AdminReportItem = {
  moderationCase: ModerationCase | null;
  report: Report;
  targetPreview: AdminTargetPreview;
};

export type AdminModerationCaseItem = {
  caseItem: ModerationCase;
  linkedReports: Report[];
  targetPreview: AdminTargetPreview;
};

export type AdminAuditLogsResponse = {
  auditLogs: AdminAuditLogItem[];
  backofficeActions: AdminBackofficeActionItem[];
};

export type AdminCreatorApplicationsResponse = {
  applications: CreatorApplication[];
};

export type AdminLedgerResponse = {
  ledger: LedgerEntry[];
  wallets: Record<string, WalletBalance>;
};

export type AdminSecurityResponse = {
  counts: {
    abuseEvents: number;
    activeRestrictions: number;
    flaggedInstalls: number;
    restrictedInstalls: number;
  };
  activeRestrictions: Array<{
    endsAt: string;
    id: string;
    installIdentityId: string;
    reasonCode: string;
    startsAt: string;
    triggerSource: string;
    type: RestrictionType;
  }>;
  recentAbuseEvents: Array<{
    createdAt: string;
    id: string;
    installIdentityId?: string;
    ipHash?: string;
    kind: string;
    routeName: string;
  }>;
  riskStates: Array<{
    flaggedAt?: string;
    installIdentityId: string;
    lastUpdatedAt: string;
    restrictedAt?: string;
    score: number;
  }>;
};

export type AdminOpsResponse = {
  ops: {
    counts: {
      abuseEvents: number;
      activeRestrictions: number;
      chatMessages: number;
      chatRequests: number;
      idempotencyKeys: number;
      installSessions: number;
      ledgerEntries: number;
      moderationCases: number;
      posts: number;
      refreshTokens: number;
      replies: number;
      reports: number;
      uploads: number;
    };
    recent: {
      lastAbuseEventAt?: string;
      lastAuditAt?: string;
      lastBackofficeActionAt?: string;
    };
    runtime: {
      environment: string;
      logLevel: string;
      nodeVersion: string;
      now: string;
      pid: number;
      startedAt: string;
      timestamp: string;
      uptimeSeconds: number;
    };
    storage: {
      snapshotFile: {
        exists: boolean;
        path: string;
        sizeBytes: number;
        updatedAt: string | null;
      };
      uploadsDirectory: {
        exists: boolean;
        fileCount: number;
        path: string;
        totalBytes: number;
        updatedAt: string | null;
      };
    };
    legacy: {
      auditLogs: number;
      backofficeActions: number;
      openModerationCases: number;
      rateLimitCounters: number;
    };
  };
};

export type AdminDataBundle = {
  auditLogs: AdminAuditLogItem[];
  backofficeActions: AdminBackofficeActionItem[];
  creatorApplications: CreatorApplication[];
  ledger: LedgerEntry[];
  moderationCases: ModerationCase[];
  moderationCaseItems: AdminModerationCaseItem[];
  ops: AdminOpsResponse;
  overview: AdminOverviewResponse;
  reports: Report[];
  reportItems: AdminReportItem[];
  security: AdminSecurityResponse;
  wallets: Record<string, WalletBalance>;
};

export type BackofficeProfile = {
  id: string;
  label: string;
  role: BackofficeRole;
};

export type AdminNavSection = {
  id: string;
  label: string;
  minRole: BackofficeRole;
};

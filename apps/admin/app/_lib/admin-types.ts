import type {
  AuditLogEntry,
  Channel,
  CreatorApplication,
  FeatureFlag,
  LedgerEntry,
  ModerationCase,
  Report,
  WalletBalance,
} from "@veil/shared";

export type RestrictionType = "posting_block" | "reply_block" | "vote_block" | "chat_request_block" | "geo_switch_block" | "read_only";

export type BackofficeRole = "moderator" | "admin" | "owner";
export type BackofficeSessionAuthMode = "loopback_dev_headers" | "trusted_proxy" | "trusted_proxy_session";

export type AdminOverviewResponse = {
  counts: {
    auditLogs: number;
    backofficeActions: number;
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
  backofficeActions: AdminBackofficeActionItem[];
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
  backofficeActions: AdminBackofficeActionItem[];
  ledger: LedgerEntry[];
  wallets: Record<string, WalletBalance>;
};

export type AdminChannelItem = Channel & {
  cityLabel: string;
  openReportCount: number;
  postCount: number;
};

export type AdminChannelsResponse = {
  channels: AdminChannelItem[];
};

export type AdminFeatureFlagsResponse = {
  featureFlags: FeatureFlag[];
};

export type AdminBackofficeUserItem = BackofficeSessionUser & {
  activeSessionCount: number;
  permissions: {
    actions: string[];
    sections: string[];
  };
  revokedSessionCount: number;
  sessions: Array<BackofficeSessionInstance & {
    revokedAt?: string;
    revocationReason?: string;
  }>;
  status: "active" | "disabled";
};

export type AdminBackofficeUsersResponse = {
  users: AdminBackofficeUserItem[];
  totals: {
    active: number;
    disabled: number;
    owners: number;
  };
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
    beta: {
      checks: Array<{
        detail: string;
        id: string;
        label: string;
        ok: boolean;
        severity: "error" | "warning";
      }>;
      contentCounts: {
        chatMessages: number;
        chatRequests: number;
        ledgerEntries: number;
        moderationCases: number;
        notifications: number;
        posts: number;
        reports: number;
        replies: number;
        tips: number;
        uploads: number;
        walletTopups: number;
      };
      env: {
        allowFakePayments: boolean;
        allowLocalFallbacks: boolean;
        betaInviteCodeCount: number;
        betaInviteRequired: boolean;
        seedProfile: "clean" | "demo";
      };
      mutableRecordCount: number;
      status: "blocked" | "ready" | "warning";
    };
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
      persistence: {
        activeDriver: "snapshot_file" | "postgres_snapshot";
        requestedDriver: "snapshot_file" | "postgres_snapshot" | "postgres" | "unknown";
        supportedDrivers: Array<"snapshot_file" | "postgres_snapshot">;
        database:
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
        redis:
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
        schemaDraftPath: string;
        postgresRuntime: {
          configured: boolean;
          normalizedRepositoryLayerImplemented: boolean;
          normalizedMirror: {
            enabled: boolean;
            lastError?: string;
            mode: string;
            ready: boolean;
            status: string;
          };
          normalizedReadOverlay: {
            enabled: boolean;
            lastError?: string;
            mode: string;
            ready: boolean;
            status: string;
          };
          ready: boolean;
          snapshotAdapterImplemented: boolean;
          snapshotReady: boolean;
          status: string;
        };
        migrationRequired: boolean;
        warning: string;
        nextSteps: string[];
      };
      snapshotFile: {
        exists: boolean;
        path: string;
        sizeBytes: number;
        updatedAt: string | null;
      };
      uploadsDirectory: {
        defaultPath: string;
        exists: boolean;
        fileCount: number;
        maxUploadBytes: number;
        path: string;
        pathSource: "default" | "env";
        publicBaseUrl: string | null;
        totalBytes: number;
        updatedAt: string | null;
        urlStrategy: "configured_base_url" | "request_headers";
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
  backofficeUsers: AdminBackofficeUserItem[];
  creatorApplications: CreatorApplication[];
  channels: AdminChannelItem[];
  featureFlags: FeatureFlag[];
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

export type BackofficeSessionActor = {
  authMode: BackofficeSessionAuthMode;
  id: string;
  role: BackofficeRole;
};

export type BackofficeSessionUser = {
  createdAt: string;
  disabledAt?: string;
  displayName: string;
  id: string;
  lastSeenAt: string;
  role: BackofficeRole;
};

export type BackofficeSessionInstance = {
  authMode: BackofficeSessionAuthMode;
  createdAt: string;
  id: string;
  lastSeenAt: string;
  roleAtIssue: BackofficeRole;
  status: "active" | "revoked";
};

export type BackofficeSessionResponse = {
  actor: BackofficeSessionActor;
  authMode: BackofficeSessionAuthMode;
  expectedHeaders: {
    adminId: string;
    adminRole: string;
    backofficeSessionId: string;
    trustedProxySecret: string;
  };
  permissions: {
    actions: string[];
    sections: string[];
  };
  roleLevel: number;
  session: BackofficeSessionInstance;
  user: BackofficeSessionUser;
};

export type AdminNavSection = {
  id: string;
  label: string;
  minRole: BackofficeRole;
};

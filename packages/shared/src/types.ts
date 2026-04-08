export type SortMode = "new" | "commented" | "loud";
export type TargetType = "post" | "reply";
export type ModerationState = "visible" | "flagged" | "blocked";
export type CreatorStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected";
export type LedgerStatus = "pending" | "available" | "paid_out";
export type ReportStatus = "open" | "reviewed" | "actioned" | "dismissed";
export type PayoutStatus = "queued" | "processing" | "paid" | "failed" | "held";

export type PlusEntitlement = {
  active: boolean;
  explorer: boolean;
  imageChat: boolean;
  noAds: boolean;
  weeklyBoosts: number;
  weeklyColorDrops: number;
};

export type InstallIdentity = {
  id: string;
  installKey: string;
  accessToken: string;
  accountId?: string;
  accountUsername?: string;
  accountDisplayName?: string;
  discoverable?: boolean;
  cityId: string;
  cityLabel: string;
  adultGateAccepted: boolean;
  adultVerified: boolean;
  plus: PlusEntitlement;
  createdAt: string;
};

export type Account = {
  id: string;
  username: string;
  emailNormalized: string;
  emailVerifiedAt: string | null;
  discoverable: boolean;
  createdAt: string;
  lastSeenAt: string;
};

export type AccountChannelPreferences = {
  accountId: string;
  cityId: string;
  favoriteChannelIds: string[];
  joinedChannelIds: string[];
  recentChannelIds: string[];
  updatedAt: string;
};

export type AccountProfile = {
  accountId: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  isCreator: boolean;
};

export type AccountLink = {
  accountId: string;
  installIdentityId: string;
  linkedAt: string;
  unlinkedAt: string | null;
};

export type AccountSession = {
  id: string;
  accountId: string;
  installIdentityId: string;
  status: "active" | "revoked";
  createdAt: string;
  lastSeenAt: string;
};

export type AccountMe = {
  account: Account;
  profile: AccountProfile;
  link: AccountLink | null;
  session: AccountSession | null;
  channelPreferences?: AccountChannelPreferences | null;
};

export type LoginCodeStartResponse = {
  delivery: "email";
  maskedEmail: string;
  expiresAt: string;
};

export type LoginCodeVerifyResponse = {
  account: Account;
  profile: AccountProfile;
  session: AccountSession;
};

export type CityContext = {
  id: string;
  slug: string;
  label: string;
  countryCode: "DE" | "AT" | "CH";
  lat: number;
  lng: number;
  isExplorerEnabled: boolean;
};

export type Channel = {
  id: string;
  slug: string;
  title: string;
  description: string;
  cityId: string;
  memberCount: number;
  isVerified: boolean;
  isExclusive: boolean;
  isAdultOnly: boolean;
  joined: boolean;
};

export type MediaAsset = {
  id: string;
  kind: "image";
  url: string;
};

export type Post = {
  id: string;
  cityId: string;
  channelId: string | null;
  recipientInstallIdentityId?: string;
  accountId?: string;
  accountUsername?: string;
  accountDisplayName?: string;
  body: string;
  authorLabel: string;
  score: number;
  replyCount: number;
  createdAt: string;
  tags: string[];
  media: MediaAsset[];
  tipTotalCents: number;
  canTip: boolean;
  isPinned: boolean;
  moderation: ModerationState;
};

export type Reply = {
  id: string;
  postId: string;
  recipientInstallIdentityId?: string;
  accountId?: string;
  accountUsername?: string;
  accountDisplayName?: string;
  body: string;
  authorLabel: string;
  score: number;
  createdAt: string;
  tipTotalCents: number;
  canTip: boolean;
  moderation: ModerationState;
};

export type VoteState = {
  accountId?: string;
  actorKey?: string;
  installIdentityId?: string;
  targetId: string;
  targetType: TargetType;
  value: -1 | 0 | 1;
  aggregateScore: number;
};

export type WalletBalance = {
  currency: "EUR";
  availableCents: number;
  pendingCents: number;
  lifetimeTippedCents: number;
  lifetimeEarnedCents: number;
  lifetimePaidOutCents: number;
};

export type LedgerEntry = {
  id: string;
  installIdentityId: string;
  accountId?: string;
  kind: "topup" | "tip_out" | "tip_in" | "platform_fee" | "plus_purchase" | "payout";
  status: LedgerStatus;
  grossCents: number;
  platformFeeCents: number;
  netCents: number;
  refType: string;
  refId: string;
  createdAt: string;
};

export type Tip = {
  id: string;
  senderInstallIdentityId: string;
  recipientInstallIdentityId: string;
  recipientAccountId?: string;
  senderAccountId?: string;
  targetType: TargetType;
  targetId: string;
  grossCents: number;
  platformFeeCents: number;
  creatorNetCents: number;
  status: LedgerStatus;
  createdAt: string;
};

export type CreatorApplication = {
  id: string;
  installIdentityId: string;
  accountId?: string;
  accountUsername?: string;
  accountDisplayName?: string;
  status: CreatorStatus;
  adultVerified: boolean;
  kycState: "not_started" | "pending" | "verified";
  payoutState: "not_ready" | "ready" | "paused";
  submittedAt: string | null;
};

export type ModerationCase = {
  id: string;
  cityId: string;
  targetType: "post" | "reply" | "chat" | "user" | "channel";
  targetId: string;
  accountId?: string;
  reason: string;
  status: "open" | "reviewed" | "actioned";
  createdAt: string;
};

export type Report = {
  id: string;
  cityId: string;
  reporterInstallIdentityId: string;
  accountId?: string;
  targetType: ModerationCase["targetType"];
  targetId: string;
  reason: string;
  status: ReportStatus;
  moderationCaseId: string;
  createdAt: string;
  updatedAt: string;
};

export type ModerationAction = {
  id: string;
  moderationCaseId: string;
  actorId: string;
  actorLabel: string;
  action:
    | "dismiss"
    | "hide_content"
    | "block_content"
    | "warn_user"
    | "restrict_user"
    | "approve_creator"
    | "reject_creator"
    | "pause_payouts"
    | "verify_channel";
  note: string;
  createdAt: string;
};

export type AuditLogEntry = {
  id: string;
  actorType: "install" | "admin" | "system";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type NotificationItem = {
  id: string;
  kind: "reply" | "vote" | "tip" | "chat_request" | "system" | "moderation";
  message: string;
  accountId?: string;
  installIdentityId?: string;
  createdAt: string;
  read: boolean;
  targetRoute?: string;
};

export type SearchResults = {
  accounts?: AccountSearchResult[];
  accountPreferences?: AccountChannelPreferences | null;
  channels: Channel[];
  hashtags: string[];
  posts: Post[];
};

export type AccountSearchResult = {
  accountId: string;
  username: string;
  displayName: string;
  discoverable: boolean;
  isCreator: boolean;
  cityId?: string;
  cityLabel?: string;
};

export type ChatRequest = {
  id: string;
  fromAccountId?: string;
  fromInstallIdentityId: string;
  toAccountId?: string;
  toInstallIdentityId: string;
  postId: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  counterpartLabel?: string;
  lastActivityAt?: string;
  lastMessageAt?: string;
  lastMessageOwn?: boolean;
  lastMessagePreview?: string;
  unreadCount?: number;
};

export type ChatMessage = {
  id: string;
  chatRequestId: string;
  senderInstallIdentityId: string;
  accountId?: string;
  body: string;
  media: MediaAsset[];
  createdAt: string;
  readAt: string | null;
};

export type CreatorReview = {
  id: string;
  creatorApplicationId: string;
  reviewerId: string;
  decision: "approve" | "reject" | "request_changes";
  note: string;
  createdAt: string;
};

export type PayoutAccount = {
  id: string;
  installIdentityId: string;
  accountId?: string;
  provider: "manual" | "adult_psp";
  label: string;
  state: "draft" | "review_required" | "ready" | "paused";
  lastCheckedAt: string | null;
};

export type Payout = {
  id: string;
  installIdentityId: string;
  accountId?: string;
  payoutAccountId: string;
  status: PayoutStatus;
  grossCents: number;
  feeCents: number;
  netCents: number;
  requestedAt: string;
  settledAt: string | null;
};

export type WalletTopup = {
  id: string;
  installIdentityId: string;
  accountId?: string;
  provider: "fake" | "stripe";
  status: "pending" | "succeeded" | "failed";
  grossCents: number;
  createdAt: string;
};

export type FeatureFlag = {
  id: string;
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  audience: "all" | "plus" | "creators" | "admins";
};

export type PlusProduct = {
  id: string;
  title: string;
  priceCents: number;
  billingPeriod: "month";
  features: string[];
};

export type CityHealthSnapshot = {
  cityId: string;
  livePosts: number;
  openReports: number;
  activeCreators: number;
  walletVolumeCents: number;
};

export type SeedState = {
  cities: CityContext[];
  installIdentity: InstallIdentity;
  accounts?: Account[];
  accountProfiles?: AccountProfile[];
  accountLinks?: AccountLink[];
  accountSessions?: AccountSession[];
  channels: Channel[];
  posts: Post[];
  replies: Reply[];
  notifications: NotificationItem[];
  wallet: WalletBalance;
  ledger: LedgerEntry[];
  tips: Tip[];
  creatorApplication: CreatorApplication;
  moderationCases: ModerationCase[];
  reports: Report[];
  moderationActions: ModerationAction[];
  auditTrail: AuditLogEntry[];
  chatRequests: ChatRequest[];
  chatMessages: ChatMessage[];
  creatorReviews: CreatorReview[];
  payoutAccounts: PayoutAccount[];
  payouts: Payout[];
  walletTopups: WalletTopup[];
  featureFlags: FeatureFlag[];
  plusProducts: PlusProduct[];
  cityHealth: CityHealthSnapshot[];
};

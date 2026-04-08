import type {
  AuditLogEntry,
  Channel,
  CityHealthSnapshot,
  ChatMessage,
  ChatRequest,
  CityContext,
  CreatorApplication,
  CreatorReview,
  FeatureFlag,
  InstallIdentity,
  LedgerEntry,
  ModerationCase,
  ModerationAction,
  NotificationItem,
  Payout,
  PayoutAccount,
  PlusEntitlement,
  PlusProduct,
  Post,
  Report,
  Reply,
  SeedState,
  Tip,
  WalletBalance,
  WalletTopup,
} from "./types";

const plusDefault: PlusEntitlement = {
  active: true,
  explorer: true,
  imageChat: true,
  noAds: true,
  weeklyBoosts: 3,
  weeklyColorDrops: 3,
};

export const cities: CityContext[] = [
  {
    id: "city-munich",
    slug: "muenchen",
    label: "Muenchen",
    countryCode: "DE",
    lat: 48.137154,
    lng: 11.576124,
    isExplorerEnabled: true,
  },
  {
    id: "city-vienna",
    slug: "wien",
    label: "Wien",
    countryCode: "AT",
    lat: 48.208174,
    lng: 16.373819,
    isExplorerEnabled: true,
  },
  {
    id: "city-zurich",
    slug: "zuerich",
    label: "Zuerich",
    countryCode: "CH",
    lat: 47.376888,
    lng: 8.541694,
    isExplorerEnabled: true,
  },
];

export const installIdentity: InstallIdentity = {
  id: "install-001",
  installKey: "install-demo-001",
  accessToken: "nuudl-demo-token",
  cityId: "city-munich",
  cityLabel: "Muenchen",
  adultGateAccepted: true,
  adultVerified: false,
  plus: plusDefault,
  createdAt: "2026-03-26T12:00:00.000Z",
};

export const channels: Channel[] = [
  {
    id: "channel-main",
    slug: "main",
    title: "Main",
    description: "Open city-wide adult feed",
    cityId: "city-munich",
    memberCount: 9842,
    isVerified: false,
    isExclusive: false,
    isAdultOnly: true,
    joined: true,
  },
  {
    id: "channel-confession",
    slug: "confession",
    title: "Confession",
    description: "Stories and anonymous confessions",
    cityId: "city-munich",
    memberCount: 5280,
    isVerified: false,
    isExclusive: false,
    isAdultOnly: true,
    joined: true,
  },
  {
    id: "channel-verified",
    slug: "creator-news",
    title: "Creator News",
    description: "Verified updates and platform posts",
    cityId: "city-munich",
    memberCount: 1240,
    isVerified: true,
    isExclusive: true,
    isAdultOnly: true,
    joined: true,
  },
];

export const posts: Post[] = [
  {
    id: "post-001",
    cityId: "city-munich",
    channelId: "channel-main",
    recipientInstallIdentityId: "install-creator-017",
    body: "Who is online in Muenchen tonight? Looking for bold stories and honest replies.",
    authorLabel: "Anon 17",
    score: 42,
    replyCount: 9,
    createdAt: "2026-03-26T13:05:00.000Z",
    tags: ["night", "muenchen"],
    media: [],
    tipTotalCents: 1400,
    canTip: true,
    isPinned: false,
    moderation: "visible",
  },
  {
    id: "post-002",
    cityId: "city-munich",
    channelId: "channel-confession",
    recipientInstallIdentityId: "install-creator-002",
    body: "Confession: I earn more from private attention than from my office job.",
    authorLabel: "Anon 04",
    score: 87,
    replyCount: 16,
    createdAt: "2026-03-26T12:12:00.000Z",
    tags: ["creator", "money"],
    media: [
      {
        id: "media-001",
        kind: "image",
        url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=640&q=80",
      },
    ],
    tipTotalCents: 4200,
    canTip: true,
    isPinned: true,
    moderation: "visible",
  },
  {
    id: "post-003",
    cityId: "city-munich",
    channelId: "channel-verified",
    recipientInstallIdentityId: "install-hq-001",
    body: "Platform note: city-only launch is live, explorer remains read-only until adult verification.",
    authorLabel: "NUUDL HQ",
    score: 11,
    replyCount: 2,
    createdAt: "2026-03-26T11:30:00.000Z",
    tags: ["launch", "system"],
    media: [],
    tipTotalCents: 0,
    canTip: false,
    isPinned: true,
    moderation: "visible",
  },
];

export const replies: Reply[] = [
  {
    id: "reply-001",
    postId: "post-001",
    recipientInstallIdentityId: "install-creator-009",
    body: "I am here. Keep it anonymous and direct.",
    authorLabel: "Anon 09",
    score: 5,
    createdAt: "2026-03-26T13:10:00.000Z",
    tipTotalCents: 0,
    canTip: false,
    moderation: "visible",
  },
  {
    id: "reply-002",
    postId: "post-002",
    recipientInstallIdentityId: "install-creator-025",
    body: "This is exactly why creator payouts need proper review and safety checks.",
    authorLabel: "Anon 25",
    score: 12,
    createdAt: "2026-03-26T12:19:00.000Z",
    tipTotalCents: 0,
    canTip: false,
    moderation: "visible",
  },
];

export const notifications: NotificationItem[] = [
  {
    id: "notif-001",
    kind: "reply",
    message: "Anon 09 replied to your post in Main.",
    createdAt: "2026-03-26T13:11:00.000Z",
    read: false,
    targetRoute: "/post/post-001",
  },
  {
    id: "notif-002",
    kind: "tip",
    message: "You received EUR 8.00 in tips on a pinned confession post.",
    createdAt: "2026-03-26T12:40:00.000Z",
    read: false,
    targetRoute: "/post/post-002",
  },
  {
    id: "notif-003",
    kind: "system",
    message: "Complete adult verification to unlock explicit content and explorer mode.",
    createdAt: "2026-03-26T11:00:00.000Z",
    read: true,
    targetRoute: "/me",
  },
];

export const wallet: WalletBalance = {
  currency: "EUR",
  availableCents: 5200,
  pendingCents: 1800,
  lifetimeTippedCents: 6400,
  lifetimeEarnedCents: 18000,
  lifetimePaidOutCents: 8000,
};

export const ledger: LedgerEntry[] = [
  {
    id: "ledger-001",
    installIdentityId: "install-001",
    kind: "topup",
    status: "available",
    grossCents: 2500,
    platformFeeCents: 0,
    netCents: 2500,
    refType: "wallet",
    refId: "topup-001",
    createdAt: "2026-03-25T18:00:00.000Z",
  },
  {
    id: "ledger-002",
    installIdentityId: "install-001",
    kind: "tip_out",
    status: "available",
    grossCents: 800,
    platformFeeCents: 160,
    netCents: 640,
    refType: "post",
    refId: "post-002",
    createdAt: "2026-03-26T12:32:00.000Z",
  },
  {
    id: "ledger-003",
    installIdentityId: "install-creator-002",
    kind: "tip_in",
    status: "pending",
    grossCents: 800,
    platformFeeCents: 160,
    netCents: 640,
    refType: "post",
    refId: "post-002",
    createdAt: "2026-03-26T12:32:00.000Z",
  },
];

export const tips: Tip[] = [
  {
    id: "tip-001",
    senderInstallIdentityId: "install-001",
    recipientInstallIdentityId: "install-creator-002",
    targetType: "post",
    targetId: "post-002",
    grossCents: 800,
    platformFeeCents: 160,
    creatorNetCents: 640,
    status: "pending",
    createdAt: "2026-03-26T12:32:00.000Z",
  },
];

export const creatorApplication: CreatorApplication = {
  id: "creator-app-001",
  installIdentityId: "install-001",
  status: "under_review",
  adultVerified: true,
  kycState: "pending",
  payoutState: "not_ready",
  submittedAt: "2026-03-25T16:00:00.000Z",
};

export const moderationCases: ModerationCase[] = [
  {
    id: "mod-001",
    cityId: "city-munich",
    targetType: "post",
    targetId: "post-002",
    reason: "Manual review for explicit image and payout eligibility",
    status: "open",
    createdAt: "2026-03-26T12:15:00.000Z",
  },
  {
    id: "mod-002",
    cityId: "city-munich",
    targetType: "user",
    targetId: "install-suspicious-003",
    reason: "Spam and repeated chat requests",
    status: "reviewed",
    createdAt: "2026-03-26T09:00:00.000Z",
  },
];

export const reports: Report[] = [
  {
    id: "report-001",
    cityId: "city-munich",
    reporterInstallIdentityId: "install-014",
    targetType: "post",
    targetId: "post-002",
    reason: "Please review whether this post needs extra payout or age-verification checks.",
    status: "reviewed",
    moderationCaseId: "mod-001",
    createdAt: "2026-03-26T12:14:00.000Z",
    updatedAt: "2026-03-26T12:24:00.000Z",
  },
  {
    id: "report-002",
    cityId: "city-munich",
    reporterInstallIdentityId: "install-021",
    targetType: "user",
    targetId: "install-suspicious-003",
    reason: "Repeated unwanted chat requests after being ignored.",
    status: "actioned",
    moderationCaseId: "mod-002",
    createdAt: "2026-03-26T08:51:00.000Z",
    updatedAt: "2026-03-26T09:18:00.000Z",
  },
];

export const moderationActions: ModerationAction[] = [
  {
    id: "mod-action-001",
    moderationCaseId: "mod-001",
    actorId: "admin-01",
    actorLabel: "Ops Desk",
    action: "hide_content",
    note: "Temporarily hidden while creator verification checks complete.",
    createdAt: "2026-03-26T12:25:00.000Z",
  },
  {
    id: "mod-action-002",
    moderationCaseId: "mod-002",
    actorId: "admin-02",
    actorLabel: "Trust & Safety",
    action: "restrict_user",
    note: "Rate limited direct-message requests for 72 hours.",
    createdAt: "2026-03-26T09:17:00.000Z",
  },
];

export const auditTrail: AuditLogEntry[] = [
  {
    id: "audit-001",
    actorType: "admin",
    actorId: "admin-02",
    action: "moderation.restrict_user",
    entityType: "install_identity",
    entityId: "install-suspicious-003",
    summary: "Restricted account due to spammy chat behavior.",
    metadata: {
      source: "report-002",
      durationHours: 72,
    },
    createdAt: "2026-03-26T09:17:30.000Z",
  },
  {
    id: "audit-002",
    actorType: "system",
    actorId: "system",
    action: "wallet.topup_succeeded",
    entityType: "wallet_topup",
    entityId: "topup-001",
    summary: "Fake payment provider marked wallet top-up as successful.",
    metadata: {
      grossCents: 2500,
      provider: "fake",
    },
    createdAt: "2026-03-25T18:00:10.000Z",
  },
];

export const chatRequests: ChatRequest[] = [
  {
    id: "chat-request-001",
    fromInstallIdentityId: "install-001",
    toInstallIdentityId: "install-creator-002",
    postId: "post-002",
    status: "accepted",
    createdAt: "2026-03-26T12:35:00.000Z",
  },
];

export const chatMessages: ChatMessage[] = [
  {
    id: "chat-message-001",
    chatRequestId: "chat-request-001",
    senderInstallIdentityId: "install-001",
    body: "Thanks for the post. Do you offer private image chat tonight?",
    media: [],
    createdAt: "2026-03-26T12:36:00.000Z",
    readAt: "2026-03-26T12:37:10.000Z",
  },
  {
    id: "chat-message-002",
    chatRequestId: "chat-request-001",
    senderInstallIdentityId: "install-creator-002",
    body: "Yes, but image chat is limited to Plus and only after review passes.",
    media: [],
    createdAt: "2026-03-26T12:37:20.000Z",
    readAt: null,
  },
];

export const creatorReviews: CreatorReview[] = [
  {
    id: "creator-review-001",
    creatorApplicationId: "creator-app-001",
    reviewerId: "admin-01",
    decision: "request_changes",
    note: "Need payout account evidence and final age-verification handoff.",
    createdAt: "2026-03-25T17:10:00.000Z",
  },
];

export const payoutAccounts: PayoutAccount[] = [
  {
    id: "payout-account-001",
    installIdentityId: "install-001",
    provider: "manual",
    label: "Manual review account",
    state: "review_required",
    lastCheckedAt: "2026-03-25T17:05:00.000Z",
  },
];

export const payouts: Payout[] = [
  {
    id: "payout-001",
    installIdentityId: "install-creator-002",
    payoutAccountId: "payout-account-001",
    status: "held",
    grossCents: 3200,
    feeCents: 640,
    netCents: 2560,
    requestedAt: "2026-03-26T07:45:00.000Z",
    settledAt: null,
  },
];

export const walletTopups: WalletTopup[] = [
  {
    id: "topup-001",
    installIdentityId: "install-001",
    provider: "fake",
    status: "succeeded",
    grossCents: 2500,
    createdAt: "2026-03-25T18:00:00.000Z",
  },
];

export const featureFlags: FeatureFlag[] = [
  {
    id: "flag-001",
    key: "plus.explorer.read_only",
    label: "Explorer Read Only",
    description: "Allows Plus users to peek into other cities without posting there.",
    enabled: true,
    audience: "plus",
  },
  {
    id: "flag-002",
    key: "chat.image_messages",
    label: "Image Messages",
    description: "Unlocks image messages for entitled users after moderation checks.",
    enabled: true,
    audience: "plus",
  },
  {
    id: "flag-003",
    key: "creators.payouts",
    label: "Creator Payouts",
    description: "Shows payout readiness and manual review state in profile and admin.",
    enabled: true,
    audience: "creators",
  },
];

export const plusProducts: PlusProduct[] = [
  {
    id: "plus-monthly",
    title: "NUUDL Plus Monthly",
    priceCents: 1299,
    billingPeriod: "month",
    features: [
      "Explorer access for other cities",
      "Image chat entitlement",
      "Higher chat request limits",
      "No ads flag",
    ],
  },
];

export const cityHealth: CityHealthSnapshot[] = [
  {
    cityId: "city-munich",
    livePosts: 182,
    openReports: 4,
    activeCreators: 37,
    walletVolumeCents: 248300,
  },
  {
    cityId: "city-vienna",
    livePosts: 96,
    openReports: 2,
    activeCreators: 18,
    walletVolumeCents: 119200,
  },
  {
    cityId: "city-zurich",
    livePosts: 63,
    openReports: 1,
    activeCreators: 12,
    walletVolumeCents: 91400,
  },
];

export const seedState: SeedState = {
  cities,
  installIdentity,
  channels,
  posts,
  replies,
  notifications,
  wallet,
  ledger,
  tips,
  creatorApplication,
  moderationCases,
  reports,
  moderationActions,
  auditTrail,
  chatRequests,
  chatMessages,
  creatorReviews,
  payoutAccounts,
  payouts,
  walletTopups,
  featureFlags,
  plusProducts,
  cityHealth,
};

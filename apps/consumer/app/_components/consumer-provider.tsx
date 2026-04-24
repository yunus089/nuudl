"use client";

import {
  chatMessages as seedChatMessages,
  chatRequests as baseChatRequests,
  channels as seedChannels,
  cities,
  createThreadAnonLabel,
  creatorApplication as seedCreatorApplication,
  creatorReviews as seedCreatorReviews,
  ledger as seedLedger,
  notifications as seedNotifications,
  payoutAccounts as seedPayoutAccounts,
  payouts as seedPayouts,
  posts as seedPosts,
  replies as seedReplies,
  resolveCityFromCoordinates,
  installIdentity as seedIdentity,
  tips as seedTips,
  wallet as seedWallet,
  walletTopups as seedWalletTopups,
} from "@veil/shared";
import type {
  AccountSearchResult,
  AccountChannelPreferences,
  Channel,
  ChatMessage,
  ChatRequest,
  CityContext,
  CreatorApplication,
  CreatorReview,
  LedgerEntry,
  MediaAsset,
  NotificationItem,
  Payout,
  PayoutAccount,
  PlusEntitlement,
  Post,
  Reply,
  SearchResults,
  Tip,
  WalletBalance,
  WalletTopup,
} from "@veil/shared";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  consumerApi,
  type AccountIdentity,
  type ConsumerMediaAsset,
  type ConsumerReportPayload,
  type ConsumerRuntimeConfig,
  type MeResponse,
} from "../_lib/consumer-api";

const GATE_STORAGE_KEY = "nuudl-adult-gate";
const INVITE_CODE_STORAGE_KEY = "nuudl-beta-invite-code";
const CITY_STORAGE_KEY = "nuudl-active-city";
const JOINED_CHANNELS_STORAGE_PREFIX = "nuudl-joined-channels:";
const FAVORITE_CHANNELS_STORAGE_PREFIX = "nuudl-favorite-channels:";
const RECENT_CHANNELS_STORAGE_PREFIX = "nuudl-recent-channels:";
const PLATFORM_CUT_BPS = 2000;
const isLoopbackHost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

const getChatRequestActivityAt = (request: ChatRequest) =>
  request.lastActivityAt ?? request.lastMessageAt ?? request.createdAt;

const sortChatRequestsByActivity = (requests: ChatRequest[]) =>
  [...requests].sort((left, right) => getChatRequestActivityAt(right).localeCompare(getChatRequestActivityAt(left)));
const currencyFormatter = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const plusCatalog: Record<string, { plan: "monthly" | "yearly"; priceCents: number }> = {
  "plus-monthly": { plan: "monthly", priceCents: 1299 },
};
const apiUnavailableMessage = "NUUDL API ist gerade nicht erreichbar.";

function normalizeSearchHandle(query: string) {
  return query.trim().toLowerCase().replace(/^@+/, "");
}

function accountSearchScore(account: AccountSearchResult, query: string) {
  const normalized = normalizeSearchHandle(query);
  if (!normalized) {
    return Number(account.isCreator);
  }

  const username = account.username.toLowerCase();
  const displayName = account.displayName.toLowerCase();
  let score = 0;

  if (username === normalized) {
    score += 100;
  } else if (username.startsWith(normalized)) {
    score += 70;
  } else if (username.includes(normalized)) {
    score += 40;
  }

  if (displayName === normalized) {
    score += 60;
  } else if (displayName.startsWith(normalized)) {
    score += 35;
  } else if (displayName.includes(normalized)) {
    score += 15;
  }

  if (account.isCreator) {
    score += 6;
  }

  return score;
}

function mergeAccountSearchResults(
  primary: AccountSearchResult[] = [],
  secondary: AccountSearchResult[] = [],
  query: string,
) {
  const merged = new Map<string, AccountSearchResult>();

  [...primary, ...secondary].forEach((entry) => {
    const current = merged.get(entry.accountId);
    if (!current) {
      merged.set(entry.accountId, entry);
      return;
    }

    merged.set(entry.accountId, {
      ...current,
      ...entry,
      bio: entry.bio ?? current.bio ?? null,
      avatarUrl: entry.avatarUrl ?? current.avatarUrl ?? null,
      visibilityReason: entry.visibilityReason ?? current.visibilityReason,
      cityId: entry.cityId ?? current.cityId,
      cityLabel: entry.cityLabel ?? current.cityLabel,
    });
  });

  return [...merged.values()].sort((left, right) => {
    const scoreDelta = accountSearchScore(right, query) - accountSearchScore(left, query);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return left.username.localeCompare(right.username);
  });
}

function isLocalDemoRuntime() {
  return typeof window !== "undefined" && isLoopbackHost(window.location.hostname);
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function getReplyErrorMessage(error: unknown) {
  const message = getApiErrorMessage(error, "Antwort konnte gerade nicht gesendet werden.");

  if (message === "Please wait before replying again.") {
    return "Kurz warten, dann kannst du direkt weiter antworten.";
  }

  if (message === "Too many requests. Try again later.") {
    return "Du warst gerade sehr schnell. Warte kurz, dann kannst du weiter antworten.";
  }

  if (message === "Action temporarily blocked.") {
    return "Antworten ist für dieses Gerät gerade kurz pausiert.";
  }

  if (message === "This install is temporarily read-only.") {
    return "Dein Gerät ist gerade nur im Lesemodus.";
  }

  if (message === "Duplicate reply detected.") {
    return "Diese Antwort hast du gerade schon gesendet.";
  }

  return message;
}

export type LocationState = {
  status: "unknown" | "loading" | "ready" | "blocked";
  city: CityContext | null;
  message: string;
};

export type HydrationStatus = "idle" | "loading" | "ready" | "blocked";

type CreatePostInput = {
  cityId: string;
  channelId: string | null;
  body: string;
  media?: ConsumerMediaAsset[];
};

type CreateReplyInput = {
  postId: string;
  body: string;
};

type CreateReplyResult = {
  id: string | null;
  message: string | null;
};

type ChannelPreferenceSnapshot = {
  accountId?: string;
  source: "account" | "local";
  cityId: string;
  favoriteChannelIds: string[];
  joinedChannelIds: string[];
  recentChannelIds: string[];
  updatedAt?: string;
};

type SubmitReportInput = Omit<ConsumerReportPayload, "cityId"> & {
  cityId?: string;
};

type ConsumerAppContextValue = {
  booted: boolean;
  accountState: AccountIdentity | null;
  betaInviteRequired: boolean;
  demoPaymentsEnabled: boolean;
  hydrationMessage: string;
  hydrationStatus: HydrationStatus;
  gateAccepted: boolean;
  installIdentityId: string;
  activeCity: CityContext;
  channelEntries: Channel[];
  favoriteChannelIds: string[];
  location: LocationState;
  unreadNotifications: number;
  feedPosts: Post[];
  feedReplies: Reply[];
  notificationItems: NotificationItem[];
  walletBalance: WalletBalance;
  ledgerEntries: LedgerEntry[];
  walletTopupEntries: WalletTopup[];
  plusEntitlement: PlusEntitlement;
  creatorApplicationState: CreatorApplication;
  creatorReviewEntries: CreatorReview[];
  payoutAccountEntries: PayoutAccount[];
  payoutEntries: Payout[];
  chatRequests: ChatRequest[];
  chatMessages: ChatMessage[];
  postVotes: Record<string, -1 | 0 | 1>;
  replyVotes: Record<string, -1 | 0 | 1>;
  acceptGate: (betaInviteCode?: string) => Promise<{ ok: boolean; message: string }>;
  resolveLocation: () => void;
  createPost: (input: CreatePostInput) => Promise<string | null>;
  createReply: (input: CreateReplyInput) => Promise<CreateReplyResult>;
  submitReport: (input: SubmitReportInput) => Promise<{ ok: boolean; message: string }>;
  votePost: (postId: string, value: -1 | 1) => void;
  voteReply: (replyId: string, value: -1 | 1) => void;
  tipPost: (postId: string, grossCents: number) => Promise<{ ok: boolean; message: string }>;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  fakeTopupWallet: (grossCents: number) => Promise<{ ok: boolean; message: string }>;
  rememberRecentChannel: (cityId: string, channelIds: string[]) => void;
  toggleChannelJoined: (channelId: string) => void;
  toggleFavoriteChannel: (channelId: string) => void;
  loadChannels: (cityId?: string) => Promise<void>;
  loadNotifications: () => Promise<void>;
  searchCity: (cityId: string, query: string) => Promise<SearchResults>;
  checkUsernameAvailability: (input: { username: string }) => Promise<{
    available: boolean;
    normalizedUsername: string;
    reason?: string;
    username: string;
  }>;
  loadThread: (postId: string) => Promise<void>;
  loadChatOverview: () => Promise<void>;
  loadChatThread: (chatRequestId: string) => Promise<void>;
  createChatRequest: (input: {
    body?: string;
    postId: string;
    toInstallIdentityId: string;
  }) => Promise<{ ok: boolean; message: string; requestId: string | null }>;
  startEmailAccountLogin: (input: { email: string; displayName?: string; username?: string }) => Promise<{
    codePreview?: string | null;
    ok: boolean;
    message: string;
  }>;
  verifyEmailAccountLogin: (input: { email: string; code: string; displayName?: string; username?: string }) => Promise<{
    ok: boolean;
    message: string;
  }>;
  logoutAccount: () => Promise<{ ok: boolean; message: string }>;
  logoutAccountDevice: (installIdentityId: string) => Promise<{ ok: boolean; message: string }>;
  updateAccountProfile: (input: { displayName?: string; bio?: string; discoverable?: boolean }) => Promise<{
    ok: boolean;
    message: string;
  }>;
  purchasePlus: (productId: string) => Promise<{ ok: boolean; message: string }>;
  applyForCreator: () => Promise<{ ok: boolean; message: string }>;
  refreshCreatorState: () => Promise<void>;
  respondChatRequest: (
    chatRequestId: string,
    status: "accepted" | "declined",
  ) => Promise<{ ok: boolean; message: string }>;
  sendChatMessage: (
    chatRequestId: string,
    body: string,
    media?: ConsumerMediaAsset[],
  ) => Promise<{ ok: boolean; message: string; messageId: string | null }>;
  markChatThreadRead: (chatRequestId: string) => void;
  retryHydration: () => void;
};

const ConsumerAppContext = createContext<ConsumerAppContextValue | null>(null);

function getSeedCity() {
  return cities.find((city) => city.id === seedIdentity.cityId) ?? cities[0];
}

const emptyPlusEntitlement: PlusEntitlement = {
  active: false,
  explorer: false,
  imageChat: false,
  noAds: false,
  weeklyBoosts: 0,
  weeklyColorDrops: 0,
};

const emptyWalletBalance: WalletBalance = {
  currency: "EUR",
  availableCents: 0,
  pendingCents: 0,
  lifetimeTippedCents: 0,
  lifetimeEarnedCents: 0,
  lifetimePaidOutCents: 0,
};

const cleanChannelEntries = seedChannels.map((channel) => ({
  ...channel,
  joined: false,
  memberCount: 0,
}));

const cleanCreatorApplication: CreatorApplication = {
  ...seedCreatorApplication,
  adultVerified: false,
  kycState: "not_started",
  payoutState: "not_ready",
  status: "draft",
  submittedAt: null,
};

function getSyntheticPendingRequest(): ChatRequest {
  return {
    id: "chat-request-002",
    fromInstallIdentityId: "install-creator-009",
    toInstallIdentityId: seedIdentity.id,
    postId: "post-001",
    status: "pending",
    createdAt: "2026-03-26T14:10:00.000Z",
  };
}

function channelPreferenceStorageKey(prefix: string, cityId: string) {
  return `${prefix}${cityId}`;
}

function readStoredChannelIds(prefix: string, cityId: string) {
  if (typeof window === "undefined") {
    return { hasStored: false, ids: [] as string[] };
  }

  try {
    const raw = window.localStorage.getItem(channelPreferenceStorageKey(prefix, cityId));
    if (!raw) {
      return { hasStored: false, ids: [] as string[] };
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { hasStored: true, ids: [] as string[] };
    }

    return {
      hasStored: true,
      ids: parsed.filter((value): value is string => typeof value === "string"),
    };
  } catch {
    return { hasStored: false, ids: [] as string[] };
  }
}

function writeStoredChannelIds(prefix: string, cityId: string, ids: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(channelPreferenceStorageKey(prefix, cityId), JSON.stringify(ids));
  } catch {
    // Ignore storage errors for local-only channel preferences.
  }
}

function readStoredRecentChannelIds(cityId: string) {
  return readStoredChannelIds(RECENT_CHANNELS_STORAGE_PREFIX, cityId).ids;
}

function writeStoredRecentChannelIds(cityId: string, ids: string[]) {
  writeStoredChannelIds(RECENT_CHANNELS_STORAGE_PREFIX, cityId, ids);
}

function collectLocalChannelPreferenceSnapshots(): Array<{
  cityId: string;
  favoriteChannelIds: string[];
  joinedChannelIds: string[];
  recentChannelIds: string[];
}> {
  return cities
    .map((city) => {
      const favoriteChannelIds = readStoredChannelIds(FAVORITE_CHANNELS_STORAGE_PREFIX, city.id).ids;
      const joinedChannelIds = readStoredChannelIds(JOINED_CHANNELS_STORAGE_PREFIX, city.id).ids;
      const recentChannelIds = readStoredRecentChannelIds(city.id);

      return {
        cityId: city.id,
        favoriteChannelIds,
        joinedChannelIds,
        recentChannelIds,
      };
    })
    .filter(
      (entry) => entry.favoriteChannelIds.length || entry.joinedChannelIds.length || entry.recentChannelIds.length,
    );
}

function deriveJoinedChannelIds(channels: Channel[], cityId: string) {
  return channels.filter((channel) => channel.cityId === cityId && channel.joined).map((channel) => channel.id);
}

function applyJoinedChannelIds(channels: Channel[], cityId: string, joinedIds: string[]) {
  const joinedSet = new Set(joinedIds);

  return channels.map((channel) =>
    channel.cityId === cityId
      ? {
          ...channel,
          joined: joinedSet.has(channel.id),
          memberCount:
            channel.joined === joinedSet.has(channel.id)
              ? channel.memberCount
              : Math.max(0, channel.memberCount + (joinedSet.has(channel.id) ? 1 : -1)),
        }
      : channel,
  );
}

function formatEuro(amountCents: number) {
  return currencyFormatter.format(amountCents / 100);
}

function buildRecipientInstallIdentityId(authorLabel: string, targetId: string) {
  const normalizedAuthor = authorLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `install-creator-${normalizedAuthor || targetId}`;
}

function deriveWalletTopups(ledger: LedgerEntry[], currentInstallIdentityId: string) {
  return ledger
    .filter((entry) => entry.installIdentityId === currentInstallIdentityId && entry.kind === "topup")
    .map<WalletTopup>((entry) => ({
      id: `topup-${entry.id}`,
      installIdentityId: currentInstallIdentityId,
      provider: "fake",
      status: entry.status === "available" ? "succeeded" : "pending",
      grossCents: entry.grossCents,
      createdAt: entry.createdAt,
    }));
}

function extractTags(body: string) {
  return Array.from(
    new Set((body.match(/#([\p{L}\p{N}_-]+)/gu) ?? []).map((tag) => tag.replace(/^#/, "").toLowerCase())),
  ).slice(0, 4);
}

function normalizeMediaAssets(media?: ConsumerMediaAsset[]): MediaAsset[] {
  return (media ?? []).filter(
    (asset): asset is ConsumerMediaAsset =>
      asset.kind === "image" && typeof asset.url === "string" && asset.url.trim().length > 0,
  ).map((asset, index) => ({
    id: `media-local-${Date.now()}-${index}`,
    kind: "image",
    url: asset.url,
  }));
}

function toConsumerMediaAssets(media: MediaAsset[]): ConsumerMediaAsset[] | undefined {
  if (media.length === 0) {
    return undefined;
  }

  return media.map(({ kind, url }) => ({ kind, url }));
}

function isSameChatParticipant(
  request: ChatRequest,
  currentInstallIdentityId: string,
  targetInstallIdentityId: string,
  currentAccountId?: string | null,
  targetAccountId?: string | null,
) {
  const matchesByAccount =
    Boolean(currentAccountId) &&
    Boolean(targetAccountId) &&
    ((request.fromAccountId === currentAccountId && request.toAccountId === targetAccountId) ||
      (request.toAccountId === currentAccountId && request.fromAccountId === targetAccountId));

  const matchesByInstall =
    (request.fromInstallIdentityId === currentInstallIdentityId && request.toInstallIdentityId === targetInstallIdentityId) ||
    (request.toInstallIdentityId === currentInstallIdentityId && request.fromInstallIdentityId === targetInstallIdentityId);

  return matchesByAccount || matchesByInstall;
}

function isOwnChatMessage(
  message: ChatMessage,
  currentInstallIdentityId: string,
  currentAccountId?: string | null,
) {
  if (currentAccountId && message.accountId === currentAccountId) {
    return true;
  }

  return message.senderInstallIdentityId === currentInstallIdentityId;
}

export function ConsumerAppProvider({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);
  const [hydrationStatus, setHydrationStatus] = useState<HydrationStatus>("idle");
  const [hydrationMessage, setHydrationMessage] = useState("");
  const [hydrationNonce, setHydrationNonce] = useState(0);
  const [runtimeConfig, setRuntimeConfig] = useState<ConsumerRuntimeConfig | null>(null);
  const [accountState, setAccountState] = useState<AccountIdentity | null>(null);
  const [gateAccepted, setGateAccepted] = useState(false);
  const [installIdentityId, setInstallIdentityId] = useState(seedIdentity.id);
  const [channelEntries, setChannelEntries] = useState<Channel[]>(cleanChannelEntries);
  const [favoriteChannelIds, setFavoriteChannelIds] = useState<string[]>([]);
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [feedReplies, setFeedReplies] = useState<Reply[]>([]);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [walletBalance, setWalletBalance] = useState<WalletBalance>(emptyWalletBalance);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [, setTipEntries] = useState<Tip[]>([]);
  const [walletTopupEntries, setWalletTopupEntries] = useState<WalletTopup[]>([]);
  const [plusEntitlement, setPlusEntitlement] = useState<PlusEntitlement>(emptyPlusEntitlement);
  const [creatorApplicationState, setCreatorApplicationState] = useState<CreatorApplication>(cleanCreatorApplication);
  const [creatorReviewEntries, setCreatorReviewEntries] = useState<CreatorReview[]>([]);
  const [payoutAccountEntries, setPayoutAccountEntries] = useState<PayoutAccount[]>([]);
  const [payoutEntries] = useState<Payout[]>([]);
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [postVotes, setPostVotes] = useState<Record<string, -1 | 0 | 1>>({});
  const [replyVotes, setReplyVotes] = useState<Record<string, -1 | 0 | 1>>({});
  const [location, setLocation] = useState<LocationState>({
    status: "unknown",
    city: null,
    message: "Standort wird benoetigt, um deinen Stadtfeed zu laden.",
  });
  const hydratedCityRef = useRef<string | null>(null);
  const allowLocalFallbacks = runtimeConfig?.allowLocalFallbacks ?? false;
  const allowFakePayments = runtimeConfig?.enableFakePayments ?? false;
  const betaInviteRequired = runtimeConfig?.betaInviteRequired ?? false;
  const activeCityId = (location.city ?? getSeedCity()).id;
  const retryHydration = useCallback(() => {
    hydratedCityRef.current = null;
    setHydrationMessage("");
    setHydrationStatus("idle");
    setHydrationNonce((current) => current + 1);
  }, []);

  const hydrateLocalDemoState = useCallback(() => {
    setChannelEntries(seedChannels);
    setFeedPosts(seedPosts);
    setFeedReplies(seedReplies);
    setNotificationItems(seedNotifications);
    setWalletBalance(seedWallet);
    setLedgerEntries(seedLedger);
    setTipEntries(seedTips);
    setWalletTopupEntries(seedWalletTopups);
    setPlusEntitlement(seedIdentity.plus);
    setCreatorApplicationState(seedCreatorApplication);
    setCreatorReviewEntries(seedCreatorReviews);
    setPayoutAccountEntries(seedPayoutAccounts);
    setChatRequests(sortChatRequestsByActivity([...baseChatRequests, getSyntheticPendingRequest()]));
    setChatMessages(seedChatMessages);
  }, []);

  const pushNotification = (item: Omit<NotificationItem, "id" | "createdAt" | "read">) => {
    setNotificationItems((current) => [
      {
        id: `notif-local-${Date.now()}`,
        createdAt: new Date().toISOString(),
        read: false,
        ...item,
      },
      ...current,
    ]);
  };

  const syncWalletSnapshot = ({
    currentInstallIdentityId,
    ledger,
    topups,
    wallet,
  }: {
    currentInstallIdentityId: string;
    ledger: LedgerEntry[];
    topups?: WalletTopup[];
    wallet: WalletBalance;
  }) => {
    setLedgerEntries(ledger);
    setWalletBalance(wallet);
    setWalletTopupEntries(topups ?? deriveWalletTopups(ledger, currentInstallIdentityId));
  };

  const syncMeSnapshot = (meResponse: MeResponse) => {
    setInstallIdentityId(meResponse.installIdentity.id);
    setAccountState(meResponse.account ?? null);
    setCreatorApplicationState(meResponse.creatorApplication);
    setPlusEntitlement(meResponse.plus);
    setWalletBalance(meResponse.wallet);
  };

  const refreshAccountFromApi = async () => {
    const meResponse = await consumerApi.getMe();
    syncMeSnapshot(meResponse);
    return meResponse;
  };

  const refreshWalletFromApi = async () => {
    const walletResponse = await consumerApi.getWallet();
    setInstallIdentityId(walletResponse.currentInstallIdentityId);
    syncWalletSnapshot({
      currentInstallIdentityId: walletResponse.currentInstallIdentityId,
      ledger: walletResponse.ledger,
      topups: walletResponse.topups,
      wallet: walletResponse.wallet,
    });

    return walletResponse;
  };

  const refreshNotificationsFromApi = useCallback(async () => {
    const notificationsResponse = await consumerApi.getNotifications();
    setNotificationItems(notificationsResponse.notifications);
    return notificationsResponse;
  }, []);
  const loadNotifications = useCallback(async () => {
    await refreshNotificationsFromApi();
  }, [refreshNotificationsFromApi]);

  const refreshFeedFromApi = async (cityId: string) => {
    const feedResponse = await consumerApi.getFeed(cityId);
    setFeedPosts(feedResponse.posts);
    setPlusEntitlement(feedResponse.plus);
    return feedResponse;
  };

  const refreshCreatorState = async () => {
    const [creatorStatusResponse, earningsResponse] = await Promise.all([
      consumerApi.getCreatorStatus(),
      consumerApi.getEarnings(),
    ]);

    setCreatorApplicationState(creatorStatusResponse.application);
    setPlusEntitlement(creatorStatusResponse.plus);
    setWalletBalance(earningsResponse.wallet);
  };

  const resolveChannelPreferenceSnapshot = useCallback(
    (
      cityId: string,
      accountPreferencesOverride?: AccountChannelPreferences | null,
    ): ChannelPreferenceSnapshot => {
      const accountPreferences =
        accountPreferencesOverride ??
        accountState?.channelPreferences.find((entry) => entry.cityId === cityId) ??
        null;

      if (accountPreferences) {
        return {
          ...accountPreferences,
          source: "account",
        };
      }

      const storedJoined = readStoredChannelIds(JOINED_CHANNELS_STORAGE_PREFIX, cityId);
      const storedFavorites = readStoredChannelIds(FAVORITE_CHANNELS_STORAGE_PREFIX, cityId);
      const storedRecent = readStoredRecentChannelIds(cityId);

      return {
        source: "local",
        cityId,
        favoriteChannelIds: storedFavorites.ids,
        joinedChannelIds: storedJoined.ids,
        recentChannelIds: storedRecent,
        updatedAt: new Date().toISOString(),
      };
    },
    [accountState?.channelPreferences],
  );

  const syncAccountChannelPreferences = useCallback(
    async (
      cityId: string,
      patch: Partial<{
        favoriteChannelIds: string[];
        joinedChannelIds: string[];
        recentChannelIds: string[];
      }>,
    ) => {
      if (!accountState) {
        return null;
      }

      const current = resolveChannelPreferenceSnapshot(cityId);
      const next = {
        cityId,
        favoriteChannelIds: patch.favoriteChannelIds ?? current.favoriteChannelIds,
        joinedChannelIds: patch.joinedChannelIds ?? current.joinedChannelIds,
        recentChannelIds: patch.recentChannelIds ?? current.recentChannelIds,
      };

      const response = await consumerApi.updateAccountChannelPreferences(next);
      setAccountState((currentAccount) =>
        currentAccount
          ? {
              ...currentAccount,
              channelPreferences: [
                ...currentAccount.channelPreferences.filter((entry) => entry.cityId !== cityId),
                response.preferences,
              ].sort((left, right) => left.cityId.localeCompare(right.cityId)),
            }
          : currentAccount,
      );
      writeStoredChannelIds(FAVORITE_CHANNELS_STORAGE_PREFIX, cityId, response.preferences.favoriteChannelIds);
      writeStoredChannelIds(JOINED_CHANNELS_STORAGE_PREFIX, cityId, response.preferences.joinedChannelIds);
      writeStoredRecentChannelIds(cityId, response.preferences.recentChannelIds);
      if (cityId === activeCityId) {
        setFavoriteChannelIds(response.preferences.favoriteChannelIds);
        setChannelEntries((current) => applyJoinedChannelIds(current, cityId, response.preferences.joinedChannelIds));
      }

      return response.preferences;
    },
    [accountState, activeCityId, resolveChannelPreferenceSnapshot],
  );

  useEffect(() => {
    const preferences = resolveChannelPreferenceSnapshot(activeCityId);
    setFavoriteChannelIds(preferences.favoriteChannelIds);
    setChannelEntries((current) => applyJoinedChannelIds(current, activeCityId, preferences.joinedChannelIds));
    writeStoredRecentChannelIds(activeCityId, preferences.recentChannelIds);
  }, [activeCityId, resolveChannelPreferenceSnapshot]);

  const loadChannels = async (cityId = (location.city ?? getSeedCity()).id) => {
    const channelsResponse = await consumerApi.getChannels(cityId);
    const preferences = resolveChannelPreferenceSnapshot(cityId, channelsResponse.accountPreferences ?? null);
    const resolvedJoinedIds =
      preferences.source === "account" || readStoredChannelIds(JOINED_CHANNELS_STORAGE_PREFIX, cityId).hasStored
        ? preferences.joinedChannelIds
        : deriveJoinedChannelIds(channelsResponse.channels, cityId);

    setChannelEntries(applyJoinedChannelIds(channelsResponse.channels, cityId, resolvedJoinedIds));

    if (cityId === activeCityId) {
      setFavoriteChannelIds(preferences.favoriteChannelIds);
      writeStoredRecentChannelIds(cityId, preferences.recentChannelIds);
    }
  };

  const searchCity = async (cityId: string, query: string) => {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      const preferences = resolveChannelPreferenceSnapshot(cityId);
      const resolvedJoinedIds =
        preferences.source === "account" || readStoredChannelIds(JOINED_CHANNELS_STORAGE_PREFIX, cityId).hasStored
          ? preferences.joinedChannelIds
          : deriveJoinedChannelIds(channelEntries, cityId);

      return {
        accounts: [],
        channels: applyJoinedChannelIds(
          channelEntries.filter((channel) => channel.cityId === cityId),
          cityId,
          resolvedJoinedIds,
        ),
        hashtags: [],
        posts: feedPosts.filter((post) => post.cityId === cityId),
      } satisfies SearchResults;
    }

    const [searchResponse, usersResponse] = await Promise.all([
      consumerApi.getSearch(cityId, normalizedQuery),
      consumerApi.searchUsers(normalizedQuery).catch((error: unknown) => {
        console.warn("NUUDL API user search failed.", error);
        return { query: normalizedQuery, users: [] as AccountSearchResult[] };
      }),
    ]);
    const preferences = resolveChannelPreferenceSnapshot(cityId, searchResponse.results.accountPreferences ?? null);
    const resolvedJoinedIds =
      preferences.source === "account" || readStoredChannelIds(JOINED_CHANNELS_STORAGE_PREFIX, cityId).hasStored
        ? preferences.joinedChannelIds
        : deriveJoinedChannelIds(searchResponse.results.channels, cityId);
    return {
      ...searchResponse.results,
      accounts: mergeAccountSearchResults(searchResponse.results.accounts ?? [], usersResponse.users ?? [], normalizedQuery),
      channels: applyJoinedChannelIds(
        searchResponse.results.channels,
        cityId,
        resolvedJoinedIds,
      ),
    };
  };

  const loadThread = async (postId: string) => {
    const response = await consumerApi.getPostDetail(postId);

    setFeedPosts((current) => {
      const next = current.filter((post) => post.id !== response.post.id);
      return [response.post, ...next];
    });
    setFeedReplies((current) => [...response.replies, ...current.filter((reply) => reply.postId !== postId)]);
    if (response.channel) {
      const resolvedChannel = response.channel;
      setChannelEntries((current) => {
        const next = current.filter((channel) => channel.id !== resolvedChannel.id);
        const preferences = resolveChannelPreferenceSnapshot(resolvedChannel.cityId);
        const resolvedJoinedIds =
          preferences.source === "account" || readStoredChannelIds(JOINED_CHANNELS_STORAGE_PREFIX, resolvedChannel.cityId).hasStored
            ? preferences.joinedChannelIds
            : deriveJoinedChannelIds([resolvedChannel], resolvedChannel.cityId);
        const normalizedChannel = applyJoinedChannelIds(
          [resolvedChannel],
          resolvedChannel.cityId,
          resolvedJoinedIds,
        )[0];
        return [normalizedChannel, ...next];
      });
    }
  };

  const toggleChannelJoined = useCallback(
    (channelId: string) => {
      setChannelEntries((current) => {
        const target = current.find((channel) => channel.id === channelId);
        if (!target) {
          return current;
        }

        const nextJoined = !target.joined;
        const next = current.map((channel) =>
          channel.id === channelId
            ? {
                ...channel,
                joined: nextJoined,
                memberCount: Math.max(0, channel.memberCount + (nextJoined ? 1 : -1)),
              }
            : channel,
        );

        const nextIds = deriveJoinedChannelIds(next, target.cityId);
        if (accountState) {
          void syncAccountChannelPreferences(target.cityId, { joinedChannelIds: nextIds }).catch((error: unknown) => {
            console.warn("NUUDL channel joined sync failed.", error);
          });
        } else {
          writeStoredChannelIds(JOINED_CHANNELS_STORAGE_PREFIX, target.cityId, nextIds);
        }
        return next;
      });
    },
    [accountState, syncAccountChannelPreferences],
  );

  const toggleFavoriteChannel = useCallback(
    (channelId: string) => {
      setFavoriteChannelIds((current) => {
        const next = current.includes(channelId) ? current.filter((entry) => entry !== channelId) : [channelId, ...current];
        if (accountState) {
          void syncAccountChannelPreferences(activeCityId, { favoriteChannelIds: next }).catch((error: unknown) => {
            console.warn("NUUDL favorite channel sync failed.", error);
          });
        } else {
          writeStoredChannelIds(FAVORITE_CHANNELS_STORAGE_PREFIX, activeCityId, next);
        }
        return next;
      });
    },
    [accountState, activeCityId, syncAccountChannelPreferences],
  );

  const rememberRecentChannel = useCallback(
    (cityId: string, channelIds: string[]) => {
      if (accountState) {
        void syncAccountChannelPreferences(cityId, { recentChannelIds: channelIds.slice(0, 5) }).catch((error: unknown) => {
          console.warn("NUUDL recent channel sync failed.", error);
        });
      }
      writeStoredRecentChannelIds(cityId, channelIds.slice(0, 5));
    },
    [accountState, syncAccountChannelPreferences],
  );

  const loadChatThread = async (chatRequestId: string) => {
    const response = await consumerApi.getChatMessages(chatRequestId);

    setChatMessages((current) => [
      ...current.filter((message) => message.chatRequestId !== chatRequestId),
      ...response.messages,
    ]);
  };

  const loadChatOverview = async () => {
    const response = await consumerApi.getChatRequests();
    const nextRequests = sortChatRequestsByActivity(response.requests);
    setChatRequests(nextRequests);

    const previewRequest = nextRequests.find((request) => request.status === "accepted");
    if (previewRequest) {
      await loadChatThread(previewRequest.id);
    }
  };

  const createChatRequest = async ({
    body,
    postId,
    toInstallIdentityId,
  }: {
    body?: string;
    postId: string;
    toInstallIdentityId: string;
  }) => {
    if (toInstallIdentityId === installIdentityId) {
      return {
        ok: false,
        message: "Du kannst dir selbst keine Chat-Anfrage senden.",
        requestId: null,
      };
    }

    const existingRequest =
      chatRequests.find(
        (request) =>
          request.postId === postId &&
          request.status !== "declined" &&
          isSameChatParticipant(
            request,
            installIdentityId,
            toInstallIdentityId,
            accountState?.id,
            feedPosts.find((post) => post.id === postId)?.accountId,
          ),
      ) ?? null;

    if (existingRequest) {
      return {
        ok: true,
        message: existingRequest.status === "accepted" ? "Dieser Chat ist bereits offen." : "Eine Chat-Anfrage ist bereits offen.",
        requestId: existingRequest.id,
      };
    }

    try {
      const latestRequestsResponse = await consumerApi.getChatRequests();
      const latestRequests = sortChatRequestsByActivity(latestRequestsResponse.requests);

      setChatRequests(latestRequests);

      const latestExistingRequest =
        latestRequests.find(
          (request) =>
            request.postId === postId &&
            request.status !== "declined" &&
            isSameChatParticipant(
              request,
              installIdentityId,
              toInstallIdentityId,
              accountState?.id,
              feedPosts.find((post) => post.id === postId)?.accountId,
            ),
        ) ?? null;

      if (latestExistingRequest) {
        return {
          ok: true,
          message:
            latestExistingRequest.status === "accepted"
              ? "Dieser Chat ist bereits offen."
              : "Eine Chat-Anfrage ist bereits offen.",
          requestId: latestExistingRequest.id,
        };
      }
    } catch (error) {
      console.warn("NUUDL API chat request refresh failed before createChatRequest, using current local list.", error);
    }

    try {
      const createdRequest = await consumerApi.createChatRequest({
        body,
        postId,
        toInstallIdentityId,
      });

      setChatRequests((current) =>
        sortChatRequestsByActivity([createdRequest, ...current.filter((request) => request.id !== createdRequest.id)]),
      );
      await refreshNotificationsFromApi().catch(() => undefined);

      return {
        ok: true,
        message: "Chat-Anfrage gesendet.",
        requestId: createdRequest.id,
      };
    } catch (error) {
      console.warn("NUUDL API createChatRequest failed.", error);

      if (!allowLocalFallbacks) {
        return {
          ok: false,
          message: "Chat-Anfrage konnte gerade nicht gesendet werden.",
          requestId: null,
        };
      }

      const targetPost = feedPosts.find((post) => post.id === postId) ?? null;
      const createdRequest: ChatRequest = {
        id: `chat-request-local-${Date.now()}`,
        counterpartDisplayName: targetPost?.accountIsCreator ? targetPost.accountDisplayName ?? undefined : undefined,
        counterpartIsCreator: targetPost?.accountIsCreator ? true : undefined,
        counterpartLabel: targetPost?.accountIsCreator
          ? targetPost.accountDisplayName || (targetPost.accountUsername ? `@${targetPost.accountUsername}` : targetPost.authorLabel)
          : targetPost?.authorLabel,
        counterpartUsername: targetPost?.accountIsCreator ? targetPost.accountUsername ?? undefined : undefined,
        fromInstallIdentityId: installIdentityId,
        toInstallIdentityId,
        postId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      setChatRequests((current) => sortChatRequestsByActivity([createdRequest, ...current]));
      pushNotification({
        kind: "chat_request",
        message: "Chat-Anfrage vorgemerkt.",
        targetRoute: `/chat/${createdRequest.id}`,
      });

      return {
        ok: true,
        message: "Chat-Anfrage vorgemerkt.",
        requestId: createdRequest.id,
      };
    }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const config = await consumerApi.loadRuntimeConfig();
        if (cancelled) {
          return;
        }

        setRuntimeConfig(config);
      } catch (error) {
        console.warn("NUUDL runtime config failed.", error);
        if (!cancelled) {
          setHydrationStatus("blocked");
          setHydrationMessage(getApiErrorMessage(error, "NUUDL Konfiguration ist gerade nicht verfuegbar."));
        }
      }

      if (cancelled) {
        return;
      }

      const persistedGate = window.localStorage.getItem(GATE_STORAGE_KEY);
      const persistedCityId = window.localStorage.getItem(CITY_STORAGE_KEY);
      const persistedCity = cities.find((city) => city.id === persistedCityId) ?? null;

      if (persistedGate === "accepted") {
        setGateAccepted(true);
      }

      if (persistedCity) {
        setLocation({
          status: "ready",
          city: persistedCity,
          message: `Verbunden mit ${persistedCity.label}.`,
        });
      }

      setBooted(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!booted || !gateAccepted || !runtimeConfig || location.status !== "ready" || !location.city) {
      return;
    }

    const targetCity = location.city;
    if (hydratedCityRef.current === targetCity.id) {
      setHydrationStatus("ready");
      return;
    }

    hydratedCityRef.current = targetCity.id;
    let cancelled = false;
    setHydrationStatus("loading");
    setHydrationMessage("");

    void (async () => {
      try {
        const registration = await consumerApi.registerInstall({
          adultGateAccepted: true,
          betaInviteCode: betaInviteRequired
            ? window.localStorage.getItem(INVITE_CODE_STORAGE_KEY) ?? undefined
            : undefined,
          cityId: targetCity.id,
        });
        const [meResponse, walletResponse, notificationsResponse, feedResponse, channelsResponse, chatRequestsResponse] = await Promise.all([
          consumerApi.getMe(),
          consumerApi.getWallet(),
          consumerApi.getNotifications(),
          consumerApi.getFeed(registration.cityContext.id),
          consumerApi.getChannels(registration.cityContext.id),
          consumerApi.getChatRequests(),
        ]);
        const acceptedRequest = chatRequestsResponse.requests.find((request) => request.status === "accepted");
        const acceptedMessagesResponse = acceptedRequest
          ? await consumerApi.getChatMessages(acceptedRequest.id)
          : { messages: [] };

        if (cancelled) {
          return;
        }

        syncMeSnapshot(meResponse);
        syncWalletSnapshot({
          currentInstallIdentityId: meResponse.installIdentity.id,
          ledger: walletResponse.ledger,
          topups: walletResponse.topups,
          wallet: walletResponse.wallet,
        });
        setNotificationItems(notificationsResponse.notifications);
        setFeedPosts(feedResponse.posts);
        {
          const preferences = resolveChannelPreferenceSnapshot(
            registration.cityContext.id,
            channelsResponse.accountPreferences ??
              meResponse.account?.channelPreferences.find((entry) => entry.cityId === registration.cityContext.id) ??
              null,
          );
          const resolvedJoinedIds =
            preferences.source === "account" || readStoredChannelIds(JOINED_CHANNELS_STORAGE_PREFIX, registration.cityContext.id).hasStored
              ? preferences.joinedChannelIds
              : deriveJoinedChannelIds(channelsResponse.channels, registration.cityContext.id);
          setFavoriteChannelIds(preferences.favoriteChannelIds);
          setChannelEntries(applyJoinedChannelIds(channelsResponse.channels, registration.cityContext.id, resolvedJoinedIds));
          writeStoredRecentChannelIds(registration.cityContext.id, preferences.recentChannelIds);
        }
        setChatRequests(sortChatRequestsByActivity(chatRequestsResponse.requests));
        setChatMessages(acceptedMessagesResponse.messages);
        setHydrationStatus("ready");
      } catch (error) {
        hydratedCityRef.current = null;
        console.warn("NUUDL API hydration failed.", error);
        const message = getApiErrorMessage(error, apiUnavailableMessage);
        if (betaInviteRequired && message.toLowerCase().includes("beta")) {
          window.localStorage.removeItem(GATE_STORAGE_KEY);
          window.localStorage.removeItem(INVITE_CODE_STORAGE_KEY);
          setGateAccepted(false);
          setHydrationStatus("idle");
          setHydrationMessage("");
          return;
        }

        if (!allowLocalFallbacks) {
          setHydrationStatus("blocked");
          setHydrationMessage(message);
          return;
        }

        hydrateLocalDemoState();
        setHydrationStatus("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    allowLocalFallbacks,
    booted,
    gateAccepted,
    hydrateLocalDemoState,
    hydrationNonce,
    location.city?.id,
    location.status,
    runtimeConfig,
    betaInviteRequired,
  ]);

  const acceptGate = async (betaInviteCode?: string) => {
    const normalizedInviteCode = betaInviteCode?.trim() ?? "";

    if (betaInviteRequired) {
      if (!normalizedInviteCode) {
        return {
          ok: false,
          message: "Bitte gib deinen Beta-Code ein.",
        };
      }

      try {
        await consumerApi.checkBetaInvite({ betaInviteCode: normalizedInviteCode });
        window.localStorage.setItem(INVITE_CODE_STORAGE_KEY, normalizedInviteCode);
      } catch (error) {
        console.warn("NUUDL beta invite check failed.", error);
        return {
          ok: false,
          message: getApiErrorMessage(error, "Dieser Beta-Code ist nicht gültig."),
        };
      }
    } else {
      window.localStorage.removeItem(INVITE_CODE_STORAGE_KEY);
    }

    window.localStorage.setItem(GATE_STORAGE_KEY, "accepted");
    setGateAccepted(true);
    return {
      ok: true,
      message: "Willkommen bei NUUDL.",
    };
  };

  const startEmailAccountLogin = async ({
    email,
    displayName,
    username,
  }: {
    email: string;
    displayName?: string;
    username?: string;
  }) => {
    try {
      const response = await consumerApi.startEmailLogin({ email, displayName, username });
      return {
        ok: true,
        message: response.message,
        codePreview: response.codePreview ?? null,
      };
    } catch (error) {
      console.warn("NUUDL API startEmailLogin failed.", error);
      return {
        ok: false,
        message: getApiErrorMessage(error, "Verifizierungscode konnte gerade nicht gesendet werden."),
        codePreview: null,
      };
    }
  };

  const verifyEmailAccountLogin = async ({
    email,
    code,
    displayName,
    username,
  }: {
    email: string;
    code: string;
    displayName?: string;
    username?: string;
  }) => {
    try {
      const localChannelPreferences = collectLocalChannelPreferenceSnapshots();
      const response = await consumerApi.verifyEmailLogin({
        email,
        code,
        displayName,
        username,
        channelPreferences: localChannelPreferences,
      });

      await Promise.all(
        localChannelPreferences.map((preferences) =>
          consumerApi.updateAccountChannelPreferences(preferences).catch((error: unknown) => {
            console.warn("NUUDL account preference migration failed.", error);
            return null;
          }),
        ),
      );

      const [meResponse] = await Promise.all([
        refreshAccountFromApi(),
        refreshWalletFromApi(),
        refreshNotificationsFromApi(),
        loadChannels(activeCityId),
        loadChatOverview(),
      ]);
      if (meResponse.account) {
        const activePreferences =
          meResponse.account.channelPreferences.find((entry) => entry.cityId === activeCityId) ??
          null;
        const resolvedPreferences = resolveChannelPreferenceSnapshot(activeCityId, activePreferences);
        setFavoriteChannelIds(resolvedPreferences.favoriteChannelIds);
        setChannelEntries((current) => applyJoinedChannelIds(current, activeCityId, resolvedPreferences.joinedChannelIds));
        writeStoredRecentChannelIds(activeCityId, resolvedPreferences.recentChannelIds);
      }
      return {
        ok: true,
        message: response.message,
      };
    } catch (error) {
      console.warn("NUUDL API verifyEmailLogin failed.", error);
      return {
        ok: false,
        message: getApiErrorMessage(error, "Der Code konnte gerade nicht bestaetigt werden."),
      };
    }
  };

  const logoutAccount = async () => {
    try {
      const response = await consumerApi.logoutAccount();
      if (response.account === null) {
        setAccountState(null);
      }

      await Promise.all([
        refreshAccountFromApi(),
        refreshWalletFromApi(),
        refreshNotificationsFromApi(),
        loadChannels(activeCityId),
        loadChatOverview(),
      ]);
      return {
        ok: true,
        message: response.message,
      };
    } catch (error) {
      console.warn("NUUDL API logoutAccount failed.", error);
      return {
        ok: false,
        message: getApiErrorMessage(error, "Abmelden konnte gerade nicht verarbeitet werden."),
      };
    }
  };

  const logoutAccountDevice = async (installIdentityId: string) => {
    try {
      const response = await consumerApi.logoutAccountDevice(installIdentityId);
      setAccountState(response.account);
      await Promise.all([refreshAccountFromApi(), loadChatOverview()]);
      return {
        ok: true,
        message: response.message,
      };
    } catch (error) {
      console.warn("NUUDL API logoutAccountDevice failed.", error);
      return {
        ok: false,
        message: getApiErrorMessage(error, "Gerät konnte gerade nicht abgemeldet werden."),
      };
    }
  };

  const updateAccountProfile = async ({
    displayName,
    bio,
    discoverable,
  }: {
    displayName?: string;
    bio?: string;
    discoverable?: boolean;
  }) => {
    try {
      const response = await consumerApi.updateAccountProfile({ displayName, bio, discoverable });
      setAccountState(response.account);
      await refreshAccountFromApi();
      return {
        ok: true,
        message: "Account-Profil gespeichert.",
      };
    } catch (error) {
      console.warn("NUUDL API updateAccountProfile failed.", error);
      return {
        ok: false,
        message: getApiErrorMessage(error, "Account-Profil konnte gerade nicht gespeichert werden."),
      };
    }
  };

  const checkUsernameAvailability = async ({ username }: { username: string }) =>
    consumerApi.checkUsernameAvailability({ username });

  const applyLocalCreatePost = ({ cityId, channelId, body, media }: CreatePostInput) => {
    const trimmed = body.trim();
    const normalizedMedia = normalizeMediaAssets(media);

    if (!trimmed) {
      return null;
    }

    const createdAt = new Date().toISOString();
    const id = `post-local-${Date.now()}`;
    const tags = extractTags(trimmed);

    setFeedPosts((current) => [
      {
        id,
        accountDisplayName: accountState?.isCreator ? accountState.displayName : undefined,
        accountIsCreator: accountState?.isCreator ? true : undefined,
        accountUsername: accountState?.isCreator ? accountState.username : undefined,
        cityId,
        channelId,
        recipientInstallIdentityId: installIdentityId,
        body: trimmed,
        authorLabel: "Du",
        score: 0,
        replyCount: 0,
        createdAt,
        tags,
        media: normalizedMedia,
        tipTotalCents: 0,
        canTip: true,
        isPinned: false,
        moderation: "visible",
      },
      ...current,
    ]);

    return id;
  };

  const createPost = async ({ cityId, channelId, body, media }: CreatePostInput) => {
    const trimmed = body.trim();
    const normalizedMedia = normalizeMediaAssets(media);

    if (!trimmed) {
      return null;
    }

    try {
      const createdPost = await consumerApi.createPost({
        body: trimmed,
        channelId,
        cityId,
        media: toConsumerMediaAssets(normalizedMedia),
        tags: extractTags(trimmed),
      });
      await refreshFeedFromApi(cityId);
      return createdPost.id;
    } catch (error) {
      console.warn("NUUDL API createPost failed.", error);
      if (allowLocalFallbacks) {
        return applyLocalCreatePost({ body: trimmed, channelId, cityId, media: normalizedMedia });
      }

      return null;
    }
  };

  const applyLocalCreateReply = ({ postId, body }: CreateReplyInput) => {
    const trimmed = body.trim();

    if (!trimmed) {
      return null;
    }

    const createdAt = new Date().toISOString();
    const id = `reply-local-${Date.now()}`;
    const authorLabel = createThreadAnonLabel(postId, installIdentityId);

    setFeedReplies((current) => [
      {
        id,
        accountDisplayName: accountState?.isCreator ? accountState.displayName : undefined,
        accountIsCreator: accountState?.isCreator ? true : undefined,
        accountUsername: accountState?.isCreator ? accountState.username : undefined,
        postId,
        recipientInstallIdentityId: installIdentityId,
        body: trimmed,
        authorLabel,
        score: 0,
        createdAt,
        tipTotalCents: 0,
        canTip: false,
        moderation: "visible",
      },
      ...current,
    ]);

    setFeedPosts((current) =>
      current.map((post) => (post.id === postId ? { ...post, replyCount: post.replyCount + 1 } : post)),
    );

    return id;
  };

  const createReply = async ({ postId, body }: CreateReplyInput) => {
    const trimmed = body.trim();

    if (!trimmed) {
      return { id: null, message: "Schreib kurz etwas, bevor du sendest." };
    }

    try {
      const createdReply = await consumerApi.createReply({
        body: trimmed,
        postId,
      });
      await Promise.all([loadThread(postId), refreshNotificationsFromApi()]);
      return { id: createdReply.id, message: null };
    } catch (error) {
      console.warn("NUUDL API createReply failed.", error);
      if (allowLocalFallbacks) {
        return { id: applyLocalCreateReply({ body: trimmed, postId }), message: null };
      }

      return { id: null, message: getReplyErrorMessage(error) };
    }
  };

  const submitReport = async ({ cityId, reason, targetId, targetType }: SubmitReportInput) => {
    const normalizedReason = reason.trim();

    if (!normalizedReason) {
      return {
        ok: false,
        message: "Bitte waehle einen Grund fuer die Meldung aus.",
      };
    }

    try {
      await consumerApi.report({
        cityId: cityId ?? activeCityId,
        reason: normalizedReason,
        targetId,
        targetType,
      });

      return {
        ok: true,
        message: "Meldung gesendet.",
      };
    } catch (error) {
      console.warn("NUUDL API report failed.", error);

      return {
        ok: false,
        message: "Meldung konnte gerade nicht gesendet werden.",
      };
    }
  };

  const votePost = (postId: string, value: -1 | 1) => {
    const currentValue = postVotes[postId] ?? 0;
    const nextValue = currentValue === value ? 0 : value;
    const delta = nextValue - currentValue;

    setPostVotes((currentVotes) => ({ ...currentVotes, [postId]: nextValue }));
    setFeedPosts((currentPosts) =>
      currentPosts.map((post) => (post.id === postId ? { ...post, score: post.score + delta } : post)),
    );

    void consumerApi
      .vote({
        targetId: postId,
        targetType: "post",
        value: nextValue,
      })
      .then((response) => {
        setPostVotes((currentVotes) => ({ ...currentVotes, [postId]: response.value }));
        setFeedPosts((currentPosts) =>
          currentPosts.map((post) => (post.id === postId ? { ...post, score: response.aggregateScore } : post)),
        );
      })
      .catch((error: unknown) => {
        console.warn("NUUDL API votePost failed.", error);
        if (!allowLocalFallbacks) {
          setPostVotes((currentVotes) => ({ ...currentVotes, [postId]: currentValue }));
          setFeedPosts((currentPosts) =>
            currentPosts.map((post) => (post.id === postId ? { ...post, score: post.score - delta } : post)),
          );
        }
      });
  };

  const voteReply = (replyId: string, value: -1 | 1) => {
    const currentValue = replyVotes[replyId] ?? 0;
    const nextValue = currentValue === value ? 0 : value;
    const delta = nextValue - currentValue;

    setReplyVotes((currentVotes) => ({ ...currentVotes, [replyId]: nextValue }));
    setFeedReplies((currentReplies) =>
      currentReplies.map((reply) => (reply.id === replyId ? { ...reply, score: reply.score + delta } : reply)),
    );

    void consumerApi
      .vote({
        targetId: replyId,
        targetType: "reply",
        value: nextValue,
      })
      .then((response) => {
        setReplyVotes((currentVotes) => ({ ...currentVotes, [replyId]: response.value }));
        setFeedReplies((currentReplies) =>
          currentReplies.map((reply) => (reply.id === replyId ? { ...reply, score: response.aggregateScore } : reply)),
        );
      })
      .catch((error: unknown) => {
        console.warn("NUUDL API voteReply failed.", error);
        if (!allowLocalFallbacks) {
          setReplyVotes((currentVotes) => ({ ...currentVotes, [replyId]: currentValue }));
          setFeedReplies((currentReplies) =>
            currentReplies.map((reply) => (reply.id === replyId ? { ...reply, score: reply.score - delta } : reply)),
          );
        }
      });
  };

  const applyLocalTip = ({
    targetType,
    targetId,
    grossCents,
  }: {
    targetType: "post" | "reply";
    targetId: string;
    grossCents: number;
  }) => {
    const target =
      targetType === "post"
        ? feedPosts.find((post) => post.id === targetId)
        : feedReplies.find((reply) => reply.id === targetId);

    if (!target) {
      return { ok: false, message: "Dieser Inhalt ist nicht mehr verfuegbar." };
    }

    if (!target.canTip || target.authorLabel === "Du") {
      return { ok: false, message: "Auf diesen Inhalt sind aktuell keine Tips moeglich." };
    }

    if (walletBalance.availableCents < grossCents) {
      return { ok: false, message: `Nicht genug Guthaben fuer ${formatEuro(grossCents)}.` };
    }

    const createdAt = new Date().toISOString();
    const platformFeeCents = Math.round((grossCents * PLATFORM_CUT_BPS) / 10000);
    const creatorNetCents = grossCents - platformFeeCents;
    const recipientInstallIdentityId = buildRecipientInstallIdentityId(target.authorLabel, targetId);
    const tipId = `tip-local-${Date.now()}`;
    const targetRoute =
      targetType === "post" ? `/post/${targetId}` : `/post/${(target as Reply).postId}`;

    setWalletBalance((current) => ({
      ...current,
      availableCents: current.availableCents - grossCents,
      lifetimeTippedCents: current.lifetimeTippedCents + grossCents,
    }));
    setTipEntries((current) => [
      {
        id: tipId,
        senderInstallIdentityId: installIdentityId,
        recipientInstallIdentityId,
        targetType,
        targetId,
        grossCents,
        platformFeeCents,
        creatorNetCents,
        status: "pending",
        createdAt,
      },
      ...current,
    ]);
    setLedgerEntries((current) => [
      {
        id: `ledger-local-tip-out-${Date.now()}`,
        installIdentityId,
        kind: "tip_out",
        status: "available",
        grossCents,
        platformFeeCents,
        netCents: -grossCents,
        refType: targetType,
        refId: targetId,
        createdAt,
      },
      {
        id: `ledger-local-tip-in-${Date.now() + 1}`,
        installIdentityId: recipientInstallIdentityId,
        kind: "tip_in",
        status: "pending",
        grossCents,
        platformFeeCents,
        netCents: creatorNetCents,
        refType: targetType,
        refId: targetId,
        createdAt,
      },
      {
        id: `ledger-local-tip-fee-${Date.now() + 2}`,
        installIdentityId: "platform-nuudl",
        kind: "platform_fee",
        status: "available",
        grossCents: platformFeeCents,
        platformFeeCents: 0,
        netCents: platformFeeCents,
        refType: targetType,
        refId: targetId,
        createdAt,
      },
      ...current,
    ]);

    if (targetType === "post") {
      setFeedPosts((current) =>
        current.map((post) => (post.id === targetId ? { ...post, tipTotalCents: post.tipTotalCents + grossCents } : post)),
      );
    } else {
      setFeedReplies((current) =>
        current.map((reply) =>
          reply.id === targetId ? { ...reply, tipTotalCents: reply.tipTotalCents + grossCents } : reply,
        ),
      );
    }

    pushNotification({
      kind: "tip",
      message: `Du hast ${formatEuro(grossCents)} an ${target.authorLabel} gesendet. ${formatEuro(creatorNetCents)} gehen nach Fee an den Creator.`,
      targetRoute,
    });

    return {
      ok: true,
      message: `${formatEuro(grossCents)} Tip gesendet.`,
    };
  };

  const tipPost = async (postId: string, grossCents: number) => {
    const target = feedPosts.find((post) => post.id === postId);

    if (!target) {
      return { ok: false, message: "Dieser Inhalt ist nicht mehr verfuegbar." };
    }

    try {
      const recipientInstallIdentityId =
        target.recipientInstallIdentityId ?? buildRecipientInstallIdentityId(target.authorLabel, postId);
      const response = await consumerApi.tip({
        amountCents: grossCents,
        recipientInstallIdentityId,
        targetId: postId,
        targetType: "post",
      });

      await Promise.all([
        refreshWalletFromApi(),
        refreshNotificationsFromApi(),
        refreshFeedFromApi((location.city ?? getSeedCity()).id),
      ]);

      return {
        ok: true,
        message: `${formatEuro(grossCents)} Tip gesendet.`,
      };
    } catch (error) {
      console.warn("NUUDL API tipPost failed.", error);
      if (allowLocalFallbacks) {
        return applyLocalTip({ targetType: "post", targetId: postId, grossCents });
      }

      return {
        ok: false,
        message: "Tip konnte gerade nicht gesendet werden.",
      };
    }
  };

  const markNotificationRead = (notificationId: string) => {
    setNotificationItems((current) =>
      current.map((item) => (item.id === notificationId ? { ...item, read: true } : item)),
    );

    void consumerApi
      .markNotificationRead({ notificationId })
      .then((response) => {
        setNotificationItems(response.notifications);
      })
      .catch((error) => {
        console.warn("NUUDL API notifications/read failed.", error);
        if (!allowLocalFallbacks) {
          void refreshNotificationsFromApi().catch(() => undefined);
        }
      });
  };

  const markAllNotificationsRead = async () => {
    try {
      const response = await consumerApi.markAllNotificationsRead();
      setNotificationItems(response.notifications);
      return;
    } catch (error) {
      console.warn("NUUDL API notifications/read-all failed.", error);
      if (!allowLocalFallbacks) {
        return;
      }
    }

    setNotificationItems((current) => current.map((item) => ({ ...item, read: true })));
  };

  const applyLocalTopup = (grossCents: number) => {
    const createdAt = new Date().toISOString();
    const topupId = `topup-local-${Date.now()}`;

    setWalletBalance((current) => ({
      ...current,
      availableCents: current.availableCents + grossCents,
    }));
    setWalletTopupEntries((current) => [
      {
        id: topupId,
        installIdentityId,
        provider: "fake",
        status: "succeeded",
        grossCents,
        createdAt,
      },
      ...current,
    ]);
    setLedgerEntries((current) => [
      {
        id: `ledger-local-topup-${Date.now()}`,
        installIdentityId,
        kind: "topup",
        status: "available",
        grossCents,
        platformFeeCents: 0,
        netCents: grossCents,
        refType: "wallet",
        refId: topupId,
        createdAt,
      },
      ...current,
    ]);
    pushNotification({
      kind: "system",
      message: `Wallet erfolgreich mit ${formatEuro(grossCents)} aufgeladen.`,
      targetRoute: "/me",
    });

    return {
      ok: true,
      message: `${formatEuro(grossCents)} wurden deinem Wallet gutgeschrieben.`,
    };
  };

  const fakeTopupWallet = async (grossCents: number) => {
    if (!allowFakePayments) {
      return {
        ok: false,
        message: "Wallet-Topups sind in dieser Beta noch nicht freigeschaltet.",
      };
    }

    try {
      const response = await consumerApi.topupWallet({ amountCents: grossCents, provider: "fake" });
      setWalletTopupEntries((current) => [
        {
          id: response.ledgerEntry.refId,
          installIdentityId,
          provider: response.provider,
          status: "succeeded",
          grossCents,
          createdAt: response.ledgerEntry.createdAt,
        },
        ...current,
      ]);
      await Promise.all([refreshWalletFromApi(), refreshNotificationsFromApi()]);

      return {
        ok: true,
        message: `${formatEuro(grossCents)} wurden dem Wallet gutgeschrieben.`,
      };
    } catch (error) {
      console.warn("NUUDL API wallet topup failed.", error);
      if (allowLocalFallbacks) {
        return applyLocalTopup(grossCents);
      }

      return {
        ok: false,
        message: "Wallet konnte gerade nicht aufgeladen werden.",
      };
    }
  };

  const purchasePlus = async (productId: string) => {
    const product = plusCatalog[productId] ?? plusCatalog["plus-monthly"];
    const priceCents = product.priceCents;

    if (plusEntitlement.active) {
      return { ok: true, message: "Plus ist bereits aktiv." };
    }

    if (!allowFakePayments) {
      return { ok: false, message: "NUUDL Plus ist in dieser Beta noch nicht freigeschaltet." };
    }

    if (walletBalance.availableCents < priceCents) {
      return { ok: false, message: "Nicht genug Guthaben fuer NUUDL Plus." };
    }

    try {
      const response = await consumerApi.checkoutPlus({
        plan: product.plan,
        provider: "fake",
      });

      setPlusEntitlement(response.plus);
      await Promise.all([refreshWalletFromApi(), refreshNotificationsFromApi()]);

      return { ok: true, message: "NUUDL Plus ist jetzt aktiv." };
    } catch (error) {
      console.warn("NUUDL API plus checkout failed.", error);
      return { ok: false, message: "Plus-Kauf gerade nicht erreichbar." };
    }
  };

  const applyForCreator = async () => {
    if (creatorApplicationState.status === "approved") {
      return { ok: true, message: "Creator ist bereits freigegeben." };
    }

    try {
      if (creatorApplicationState.status === "draft" || creatorApplicationState.status === "rejected") {
        await consumerApi.applyForCreator({
          adultVerified: true,
          displayName: accountState?.displayName || accountState?.username || "NUUDL Creator",
        });
      }

      await Promise.all([refreshCreatorState(), refreshNotificationsFromApi()]);

      return {
        ok: true,
        message:
          creatorApplicationState.status === "draft" || creatorApplicationState.status === "rejected"
            ? "Creator-Antrag wurde eingereicht."
            : "Creator-Status wurde aktualisiert.",
      };
    } catch (error) {
      console.warn("NUUDL API creator apply/status refresh failed.", error);
      return {
        ok: false,
        message: "Creator-Status konnte gerade nicht aktualisiert werden.",
      };
    }
  };

  const respondChatRequest = async (chatRequestId: string, status: "accepted" | "declined") => {
    const existingRequest = chatRequests.find((request) => request.id === chatRequestId) ?? null;

    if (!existingRequest) {
      return {
        ok: false,
        message: "Chat-Anfrage nicht gefunden.",
      };
    }

    setChatRequests((current) =>
      current.map((request) => (request.id === chatRequestId ? { ...request, status } : request)),
    );

    if (status === "accepted" && allowLocalFallbacks) {
      pushNotification({
        kind: "chat_request",
        message: "Eine Chat-Anfrage wurde angenommen. Der Chat ist jetzt offen.",
        targetRoute: `/chat/${chatRequestId}`,
      });
    }

    try {
      await consumerApi.respondChatRequest({
        action: status === "accepted" ? "accept" : "decline",
        requestId: chatRequestId,
      });
      await Promise.all([loadChatOverview(), refreshNotificationsFromApi()]);

      return {
        ok: true,
        message: status === "accepted" ? "Chat-Anfrage angenommen." : "Chat-Anfrage abgelehnt.",
      };
    } catch (error) {
      console.warn("NUUDL API respondChatRequest failed.", error);

      if (!allowLocalFallbacks) {
        setChatRequests((current) =>
          current.map((request) => (request.id === chatRequestId ? { ...request, status: existingRequest.status } : request)),
        );
      }

      if (allowLocalFallbacks) {
        return {
          ok: true,
          message:
            status === "accepted"
              ? "Chat-Anfrage angenommen."
              : "Chat-Anfrage abgelehnt.",
        };
      }

      return {
        ok: false,
        message: "Chat-Anfrage konnte gerade nicht aktualisiert werden.",
      };
    }
  };

  const sendChatMessage = async (chatRequestId: string, body: string, media?: ConsumerMediaAsset[]) => {
    const trimmed = body.trim();
    const normalizedMedia = normalizeMediaAssets(media);

    if (!trimmed) {
      return {
        ok: false,
        message: "Nachricht darf nicht leer sein.",
        messageId: null,
      };
    }

    const targetRequest = chatRequests.find((request) => request.id === chatRequestId);

    if (!targetRequest || targetRequest.status !== "accepted") {
      return {
        ok: false,
        message: "Dieser Chat ist noch nicht freigeschaltet.",
        messageId: null,
      };
    }

    const createdAt = new Date().toISOString();
    const id = `chat-message-local-${Date.now()}`;

    if (allowLocalFallbacks) {
      setChatMessages((current) => [
        ...current,
        {
          id,
          chatRequestId,
          senderInstallIdentityId: installIdentityId,
          body: trimmed,
          media: normalizedMedia,
          createdAt,
          readAt: null,
        },
      ]);
    }

    try {
      await consumerApi.sendChatMessage({
        body: trimmed,
        chatRequestId,
        media: toConsumerMediaAssets(normalizedMedia),
      });
      await Promise.all([loadChatThread(chatRequestId), loadChatOverview(), refreshNotificationsFromApi()]);

      return {
        ok: true,
        message: "Nachricht gesendet.",
        messageId: id,
      };
    } catch (error) {
      console.warn("NUUDL API sendChatMessage failed.", error);

      if (allowLocalFallbacks) {
      return {
        ok: true,
        message: "Nachricht vorgemerkt.",
        messageId: id,
      };
      }

      return {
        ok: false,
        message: "Nachricht konnte gerade nicht gesendet werden.",
        messageId: null,
      };
    }
  };

  const markChatThreadRead = useCallback(
    (chatRequestId: string) => {
      const readAt = new Date().toISOString();

      setChatMessages((current) => {
        let changed = false;

        const next = current.map((message) => {
          if (message.chatRequestId === chatRequestId && !isOwnChatMessage(message, installIdentityId, accountState?.id) && !message.readAt) {
            changed = true;
            return { ...message, readAt };
          }

          return message;
        });

        return changed ? next : current;
      });

      void consumerApi
        .markChatThreadRead({ chatRequestId })
        .then((response) => {
          setChatMessages((current) => [
            ...current.filter((message) => message.chatRequestId !== chatRequestId),
            ...response.messages,
          ]);
          void Promise.all([loadChatOverview(), refreshNotificationsFromApi()]).catch(() => undefined);
        })
        .catch((error) => {
          console.warn("NUUDL API chat/messages/read failed.", error);
          if (!allowLocalFallbacks) {
            void Promise.all([
              loadChatOverview().catch(() => undefined),
              loadChatThread(chatRequestId).catch(() => undefined),
              refreshNotificationsFromApi().catch(() => undefined),
            ]);
          }
        });
    },
    [accountState?.id, allowLocalFallbacks, installIdentityId, loadChatOverview, loadChatThread, refreshNotificationsFromApi],
  );

  const resolveLocation = () => {
    const geolocation = navigator.geolocation;

    if (!geolocation) {
      setLocation({
        status: "blocked",
        city: null,
        message: "Dein Browser bietet keine Geolocation. Fuer den Stadtfeed wird Standortfreigabe benoetigt.",
      });
      return;
    }

    setLocation({
      status: "loading",
      city: null,
      message: "Standort wird geprueft...",
    });

    geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          try {
            const response = await consumerApi.resolveGeo({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
            const resolvedCity = response.cityContext;

            hydratedCityRef.current = null;
            window.localStorage.setItem(CITY_STORAGE_KEY, resolvedCity.id);
            setLocation({
              status: "ready",
              city: resolvedCity,
              message: `Du bist jetzt mit ${resolvedCity.label} verbunden.`,
            });
          } catch (error) {
            console.warn("NUUDL API geo resolve failed.", error);

            if (allowLocalFallbacks) {
              const resolvedCity = resolveCityFromCoordinates(position.coords.latitude, position.coords.longitude);

              hydratedCityRef.current = null;
              window.localStorage.setItem(CITY_STORAGE_KEY, resolvedCity.id);
              setLocation({
                status: "ready",
                city: resolvedCity,
                message: `Du bist jetzt mit ${resolvedCity.label} verbunden.`,
              });
              return;
            }

            setLocation({
              status: "blocked",
              city: null,
              message: getApiErrorMessage(error, "Der Stadtwechsel ist gerade nicht verfuegbar. Bitte versuche es gleich erneut."),
            });
          }
        })();
      },
      () => {
        setLocation({
          status: "blocked",
          city: null,
          message: "Ohne Standort bleibt die App blockiert. Pruefe Browserrechte und versuche es erneut.",
        });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <ConsumerAppContext.Provider
      value={{
        booted,
        accountState,
        betaInviteRequired,
        demoPaymentsEnabled: allowFakePayments,
        hydrationMessage,
        hydrationStatus,
        gateAccepted,
        activeCity: location.city ?? getSeedCity(),
        location,
        installIdentityId,
        channelEntries,
        favoriteChannelIds,
        unreadNotifications: notificationItems.filter((item) => !item.read).length,
        feedPosts,
        feedReplies,
        notificationItems,
        walletBalance,
        ledgerEntries,
        walletTopupEntries,
        plusEntitlement,
        creatorApplicationState,
        creatorReviewEntries,
        payoutAccountEntries,
        payoutEntries,
        chatRequests,
        chatMessages,
        postVotes,
        replyVotes,
        acceptGate,
        resolveLocation,
        createPost,
        createReply,
        submitReport,
        votePost,
        voteReply,
        tipPost,
        markNotificationRead,
        markAllNotificationsRead,
        fakeTopupWallet,
        rememberRecentChannel,
        toggleChannelJoined,
        toggleFavoriteChannel,
        loadChannels,
        loadNotifications,
        searchCity,
        checkUsernameAvailability,
        loadThread,
        loadChatOverview,
        loadChatThread,
        createChatRequest,
        startEmailAccountLogin,
        verifyEmailAccountLogin,
        logoutAccount,
        logoutAccountDevice,
        updateAccountProfile,
        purchasePlus,
        applyForCreator,
        refreshCreatorState,
        respondChatRequest,
        sendChatMessage,
        markChatThreadRead,
        retryHydration,
      }}
    >
      {children}
    </ConsumerAppContext.Provider>
  );
}

export function useConsumerApp() {
  const context = useContext(ConsumerAppContext);

  if (!context) {
    throw new Error("useConsumerApp must be used within ConsumerAppProvider");
  }

  return context;
}

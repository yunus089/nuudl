"use client";

import type {
  AccountChannelPreferences,
  AccountSearchResult,
  Channel,
  CityContext,
  ChatMessage,
  ChatRequest,
  CreatorApplication,
  InstallIdentity,
  LedgerEntry,
  NotificationItem,
  PlusEntitlement,
  Post,
  Reply,
  SearchResults,
  Tip,
  VoteState,
  WalletBalance,
  WalletTopup,
} from "@veil/shared";

type ApiEnvelope = {
  error?: {
    message?: string;
  };
};

type ApiRequestInit = RequestInit & {
  bodyJson?: unknown;
  idempotent?: boolean;
  skipAuthRefresh?: boolean;
};

export type ConsumerMediaAsset = {
  kind: "image";
  url: string;
};

export type UploadedMediaAsset = ConsumerMediaAsset & {
  id: string;
  byteLength: number;
  contentType: string;
  fileName: string;
  sourceFileName?: string;
};

export type AccountIdentity = {
  id: string;
  channelPreferences: AccountChannelPreferences[];
  username: string;
  displayName: string;
  discoverable: boolean;
  emailMasked?: string | null;
  emailVerified: boolean;
  linkedInstallCount: number;
  createdAt: string;
  lastSeenAt: string;
};

export type ConsumerReportPayload = {
  cityId: string;
  reason: string;
  targetId: string;
  targetType: "post" | "reply" | "chat";
};

export type MeResponse = {
  cityContext: CityContext;
  creatorApplication: CreatorApplication;
  account?: AccountIdentity | null;
  installIdentity: InstallIdentity;
  notificationsUnreadCount: number;
  plus: PlusEntitlement;
  wallet: WalletBalance;
};

export type FeedResponse = {
  cityContext: CityContext;
  plus: PlusEntitlement;
  posts: Post[];
  sortMode: "new" | "commented" | "loud";
};

export type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
};

export type WalletResponse = {
  currentInstallIdentityId: string;
  ledger: LedgerEntry[];
  topups: WalletTopup[];
  tips: Tip[];
  wallet: WalletBalance;
  wallets: Record<string, WalletBalance>;
};

export type RegisterInstallResponse = {
  cityContext: CityContext;
  account?: AccountIdentity | null;
  installIdentity: InstallIdentity;
  session: SessionResponse;
};

export type SessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
};

export type RefreshSessionResponse = {
  installIdentity: InstallIdentity;
  session: SessionResponse;
};

export type AccountEmailStartResponse = {
  challengeId?: string;
  codePreview?: string;
  deliveryMode: "email" | "stub";
  message: string;
};

export type AccountEmailVerifyResponse = {
  account: AccountIdentity;
  installIdentity: InstallIdentity;
  message: string;
  session: SessionResponse;
};

export type AccountLogoutResponse = {
  account: null;
  installIdentity: InstallIdentity;
  message: string;
  session?: SessionResponse;
};

export type AccountProfileResponse = {
  account: AccountIdentity | null;
  channelPreferences?: AccountChannelPreferences | null;
};

export type AccountChannelPreferencesResponse = {
  cityContext: CityContext;
  preferences: AccountChannelPreferences;
};

export type UsernameCheckResponse = {
  available: boolean;
  normalizedUsername: string;
  reason?: string;
  username: string;
};

export type UsersSearchResponse = {
  query: string;
  users: AccountSearchResult[];
};

export type ChannelsResponse = {
  accountPreferences?: AccountChannelPreferences | null;
  channels: Channel[];
  cityContext: CityContext;
  joinedChannelIds: string[];
};

export type ChannelDetailResponse = {
  accountPreferences?: AccountChannelPreferences | null;
  channel: Channel;
  cityContext: CityContext;
  posts: Post[];
};

export type SearchResponse = {
  cityContext: CityContext;
  query: string;
  results: SearchResults;
};

export type ResolveGeoResponse = {
  cityContext: CityContext;
  confidence: number;
  geoLocked: boolean;
};

export type PostDetailResponse = {
  channel: Channel | null;
  cityContext: CityContext;
  post: Post;
  replies: Reply[];
};

export type ChatRequestsResponse = {
  requests: ChatRequest[];
};

export type ChatMessagesResponse = {
  chatRequestId: string;
  messages: ChatMessage[];
};

export type VoteResponse = VoteState;

export type TipResponse = {
  tip: Tip;
  wallet: WalletBalance;
};

export type WalletTopupResponse = {
  ledgerEntry: LedgerEntry;
  provider: "fake" | "stripe";
  wallet: WalletBalance;
};

export type PlusCheckoutResponse = {
  ledgerEntry: LedgerEntry;
  plan: "monthly" | "yearly";
  plus: PlusEntitlement;
  provider: "fake" | "stripe";
  wallet: WalletBalance;
};

export type CreatorStatusResponse = {
  adultGateAccepted: boolean;
  adultVerified: boolean;
  application: CreatorApplication;
  plus: PlusEntitlement;
};

export type EarningsResponse = {
  application: CreatorApplication;
  ledger: LedgerEntry[];
  tips: Tip[];
  wallet: WalletBalance;
};

export type UploadMediaResponse = {
  asset: UploadedMediaAsset;
};

export type ConsumerRuntimeConfig = {
  allowLocalFallbacks: boolean;
  apiBaseUrl: string;
  enableFakePayments: boolean;
};

const LOCAL_API_BASE_URL = "http://localhost:4000";
const isLoopbackHost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
const SESSION_STORAGE_KEY = "nuudl-install-session";
let runtimeConfig: ConsumerRuntimeConfig | null = null;

function readStoredSession(): SessionResponse | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as SessionResponse;
  } catch {
    return null;
  }
}

function writeStoredSession(session: SessionResponse) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

function normalizeRuntimeConfig(config: ConsumerRuntimeConfig): ConsumerRuntimeConfig {
  return {
    ...config,
    apiBaseUrl: config.apiBaseUrl.replace(/\/$/, ""),
  };
}

function getRuntimeConfig() {
  return runtimeConfig;
}

function requireApiBaseUrl() {
  if (runtimeConfig?.apiBaseUrl) {
    return runtimeConfig.apiBaseUrl;
  }

  if (typeof window !== "undefined" && isLoopbackHost(window.location.hostname)) {
    return LOCAL_API_BASE_URL;
  }

  throw new Error("NUUDL API Base URL ist nicht konfiguriert.");
}

const toAbsoluteApiUrl = (url: string) => {
  if (!url.startsWith("/")) {
    return url;
  }

  return `${requireApiBaseUrl()}${url}`;
};

const createIdempotencyKey = (scope: string) => {
  const normalized = scope.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${normalized}-${crypto.randomUUID()}`;
  }

  return `${normalized}-${Date.now()}`;
};

async function requestJson<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const apiBaseUrl = requireApiBaseUrl();
  const storedSession = readStoredSession();
  const headers = new Headers(init.headers);

  if (init.bodyJson !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (init.idempotent) {
    headers.set("Idempotency-Key", createIdempotencyKey(path));
  }

  if (storedSession?.accessToken) {
    headers.set("Authorization", `Bearer ${storedSession.accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    body: init.bodyJson !== undefined ? JSON.stringify(init.bodyJson) : init.body,
    cache: "no-store",
    headers,
    mode: "cors",
  });

  if (response.status === 401 && !init.skipAuthRefresh && storedSession?.refreshToken) {
    try {
      const refreshed = await refreshSession(storedSession.refreshToken);
      writeStoredSession(refreshed.session);
      return requestJson<T>(path, { ...init, skipAuthRefresh: true });
    } catch {
      clearStoredSession();
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as T & ApiEnvelope)
    : (null as T & ApiEnvelope | null);

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `API request failed (${response.status}).`);
  }

  return payload as T;
}

async function refreshSession(refreshToken: string): Promise<RefreshSessionResponse> {
  const apiBaseUrl = requireApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": createIdempotencyKey("/auth/refresh"),
    },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
    mode: "cors",
  });

  const payload = (await response.json()) as RefreshSessionResponse & ApiEnvelope;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Session refresh failed (${response.status}).`);
  }

  return payload;
}

function writeStoredSessionIfPresent(session?: SessionResponse | null) {
  if (session) {
    writeStoredSession(session);
  }
}

async function uploadBinary(path: string, file: File): Promise<UploadMediaResponse> {
  const apiBaseUrl = requireApiBaseUrl();
  const storedSession = readStoredSession();
  const headers = new Headers();
  headers.set("Content-Type", file.type || "application/octet-stream");
  headers.set("x-upload-filename", file.name || "upload");
  if (storedSession?.accessToken) {
    headers.set("Authorization", `Bearer ${storedSession.accessToken}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    body: file,
    cache: "no-store",
    headers,
    mode: "cors",
  });

  if (response.status === 401 && storedSession?.refreshToken) {
    try {
      const refreshed = await refreshSession(storedSession.refreshToken);
      writeStoredSession(refreshed.session);
      return uploadBinary(path, file);
    } catch {
      clearStoredSession();
    }
  }

  const payload = (await response.json()) as UploadMediaResponse & ApiEnvelope;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Upload failed (${response.status}).`);
  }

  return {
    asset: {
      ...payload.asset,
      url: toAbsoluteApiUrl(payload.asset.url),
    },
  };
}

export const consumerApi = {
  getRuntimeConfig,
  getFeed: (cityId: string) => requestJson<FeedResponse>(`/feed?cityId=${encodeURIComponent(cityId)}`),
  getChannels: (cityId: string) => requestJson<ChannelsResponse>(`/channels?cityId=${encodeURIComponent(cityId)}`),
  getChannelBySlug: (slug: string) => requestJson<ChannelDetailResponse>(`/channels/${encodeURIComponent(slug)}`),
  getMe: () => requestJson<MeResponse>("/me"),
  getNotifications: () => requestJson<NotificationsResponse>("/notifications"),
  getPostDetail: (postId: string) => requestJson<PostDetailResponse>(`/posts/${encodeURIComponent(postId)}`),
  getSearch: (cityId: string, query: string) =>
    requestJson<SearchResponse>(`/search?cityId=${encodeURIComponent(cityId)}&q=${encodeURIComponent(query)}`),
  getChatRequests: () => requestJson<ChatRequestsResponse>("/chat/requests"),
  getChatMessages: (chatRequestId: string) =>
    requestJson<ChatMessagesResponse>(`/chat/messages?chatRequestId=${encodeURIComponent(chatRequestId)}`),
  getCreatorStatus: () => requestJson<CreatorStatusResponse>("/creator/status"),
  getEarnings: () => requestJson<EarningsResponse>("/earnings"),
  getWallet: () => requestJson<WalletResponse>("/wallet"),
  startEmailLogin: (body: { email: string; displayName?: string; username?: string }) =>
    requestJson<AccountEmailStartResponse>("/auth/email/start", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  verifyEmailLogin: async (body: {
    code: string;
    email: string;
    displayName?: string;
    username?: string;
    channelPreferences?: Array<{
      cityId: string;
      favoriteChannelIds?: string[];
      joinedChannelIds?: string[];
      recentChannelIds?: string[];
    }>;
  }) => {
    const response = await requestJson<AccountEmailVerifyResponse>("/auth/email/verify", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    });
    writeStoredSessionIfPresent(response.session);
    return response;
  },
  logoutAccount: async () => {
    const response = await requestJson<AccountLogoutResponse>("/auth/logout", {
      bodyJson: {},
      idempotent: true,
      method: "POST",
    });
    writeStoredSessionIfPresent(response.session);
    return response;
  },
  getAccountMe: () => requestJson<AccountProfileResponse>("/account/me"),
  updateAccountProfile: (body: { displayName?: string; discoverable?: boolean }) =>
    requestJson<AccountProfileResponse>("/account/profile", {
      bodyJson: body,
      idempotent: true,
      method: "PATCH",
    }),
  getAccountChannelPreferences: (cityId: string) =>
    requestJson<AccountChannelPreferencesResponse>(`/account/channel-preferences?cityId=${encodeURIComponent(cityId)}`),
  updateAccountChannelPreferences: (body: {
    cityId: string;
    favoriteChannelIds?: string[];
    joinedChannelIds?: string[];
    recentChannelIds?: string[];
  }) =>
    requestJson<AccountChannelPreferencesResponse>("/account/channel-preferences", {
      bodyJson: body,
      idempotent: true,
      method: "PATCH",
    }),
  checkUsernameAvailability: (body: { username: string }) =>
    requestJson<UsernameCheckResponse>("/account/username/check", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  searchUsers: (query: string) =>
    requestJson<UsersSearchResponse>(`/users/search?q=${encodeURIComponent(query)}`),
  createChatRequest: (body: { body?: string; postId?: string; toInstallIdentityId: string }) =>
    requestJson<ChatRequest>("/chat/requests", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  createPost: (body: {
    body: string;
    channelId?: string | null;
    cityId: string;
    media?: ConsumerMediaAsset[];
    tags?: string[];
  }) =>
    requestJson<Post>("/posts", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  createReply: (body: { body: string; postId: string }) =>
    requestJson<Reply>("/replies", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  applyForCreator: (body: { adultVerified?: boolean; displayName?: string }) =>
    requestJson<CreatorApplication>("/creator/apply", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  respondChatRequest: (body: { action: "accept" | "decline"; requestId: string }) =>
    requestJson<ChatRequest>("/chat/requests/respond", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  markAllNotificationsRead: () =>
    requestJson<NotificationsResponse>("/notifications/read-all", {
      bodyJson: {},
      idempotent: true,
      method: "POST",
    }),
  markNotificationRead: (body: { notificationId: string }) =>
    requestJson<NotificationsResponse>("/notifications/read", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  registerInstall: async (body: { adultGateAccepted?: boolean; cityId?: string; citySlug?: string; lat?: number; lng?: number }) => {
    const response = await requestJson<RegisterInstallResponse>("/install/register", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    });
    writeStoredSessionIfPresent(response.session);
    return response;
  },
  resolveGeo: (body: { cityQuery?: string; lat?: number; lng?: number }) =>
    requestJson<ResolveGeoResponse>("/geo/resolve", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  tip: (body: { amountCents: number; recipientInstallIdentityId: string; targetId: string; targetType: "post" | "reply" }) =>
    requestJson<TipResponse>("/tips", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  report: (body: ConsumerReportPayload) =>
    requestJson<{ ok?: boolean }>("/reports", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  topupWallet: (body: { amountCents: number; provider?: "fake" | "stripe" }) =>
    requestJson<WalletTopupResponse>("/wallet/topups", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  checkoutPlus: (body: { plan: "monthly" | "yearly"; provider?: "fake" | "stripe" }) =>
    requestJson<PlusCheckoutResponse>("/plus/checkout", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  sendChatMessage: (body: { body: string; chatRequestId: string; media?: ConsumerMediaAsset[] }) =>
    requestJson<ChatMessage>("/chat/messages", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  markChatThreadRead: (body: { chatRequestId: string }) =>
    requestJson<ChatMessagesResponse>("/chat/messages/read", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
  loadRuntimeConfig: async () => {
    const response = await fetch("/api/runtime-config", {
      cache: "no-store",
      method: "GET",
    });

    const payload = (await response.json()) as ConsumerRuntimeConfig & ApiEnvelope;

    if (!response.ok) {
      throw new Error(payload?.error?.message ?? `Runtime config failed (${response.status}).`);
    }

    runtimeConfig = normalizeRuntimeConfig(payload);
    return runtimeConfig;
  },
  uploadMedia: (file: File) => uploadBinary("/media/uploads", file),
  vote: (body: { targetId: string; targetType: "post" | "reply"; value: -1 | 0 | 1 }) =>
    requestJson<VoteResponse>("/votes", {
      bodyJson: body,
      idempotent: true,
      method: "POST",
    }),
};

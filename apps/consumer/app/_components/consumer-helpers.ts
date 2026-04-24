import type { ChatRequest, NotificationItem, Post, Reply } from "@veil/shared";
import type { RootTab, RootView } from "./consumer-types";

export const rootTabs: RootTab[] = [
  { id: "feed", label: "Feed", glyph: "F" },
  { id: "discover", label: "Channels", glyph: "@" },
  { id: "chat", label: "Chat", glyph: "C" },
  { id: "alerts", label: "Mitteilungen", glyph: "!" },
  { id: "me", label: "Ich", glyph: "I" },
];

export function formatTime(value: string) {
  const date = new Date(value);
  const now = new Date();

  const timeLabel = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTargetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startOfToday.getTime() - startOfTargetDay.getTime()) / 86400000);

  if (dayDifference === 0) {
    return `Heute ${timeLabel}`;
  }

  if (dayDifference === 1) {
    return `Gestern ${timeLabel}`;
  }

  const dateLabel = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);

  return `${dateLabel}. ${timeLabel}`;
}

export function titleForView(view: RootView, cityLabel: string) {
  switch (view) {
    case "discover":
      return "Channels";
    case "chat":
      return "Chat";
    case "alerts":
      return "Mitteilungen";
    case "me":
      return "Ich";
    default:
      return cityLabel;
  }
}

export function unreadCount(items: NotificationItem[]) {
  return items.filter((item) => !item.read).length;
}

type PublicActorSource = Pick<Post | Reply, "authorLabel" | "accountDisplayName" | "accountIsCreator" | "accountUsername">;

export function getPublicActorPresentation(actor: PublicActorSource) {
  if (!actor.accountIsCreator) {
    return {
      badgeLabel: null,
      primaryLabel: actor.authorLabel,
      secondaryLabel: null,
    };
  }

  const primaryLabel = actor.accountDisplayName?.trim() || (actor.accountUsername ? `@${actor.accountUsername}` : actor.authorLabel);
  const secondaryLabel = actor.accountUsername ? `@${actor.accountUsername}` : null;

  return {
    badgeLabel: "Creator",
    primaryLabel,
    secondaryLabel:
      secondaryLabel && secondaryLabel.toLowerCase() !== primaryLabel.trim().toLowerCase() ? secondaryLabel : null,
  };
}

export function getChatCounterpartPresentation(request: ChatRequest | null | undefined) {
  if (!request) {
    return {
      badgeLabel: null,
      primaryLabel: "Person",
      secondaryLabel: null,
    };
  }

  if (!request.counterpartIsCreator) {
    return {
      badgeLabel: null,
      primaryLabel: request.counterpartLabel ?? "Person",
      secondaryLabel: null,
    };
  }

  const primaryLabel =
    request.counterpartDisplayName?.trim() ||
    (request.counterpartUsername ? `@${request.counterpartUsername}` : request.counterpartLabel ?? "Creator");
  const secondaryLabel = request.counterpartUsername ? `@${request.counterpartUsername}` : null;

  return {
    badgeLabel: "Creator",
    primaryLabel,
    secondaryLabel:
      secondaryLabel && secondaryLabel.toLowerCase() !== primaryLabel.trim().toLowerCase() ? secondaryLabel : null,
  };
}

export function autoResizeTextarea(element: HTMLTextAreaElement | null, minHeight?: number, maxHeight?: number) {
  if (!element) {
    return;
  }

  element.style.height = "0px";

  const nextHeight = Math.max(minHeight ?? 0, Math.min(element.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY));
  element.style.height = `${nextHeight}px`;
}

export function isHomeView(view: RootView) {
  return view === "feed" || view === "discover";
}

export function goBackOrFallback(
  navigator: {
    back: () => void;
    push: (href: string) => void;
  },
  fallbackHref: string,
) {
  if (typeof window === "undefined") {
    navigator.push(fallbackHref);
    return;
  }

  const referrer = document.referrer;

  if (referrer.startsWith(window.location.origin)) {
    navigator.back();
    return;
  }

  navigator.push(fallbackHref);
}

export async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }

      reject(new Error("Unexpected file reader result."));
    };

    reader.readAsDataURL(file);
  });
}

export function findActiveChatRequest({
  requests,
  postId,
  installIdentityId,
  targetInstallIdentityId,
}: {
  requests: ChatRequest[];
  postId: string;
  installIdentityId: string;
  targetInstallIdentityId: string;
}) {
  return (
    requests.find(
      (request) =>
        request.postId === postId &&
        request.status !== "declined" &&
        ((request.fromInstallIdentityId === installIdentityId && request.toInstallIdentityId === targetInstallIdentityId) ||
          (request.toInstallIdentityId === installIdentityId && request.fromInstallIdentityId === targetInstallIdentityId)),
    ) ?? null
  );
}

export async function openOrCreateChatFromPost({
  createChatRequest,
  fallbackRoute,
  installIdentityId,
  navigate,
  post,
  requests,
}: {
  createChatRequest: (input: {
    body?: string;
    postId: string;
    toInstallIdentityId: string;
  }) => Promise<{ ok: boolean; message: string; requestId: string | null }>;
  fallbackRoute: string;
  installIdentityId: string;
  navigate: (href: string) => void;
  post: Post;
  requests: ChatRequest[];
}) {
  const recipientInstallIdentityId = post.recipientInstallIdentityId;

  if (!recipientInstallIdentityId || recipientInstallIdentityId === installIdentityId) {
    navigate(fallbackRoute);
    return;
  }

  const existingRequest = findActiveChatRequest({
    requests,
    postId: post.id,
    installIdentityId,
    targetInstallIdentityId: recipientInstallIdentityId,
  });

  if (existingRequest) {
    navigate(`/chat/${existingRequest.id}`);
    return;
  }

  const result = await createChatRequest({
    body: `Private Anfrage zu ${post.id}`,
    postId: post.id,
    toInstallIdentityId: recipientInstallIdentityId,
  });

  if (result.requestId) {
    navigate(`/chat/${result.requestId}`);
    return;
  }

  navigate(fallbackRoute);
}

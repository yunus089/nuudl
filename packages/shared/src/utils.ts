import { cities, seedState } from "./mock-data";
import type {
  AuditLogEntry,
  Channel,
  CityHealthSnapshot,
  CityContext,
  FeatureFlag,
  NotificationItem,
  Post,
  Reply,
  SearchResults,
  SortMode,
} from "./types";

const numberFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function formatEuro(cents: number): string {
  return numberFormatter.format(cents / 100);
}

export function calculatePlatformSplit(grossCents: number, platformCutBps = 2000) {
  const platformFeeCents = Math.round((grossCents * platformCutBps) / 10000);
  return {
    grossCents,
    platformFeeCents,
    creatorNetCents: grossCents - platformFeeCents,
  };
}

function hashString(value: string) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 2147483647;
  }

  return Math.abs(hash);
}

export function createThreadAnonLabel(postId: string, installIdentityId: string) {
  const normalized = `${postId}:${installIdentityId}`.trim().toLowerCase();
  const suffix = (hashString(normalized) % 90) + 10;
  return `Anon ${String(suffix).padStart(2, "0")}`;
}

export function resolveCityFromCoordinates(lat: number, lng: number): CityContext {
  let bestCity = cities[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const city of cities) {
    const distance = Math.hypot(city.lat - lat, city.lng - lng);
    if (distance < bestDistance) {
      bestCity = city;
      bestDistance = distance;
    }
  }

  return bestCity;
}

export function getSortedPosts(posts: Post[], replies: Reply[], sort: SortMode): Post[] {
  const replyCountMap = new Map<string, number>();

  for (const reply of replies) {
    replyCountMap.set(reply.postId, (replyCountMap.get(reply.postId) ?? 0) + 1);
  }

  const visiblePosts = posts.filter((post) => post.moderation !== "blocked");

  if (sort === "commented") {
    return [...visiblePosts].sort(
      (left, right) => (replyCountMap.get(right.id) ?? right.replyCount) - (replyCountMap.get(left.id) ?? left.replyCount),
    );
  }

  if (sort === "loud") {
    return [...visiblePosts].sort((left, right) => right.score - left.score);
  }

  return [...visiblePosts].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export function buildSearchResults(query: string, cityId: string): SearchResults {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return {
      channels: seedState.channels.filter((channel) => channel.cityId === cityId),
      hashtags: ["creator", "night", "muenchen", "money"],
      posts: seedState.posts.filter((post) => post.cityId === cityId),
    };
  }

  const channels = seedState.channels.filter((channel) => {
    return channel.cityId === cityId && `${channel.slug} ${channel.title} ${channel.description}`.toLowerCase().includes(normalized);
  });

  const posts = seedState.posts.filter((post) => {
    return post.cityId === cityId && `${post.body} ${post.tags.join(" ")}`.toLowerCase().includes(normalized);
  });

  const hashtags = Array.from(
    new Set(
      seedState.posts
        .flatMap((post) => post.tags)
        .filter((tag) => tag.toLowerCase().includes(normalized)),
    ),
  );

  return { channels, hashtags, posts };
}

export function filterChannelsByCity(cityId: string, collection: Channel[]): Channel[] {
  return collection.filter((channel) => channel.cityId === cityId);
}

export function countUnreadNotifications(items: NotificationItem[]): number {
  return items.filter((item) => !item.read).length;
}

export function findCityHealth(cityId: string): CityHealthSnapshot | undefined {
  return seedState.cityHealth.find((item) => item.cityId === cityId);
}

export function getFeatureFlag(key: string): FeatureFlag | undefined {
  return seedState.featureFlags.find((flag) => flag.key === key);
}

export function countOpenReports(cityId?: string): number {
  return seedState.reports.filter((report) => report.status !== "dismissed" && (!cityId || report.cityId === cityId)).length;
}

export function buildAuditTrail(entries: AuditLogEntry[]): AuditLogEntry[] {
  return [...entries].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function getFeatureFlagsByCategory(
  flags: FeatureFlag[],
  category: "growth" | "money" | "safety" | "ops"
): FeatureFlag[] {
  return flags.filter((flag) => {
    if (category === "growth") {
      return flag.key.includes("explorer") || flag.key.includes("chat");
    }

    if (category === "money") {
      return flag.key.includes("payout") || flag.key.includes("wallet") || flag.key.includes("creator");
    }

    if (category === "safety") {
      return flag.key.includes("adult") || flag.key.includes("moderation");
    }

    return flag.audience === "admins" || flag.key.includes("ops");
  });
}

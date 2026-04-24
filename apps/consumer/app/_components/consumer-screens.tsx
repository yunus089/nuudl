"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cities,
  filterChannelsByCity,
  formatEuro,
  getSortedPosts,
  plusProducts,
  type ChatRequest,
  type Channel,
  type CityContext,
  type CreatorApplication,
  type CreatorReview,
  type LedgerEntry,
  type NotificationItem,
  type Payout,
  type PayoutAccount,
  type Post,
  type PlusEntitlement,
  type Reply,
  type SearchResults,
  type WalletBalance,
  type WalletTopup,
} from "@veil/shared";
import { consumerApi, type AccountIdentity } from "../_lib/consumer-api";
import { ChevronRightIcon, ConsumerSheet, VoteDownIcon, VoteUpIcon } from "./mobile-shell";
import {
  autoResizeTextarea,
  formatTime,
  getChatCounterpartPresentation,
  getPublicActorPresentation,
  readFileAsDataUrl,
} from "./consumer-helpers";
import type { FeedSort, LocationState } from "./consumer-types";

const RECENT_CHANNEL_LIMIT = 5;
type SettingsDocumentId = "support" | "rules" | "privacy" | "imprint";
type ComposerMediaAttachment = {
  id: string;
  kind: "image";
  file: File;
  fileName: string;
  url: string;
};
type DiscoverAccount = NonNullable<SearchResults["accounts"]>[number];

function recentChannelsStorageKey(cityId: string) {
  return `nuudl-recent-channels:${cityId}`;
}

function composerDraftStorageKey(cityId: string) {
  return `nuudl-composer-draft:${cityId}`;
}

function readRecentChannelIds(cityId: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(recentChannelsStorageKey(cityId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is string => typeof value === "string").slice(0, RECENT_CHANNEL_LIMIT);
  } catch {
    return [];
  }
}

function writeRecentChannelIds(cityId: string, channelIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(recentChannelsStorageKey(cityId), JSON.stringify(channelIds.slice(0, RECENT_CHANNEL_LIMIT)));
  } catch {
    // Ignore storage errors in the composer flow.
  }
}

function emptyComposerDraft() {
  return {
    body: "",
    step: "compose" as "compose" | "channel",
    selectedChannelId: null as string | null,
    channelQuery: "",
  };
}

function describeAccountVisibility(account: DiscoverAccount) {
  if (account.isCreator) {
    return "Öffentlich als Creator sichtbar";
  }

  if (account.visibilityReason === "discoverable" || account.discoverable) {
    return "Öffentlich auffindbares Profil";
  }

  return "Nur über Suche sichtbar";
}

function getAccountFallbackInitial(account: DiscoverAccount) {
  const source = account.displayName || account.username || "@";
  return source.trim().charAt(0).toUpperCase() || "@";
}

function readComposerDraft(cityId: string): {
  body: string;
  step: "compose" | "channel";
  selectedChannelId: string | null;
  channelQuery: string;
} {
  if (typeof window === "undefined") {
    return emptyComposerDraft();
  }

  try {
    const raw = window.localStorage.getItem(composerDraftStorageKey(cityId));
    if (!raw) {
      return emptyComposerDraft();
    }

    const parsed = JSON.parse(raw) as {
      body?: unknown;
      step?: unknown;
      selectedChannelId?: unknown;
      channelQuery?: unknown;
    };

    return {
      body: typeof parsed.body === "string" ? parsed.body : "",
      step: parsed.step === "channel" ? "channel" : "compose",
      selectedChannelId: typeof parsed.selectedChannelId === "string" ? parsed.selectedChannelId : null,
      channelQuery: typeof parsed.channelQuery === "string" ? parsed.channelQuery : "",
    };
  } catch {
    return emptyComposerDraft();
  }
}

function writeComposerDraft(
  cityId: string,
  draft: {
    body: string;
    step: "compose" | "channel";
    selectedChannelId: string | null;
    channelQuery: string;
  },
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const hasContent = Boolean(
      draft.body.trim() || draft.channelQuery.trim() || draft.selectedChannelId || draft.step === "channel",
    );

    if (!hasContent) {
      window.localStorage.removeItem(composerDraftStorageKey(cityId));
      return;
    }

    window.localStorage.setItem(composerDraftStorageKey(cityId), JSON.stringify(draft));
  } catch {
    // Ignore storage errors in the composer flow.
  }
}

function clearComposerDraft(cityId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(composerDraftStorageKey(cityId));
  } catch {
    // Ignore storage errors in the composer flow.
  }
}

async function createComposerMediaAttachment(file: File): Promise<ComposerMediaAttachment> {
  const dataUrl = await readFileAsDataUrl(file);

  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}`,
    kind: "image",
    file,
    fileName: file.name || "Bild",
    url: dataUrl,
  };
}

function sortChannelsByWave1Priority(left: Channel, right: Channel, recentIndex: Map<string, number>) {
  const leftRecent = recentIndex.get(left.id);
  const rightRecent = recentIndex.get(right.id);

  if (leftRecent !== undefined || rightRecent !== undefined) {
    if (leftRecent === undefined) {
      return 1;
    }
    if (rightRecent === undefined) {
      return -1;
    }
    return leftRecent - rightRecent;
  }

  return (
    Number(right.joined) - Number(left.joined) ||
    Number(right.isVerified) - Number(left.isVerified) ||
    right.memberCount - left.memberCount ||
    left.slug.localeCompare(right.slug)
  );
}

function sortChannelsByWeekPriority(
  left: Channel,
  right: Channel,
  favoriteIndex: Map<string, number>,
  recentIndex: Map<string, number>,
) {
  const leftFavorite = favoriteIndex.get(left.id);
  const rightFavorite = favoriteIndex.get(right.id);

  if (leftFavorite !== undefined || rightFavorite !== undefined) {
    if (leftFavorite === undefined) {
      return 1;
    }
    if (rightFavorite === undefined) {
      return -1;
    }
    return leftFavorite - rightFavorite;
  }

  return sortChannelsByWave1Priority(left, right, recentIndex);
}

const settingsDocuments = {
  support: {
    eyebrow: "Hilfe und Support",
    title: "Schnelle Hilfe in der App",
    sections: [
      {
        heading: "Postfach und Hinweise",
        body: "Antworten, Tips, Chat-Anfragen und Schutz-Hinweise landen direkt im Postfach. Du musst nicht zwischen mehreren Bereichen suchen.",
      },
      {
        heading: "Standort und Zugang",
        body: "NUUDL bleibt an eine feste Stadt gebunden. Wenn der Standort fehlt, blockiert die App den Feed bewusst, bis die Freigabe wieder da ist.",
      },
      {
        heading: "Wallet und Creator",
        body: "Topups, Tips, Creator-Status und Plus laufen in separaten Bereichen. Wenn dort etwas hakt, findest du den aktuellen Status immer zuerst in der App.",
      },
    ],
  },
  rules: {
    eyebrow: "Community-Regeln",
    title: "Was auf NUUDL bleibt",
    sections: [
      {
        heading: "Anonym, aber nicht grenzenlos",
        body: "Anonyme Inhalte sind erlaubt. Gewaltandrohungen, Doxxing, Zwang, Minderjährige und klar missbräuchliche Inhalte werden entfernt.",
      },
      {
        heading: "Chats und Antworten",
        body: "Direkte Chats starten aus einem Beitrag oder einer Antwort. Wer blockiert, meldet oder nicht freigibt, muss keinen weiteren Kontakt akzeptieren.",
      },
      {
        heading: "Moderation",
        body: "Meldungen, Schutz-Hinweise und Moderationsentscheidungen werden dokumentiert. Sichtbarkeit kann eingeschränkt werden, auch wenn ein Inhalt nicht sofort gelöscht wird.",
      },
    ],
  },
  privacy: {
    eyebrow: "Datenschutz",
    title: "Welche Daten lokal und im Produkt wichtig sind",
    sections: [
      {
        heading: "Standort",
        body: "Der Feed hängt an einer Stadt. Der Standort dient der Zuordnung zu diesem Ort und nicht einem öffentlichen Profil.",
      },
      {
        heading: "Anonyme Installation",
        body: "Deine Installation lebt aktuell vor allem auf diesem Gerät. Ohne Sicherung bedeutet ein Gerätewechsel auch einen neuen anonymen Zugang.",
      },
      {
        heading: "Wallet, Creator und KYC",
        body: "Für Geldflüsse gelten strengere Prüfungen. Wallet-, Creator- und spätere KYC-Daten folgen anderen Regeln als anonyme Feed-Nutzung.",
      },
    ],
  },
  imprint: {
    eyebrow: "Impressum",
    title: "Rechtliche Angaben zu NUUDL",
    sections: [
      {
        heading: "Produkt",
        body: "NUUDL ist eine mobile Browser-App für lokale, anonyme Communities mit Feed, Chat und Creator-Tips.",
      },
      {
        heading: "Betrieb",
        body: "Rechtliche Kontakt- und Betreiberangaben werden an dieser Stelle gesammelt, damit sie nicht über mehrere Flächen verteilt sind.",
      },
      {
        heading: "Verantwortung",
        body: "Moderation, Wallet-Logik und Creator-Prüfung gehören zu denselben Produktbereichen und werden deshalb auch hier nachvollziehbar gebündelt.",
      },
    ],
  },
} as const;

function formatCreatorStatus(status: CreatorApplication["status"]) {
  switch (status) {
    case "draft":
      return "Noch offen";
    case "submitted":
      return "Eingereicht";
    case "under_review":
      return "Wird geprueft";
    case "approved":
      return "Freigeschaltet";
    case "rejected":
      return "Anpassungen gewuenscht";
    default:
      return status;
  }
}

function formatKycState(state: CreatorApplication["kycState"]) {
  switch (state) {
    case "not_started":
      return "Offen";
    case "pending":
      return "Wird geprueft";
    case "verified":
      return "Bestätigt";
    default:
      return state;
  }
}

function formatPayoutState(state: CreatorApplication["payoutState"]) {
  switch (state) {
    case "not_ready":
      return "Offen";
    case "ready":
      return "Bereit";
    case "paused":
      return "Pausiert";
    default:
      return state;
  }
}

function formatLedgerKind(kind: LedgerEntry["kind"]) {
  switch (kind) {
    case "topup":
      return "Aufladung";
    case "tip_out":
      return "Tip gesendet";
    case "tip_in":
      return "Tip erhalten";
    case "platform_fee":
      return "Plattform-Anteil";
    case "plus_purchase":
      return "NUUDL Plus";
    case "payout":
      return "Auszahlung";
    default:
      return kind;
  }
}

function formatLedgerStatus(status: LedgerEntry["status"]) {
  switch (status) {
    case "pending":
      return "In Bearbeitung";
    case "available":
      return "Verfuegbar";
    case "paid_out":
      return "Ausgezahlt";
    default:
      return status;
  }
}

function formatLedgerAmount(entry: LedgerEntry) {
  const amount = formatEuro(Math.abs(entry.netCents));

  return entry.netCents > 0 ? `+${amount}` : entry.netCents < 0 ? `-${amount}` : amount;
}

function formatReviewDecision(decision: CreatorReview["decision"]) {
  switch (decision) {
    case "approve":
      return "Freigegeben";
    case "reject":
      return "Abgelehnt";
    case "request_changes":
      return "Aenderungen gewuenscht";
    default:
      return decision;
  }
}

function formatPayoutStatus(status: Payout["status"]) {
  switch (status) {
    case "queued":
      return "Vorgemerkt";
    case "processing":
      return "In Auszahlung";
    case "paid":
      return "Ausgezahlt";
    case "failed":
      return "Fehlgeschlagen";
    case "held":
      return "Gehalten";
    default:
      return status;
  }
}

function formatPayoutAccountState(state: PayoutAccount["state"]) {
  switch (state) {
    case "draft":
      return "Offen";
    case "review_required":
      return "In Bearbeitung";
    case "ready":
      return "Bereit";
    case "paused":
      return "Pausiert";
    default:
      return state;
  }
}

function formatNotificationKind(kind: NotificationItem["kind"]) {
  switch (kind) {
    case "reply":
      return "Antwort";
    case "vote":
      return "Vote";
    case "tip":
      return "Tip";
    case "chat_request":
      return "Chat";
    case "moderation":
      return "Schutz";
    default:
      return "App";
  }
}

function ListRow({
  title,
  subtitle,
  right,
  rightTone = "default",
  note,
  onClick,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  rightTone?: "default" | "positive" | "danger" | "warm";
  note?: string;
  onClick?: () => void;
}) {
  const isInteractive = Boolean(onClick);
  const rightClassName =
    rightTone === "positive"
      ? "listMeta listMetaPositive"
      : rightTone === "danger"
        ? "listMeta listMetaDanger"
        : rightTone === "warm"
          ? "listMeta listMetaWarm"
          : "listMeta";

  const content = (
    <>
      <div className="listText">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <div className="listRight">
        {right ? <span className={rightClassName}>{right}</span> : null}
        {isInteractive ? (
          <span className="rowChevron">
            {note ?? <ChevronRightIcon className="rowChevronIcon" />}
          </span>
        ) : null}
      </div>
    </>
  );

  if (!isInteractive) {
    return <div className="listRow listRowStatic">{content}</div>;
  }

  return (
    <button className="listRow" onClick={onClick} type="button">
      {content}
    </button>
  );
}

export function FeedCard({
  post,
  channel,
  replyCount,
  userVote = 0,
  onOpenPost,
  onOpenAuthor,
  onVote,
}: {
  post: Post;
  channel?: Channel;
  replyCount: number;
  userVote?: -1 | 0 | 1;
  onOpenPost?: () => void;
  onOpenAuthor?: () => void;
  onVote?: (value: -1 | 1) => void;
}) {
  const interactive = typeof onOpenPost === "function";
  const [mediaOpen, setMediaOpen] = useState(false);
  const author = getPublicActorPresentation(post);
  const footerStats = [`${replyCount} Antworten`];

  if (post.tipTotalCents > 0) {
    footerStats.push(`${formatEuro(post.tipTotalCents)} Tips`);
  }

  return (
    <>
      <article className="feedCard">
        <div
          className={interactive ? "feedMain feedMainInteractive" : "feedMain"}
          onClick={onOpenPost}
          onKeyDown={(event) => {
            if (interactive && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onOpenPost();
            }
          }}
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : undefined}
        >
          <div className="feedTop">
            <div className="feedMeta">
              {onOpenAuthor && post.recipientInstallIdentityId && author.primaryLabel !== "Du" ? (
                <button
                  className="feedAuthorButton"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenAuthor();
                  }}
                  type="button"
                >
                  {author.primaryLabel}
                </button>
              ) : (
                <strong className="feedAuthorLabel">{author.primaryLabel}</strong>
              )}
              {author.secondaryLabel ? <span className="feedMetaSecondary">{author.secondaryLabel}</span> : null}
              {author.badgeLabel ? <span className="feedMetaTag">{author.badgeLabel}</span> : null}
              <span className="feedMetaSecondary">@{channel?.slug ?? "main"}</span>
              <span className="feedMetaSecondary">{formatTime(post.createdAt)}</span>
              {post.isPinned ? <span className="feedMetaSecondary">Wichtig</span> : null}
            </div>
          </div>

          <p className="feedBody">{post.body}</p>

          {post.media[0] ? (
            <button
              aria-label="Bild vergrößern"
              className="feedMediaButton"
              onClick={(event) => {
                event.stopPropagation();
                setMediaOpen(true);
              }}
              onContextMenu={(event) => event.preventDefault()}
              type="button"
            >
              <div
                className="feedMedia"
                style={{
                  backgroundImage: `linear-gradient(180deg, rgba(13, 15, 20, 0.08), rgba(13, 15, 20, 0.78)), url(${post.media[0].url})`,
                }}
              />
              <span className="feedMediaHint">Ansehen</span>
            </button>
          ) : null}

          <div className="feedFooter">
            {footerStats.map((stat) => (
              <span className="feedFooterStat" key={stat}>
                {stat}
              </span>
            ))}
          </div>
        </div>

        <div className="voteRail">
          <button
            aria-label="Beitrag hochvoten"
            className={userVote === 1 ? "voteButton voteButtonActive" : "voteButton"}
            onClick={() => onVote?.(1)}
            type="button"
          >
            <VoteUpIcon className="voteIconSvg" />
          </button>
          <strong>{post.score}</strong>
          <button
            aria-label="Beitrag runtervoten"
            className={userVote === -1 ? "voteButton voteButtonActive" : "voteButton"}
            onClick={() => onVote?.(-1)}
            type="button"
          >
            <VoteDownIcon className="voteIconSvg" />
          </button>
        </div>
      </article>

      {mediaOpen && post.media[0] ? (
        <div
          className="mediaLightboxBackdrop"
          onClick={() => setMediaOpen(false)}
          onContextMenu={(event) => event.preventDefault()}
          role="presentation"
        >
          <div className="mediaLightboxPanel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <button className="mediaLightboxClose" onClick={() => setMediaOpen(false)} type="button">
              Schließen
            </button>
            <div className="mediaLightboxWarning">Kein Screenshot. Kein Repost.</div>
            <div className="mediaLightboxFrame">
              <img
                alt="Post Bild"
                className="mediaLightboxImage"
                draggable={false}
                onContextMenu={(event) => event.preventDefault()}
                src={post.media[0].url}
              />
              <div className="mediaLightboxWatermark">NUUDL • NO SCREENSHOTS</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function FeedScreen({
  activeCity,
  activeSort,
  channelEntries,
  posts,
  replies,
  postVotes,
  onSortChange,
  onOpenPost,
  onOpenAuthorChat,
  onVotePost,
}: {
  activeCity: CityContext;
  activeSort: FeedSort;
  channelEntries: Channel[];
  posts: Post[];
  replies: Reply[];
  postVotes: Record<string, -1 | 0 | 1>;
  onSortChange: (value: FeedSort) => void;
  onOpenPost: (postId: string) => void;
  onOpenAuthorChat?: (post: Post) => void;
  onVotePost: (postId: string, value: -1 | 1) => void;
}) {
  const cityChannels = filterChannelsByCity(activeCity.id, channelEntries);
  const cityPosts = posts.filter((post) => post.cityId === activeCity.id);
  const sortedPosts = getSortedPosts(
    cityPosts,
    replies,
    activeSort === "Kommentiert" ? "commented" : activeSort === "Lauteste" ? "loud" : "new",
  );
  const replyCountByPost = useMemo(() => {
    const counts = new Map<string, number>();

    for (const reply of replies) {
      counts.set(reply.postId, (counts.get(reply.postId) ?? 0) + 1);
    }

    return counts;
  }, [replies]);

  return (
    <section className="screenStack">
      <div className="feedSortRow">
        {(["Neu", "Kommentiert", "Lauteste"] as FeedSort[]).map((tab) => (
          <button
            className={tab === activeSort ? "sortPill sortPillActive" : "sortPill"}
            key={tab}
            onClick={() => onSortChange(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="feedStack feedHomeList">
        {sortedPosts.length ? (
          sortedPosts.map((post) => (
            <FeedCard
              key={post.id}
              post={post}
              channel={cityChannels.find((channel) => channel.id === post.channelId)}
              onOpenAuthor={onOpenAuthorChat ? () => onOpenAuthorChat(post) : undefined}
              onOpenPost={() => onOpenPost(post.id)}
              onVote={(value) => onVotePost(post.id, value)}
              replyCount={replyCountByPost.get(post.id) ?? post.replyCount}
              userVote={postVotes[post.id] ?? 0}
            />
          ))
        ) : (
          <div className="emptyState">
            <strong>Hier ist noch nichts. Mach den Anfang.</strong>
            <p className="supportCopy">Neue Beiträge aus {activeCity.label} tauchen hier automatisch auf.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function DiscoverScreen({
  activeCity,
  accounts,
  channels,
  favoriteChannelIds,
  hashtags,
  query,
  posts,
  onQueryChange,
  onOpenChannel,
  onOpenAccountPreview,
  onOpenPost,
  onOpenAuthorChat,
  onToggleFavoriteChannel,
}: {
  activeCity: CityContext;
  accounts: DiscoverAccount[];
  channels: Channel[];
  favoriteChannelIds: string[];
  hashtags: string[];
  query: string;
  posts: Post[];
  onQueryChange: (value: string) => void;
  onOpenChannel: (slug: string) => void;
  onOpenAccountPreview: (account: DiscoverAccount) => void;
  onOpenPost: (postId: string) => void;
  onOpenAuthorChat?: (post: Post) => void;
  onToggleFavoriteChannel: (channelId: string) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const favoriteIndex = useMemo(
    () => new Map(favoriteChannelIds.map((channelId, index) => [channelId, index] as const)),
    [favoriteChannelIds],
  );
  const channelRows = useMemo(
    () =>
      [...channels]
        .sort((left, right) => sortChannelsByWeekPriority(left, right, favoriteIndex, new Map()))
        .map((channel) => ({
          key: channel.id,
          slug: channel.slug,
          title: channel.title,
          members: channel.memberCount,
          meta: channel.isVerified ? "Verifiziert" : channel.isAdultOnly ? "NSFW" : channel.joined ? "Aktiv" : "",
          isFavorite: favoriteIndex.has(channel.id),
        })),
    [channels, favoriteIndex],
  );
  const favoriteChannels = useMemo(() => channelRows.filter((channel) => channel.isFavorite).slice(0, 4), [channelRows]);
  const visibleChannels = normalizedQuery
    ? channelRows.filter((channel) => `${channel.slug} ${channel.title} ${channel.meta}`.toLowerCase().includes(normalizedQuery))
    : channelRows.slice(0, 6);
  const matchingHashtags = useMemo(() => {
    if (normalizedQuery) {
      return hashtags;
    }

    const counts = new Map<string, number>();

    for (const post of posts) {
      for (const tag of post.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [hashtags, normalizedQuery, posts]);
  const matchingPosts = normalizedQuery ? posts : [];
  const matchingAccounts = normalizedQuery ? accounts : [];
  const hasSearchResults = Boolean(visibleChannels.length || matchingHashtags.length || matchingPosts.length || matchingAccounts.length);
  const renderChannelRow = (channel: (typeof channelRows)[number]) => (
    <div className="channelListRow" key={channel.key}>
      <button className="channelListMainButton" onClick={() => onOpenChannel(channel.slug)} type="button">
        <span className="channelDot">@</span>
        <div className="channelRowMain">
          <strong>@{channel.slug}</strong>
          <span>{channel.title}</span>
        </div>
        <div className="channelRowSide">
          {channel.meta ? <span className="channelTag">{channel.meta}</span> : null}
          <strong className="channelCount">{channel.members}</strong>
        </div>
      </button>
      <button
        className={channel.isFavorite ? "channelFavoriteButton channelFavoriteButtonActive" : "channelFavoriteButton"}
        onClick={() => onToggleFavoriteChannel(channel.key)}
        type="button"
      >
        {channel.isFavorite ? "Favorit" : "Merken"}
      </button>
    </div>
  );

  return (
    <section className="screenStack">
      <div className="screenHeaderBlock discoverSearchBlock">
        <div className="discoverSearchShell">
          <input
            className="searchInput denseSearchInput"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={`@Handle, Creator, Channels oder #Tags in ${activeCity.label}`}
          />
          {normalizedQuery ? (
            <button className="searchClearButton" onClick={() => onQueryChange("")} type="button">
              Leeren
            </button>
          ) : null}
        </div>
        <p className="searchHint">Suche direkt nach @Handles, öffentlichen Creator-Profilen oder Themen aus deiner Stadt.</p>
      </div>

      {!normalizedQuery && favoriteChannels.length ? (
        <div className="resultSection">
          <div className="sectionLabel screenHeaderBlock screenHeaderBlockCompact">
            <div>
              <strong>Favoriten</strong>
              <span>{favoriteChannels.length} gemerkte Channels aus {activeCity.label}</span>
            </div>
          </div>
          <div className="channelList">{favoriteChannels.map((channel) => renderChannelRow(channel))}</div>
        </div>
      ) : null}

      <div className="resultSection">
        <div className="sectionLabel screenHeaderBlock screenHeaderBlockCompact">
          <div>
            <strong>{normalizedQuery ? "Channels" : "Empfohlen"}</strong>
            <span>{normalizedQuery ? `${visibleChannels.length} Treffer` : `Beliebte Channels aus ${activeCity.label}`}</span>
          </div>
        </div>
        <div className="channelList">
          {visibleChannels.length ? (
            visibleChannels.map((channel) => renderChannelRow(channel))
          ) : normalizedQuery ? (
            <div className="emptyState emptyStateInline emptyStateSoft searchEmptyState">
              <strong>Keine Channels.</strong>
              <p className="supportCopy">Leere die Suche oder probiere einen anderen Begriff.</p>
              <button className="inlineAction" onClick={() => onQueryChange("")} type="button">
                Suche loeschen
              </button>
            </div>
          ) : (
            <div className="emptyState emptyStateInline emptyStateSoft searchEmptyState">
              <strong>Noch keine Channel-Empfehlungen.</strong>
              <p className="supportCopy">Beliebte Bereiche aus deiner Stadt sammeln wir hier für dich.</p>
            </div>
          )}
        </div>
      </div>

      {matchingHashtags.length ? (
        <div className="resultSection">
          <div className="sectionLabel screenHeaderBlock screenHeaderBlockCompact">
            <div>
              <strong>{normalizedQuery ? "Tags" : "Beliebt"}</strong>
              <span>{normalizedQuery ? `${matchingHashtags.length} Treffer` : `${matchingHashtags.length} Tags`}</span>
            </div>
          </div>

          <div className="chipRow resultChipRow">
            {matchingHashtags.map((tag) => (
              <button className="chip chipMuted" key={tag} onClick={() => onQueryChange(tag)} type="button">
                #{tag}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {normalizedQuery ? (
        <>
          {matchingAccounts.length ? (
            <div className="resultSection">
              <div className="sectionLabel screenHeaderBlock screenHeaderBlockCompact">
                <div>
                  <strong>Menschen & Handles</strong>
                  <span>{matchingAccounts.length} Treffer</span>
                </div>
              </div>

              <div className="channelList">
                {matchingAccounts.slice(0, 6).map((account) => (
                  <div className="channelListRow" key={account.accountId}>
                    <button className="channelListMainButton searchAccountButton" onClick={() => onOpenAccountPreview(account)} type="button">
                      <span className={account.avatarUrl ? "channelDot channelDotAvatar" : "channelDot"}>
                        {account.avatarUrl ? (
                          <img
                            alt={`${account.displayName || account.username} Avatar`}
                            className="searchAccountAvatar"
                            src={account.avatarUrl}
                          />
                        ) : (
                          getAccountFallbackInitial(account)
                        )}
                      </span>
                      <div className="channelRowMain">
                        <strong>{account.displayName || `@${account.username}`}</strong>
                        <span>@{account.username} • {describeAccountVisibility(account)}</span>
                        {account.bio ? <p className="searchAccountBio">{account.bio}</p> : null}
                      </div>
                      <div className="channelRowSide">
                        {account.isCreator ? <span className="channelTag">Creator</span> : null}
                        {account.cityLabel ? <span className="channelTag">{account.cityLabel}</span> : null}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {matchingPosts.length ? (
            <div className="resultSection">
              <div className="sectionLabel screenHeaderBlock screenHeaderBlockCompact">
                <div>
                  <strong>Beiträge</strong>
                  <span>{matchingPosts.length} Treffer</span>
                </div>
              </div>

              <div className="threadStack">
                {matchingPosts.slice(0, 6).map((post) => {
                  const author = getPublicActorPresentation(post);

                  return (
                    <div
                      className="searchPostRow"
                      key={post.id}
                      onClick={() => onOpenPost(post.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpenPost(post.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="searchPostTop">
                        {onOpenAuthorChat && post.recipientInstallIdentityId ? (
                          <button
                            className="feedAuthorButton searchAuthorButton"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenAuthorChat(post);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.stopPropagation();
                              }
                            }}
                            type="button"
                          >
                            {author.primaryLabel}
                          </button>
                        ) : (
                          <strong>{author.primaryLabel}</strong>
                        )}
                        {author.secondaryLabel ? <span className="searchPostMeta">{author.secondaryLabel}</span> : null}
                        {author.badgeLabel ? <span className="feedMetaTag">{author.badgeLabel}</span> : null}
                        <span className="searchPostMeta">{formatTime(post.createdAt)}</span>
                      </div>
                      <p>{post.body}</p>
                      <span className="searchPostFooter">
                        {post.replyCount} Antworten • {formatEuro(post.tipTotalCents)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!hasSearchResults ? (
            <div className="emptyState emptyStateInline emptyStateSoft searchEmptyState">
              <strong>Keine Treffer.</strong>
              <p className="supportCopy">Versuch es mit @Handles, Channel-Namen, Hashtags oder einem anderen Stichwort.</p>
              <button className="inlineAction" onClick={() => onQueryChange("")} type="button">
                Suche löschen
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function AlertsScreen({
  notifications,
  onOpenNotification,
  onMarkAllRead,
}: {
  notifications: NotificationItem[];
  onOpenNotification: (item: NotificationItem) => void;
  onMarkAllRead: () => void;
}) {
  return (
    <section className="screenStack">
      <div className="sectionLabel screenHeaderBlock">
        <div>
          <strong>Alerts</strong>
          <span>{notifications.filter((item) => !item.read).length} ungelesen</span>
        </div>
        <button className="inlineAction" onClick={onMarkAllRead} type="button">
          Alles lesen
        </button>
      </div>

      <div className="noticeList">
        {notifications.map((item: NotificationItem) => (
          <button
            className={item.read ? "noticeRow noticeRowRead" : "noticeRow"}
            key={item.id}
            onClick={() => onOpenNotification(item)}
            type="button"
          >
            <span className={`noticeDot noticeDot${item.kind === "tip" ? "Tip" : item.kind === "chat_request" ? "Chat" : item.kind === "moderation" ? "Safety" : "Default"}`} />
            <div className="noticeCopy">
              <strong>{formatNotificationKind(item.kind)}</strong>
              <span>{item.message}</span>
            </div>
            <div className="noticeSide">
              {!item.read ? <span className="noticeUnread">Neu</span> : null}
              <span className="noticeTime">{formatTime(item.createdAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ChatScreen({
  currentAccountId,
  installIdentityId,
  chatRequests,
  onOpenThread,
  posts,
}: {
  currentAccountId?: string | null;
  installIdentityId: string;
  chatRequests: ChatRequest[];
  onOpenThread: (requestId: string) => void;
  posts: Post[];
}) {
  const [activeTab, setActiveTab] = useState<"requests" | "threads">("requests");
  const pendingRequests = chatRequests.filter((request) => request.status === "pending");
  const acceptedThreads = chatRequests.filter((request) => request.status === "accepted");
  const rows = useMemo(() => {
    const source = activeTab === "threads" ? acceptedThreads : pendingRequests;
    return [...source].sort((left, right) =>
      (right.lastActivityAt ?? right.lastMessageAt ?? right.createdAt).localeCompare(
        left.lastActivityAt ?? left.lastMessageAt ?? left.createdAt,
      ),
    );
  }, [acceptedThreads, activeTab, pendingRequests]);

  return (
    <section className="screenStack">
      <div className="screenHeaderBlock">
        <h2 className="screenHeading">Chat</h2>
        <div className="chatTabRow">
          <button
            className={activeTab === "requests" ? "chatTabButton chatTabButtonActive" : "chatTabButton"}
            onClick={() => setActiveTab("requests")}
            type="button"
          >
            Anfragen
          </button>
          <button
            className={activeTab === "threads" ? "chatTabButton chatTabButtonActive" : "chatTabButton"}
            onClick={() => setActiveTab("threads")}
            type="button"
          >
            Chats
          </button>
        </div>
      </div>

      <>
        <div className="chatList">
          {rows.length ? (
            rows.map((request) => {
              const relatedPost = posts.find((post) => post.id === request.postId) ?? null;
              const counterpart = getChatCounterpartPresentation(request);
              const isOutgoing =
                (Boolean(currentAccountId) && request.fromAccountId === currentAccountId) ||
                request.fromInstallIdentityId === installIdentityId;
              const previewLabel = request.lastMessagePreview
                ? `${request.lastMessageOwn ? "Du: " : ""}${request.lastMessagePreview}`
                : request.status === "accepted"
                  ? `Nachrichten mit ${counterpart.primaryLabel}.`
                  : isOutgoing
                    ? `Wartet auf ${counterpart.primaryLabel}.`
                    : `${counterpart.primaryLabel} möchte mit dir schreiben.`;
              const unreadCount = request.unreadCount ?? 0;
              const activityTime = request.lastActivityAt ?? request.lastMessageAt ?? request.createdAt;

              return (
                <button
                  className={unreadCount > 0 ? "chatListRow chatListRowUnread" : "chatListRow"}
                  key={request.id}
                  onClick={() => onOpenThread(request.id)}
                  type="button"
                >
                  <div className="chatRowMain">
                    <div className="chatRowTop">
                      <div className="chatCounterpartHeader">
                        <strong>{counterpart.primaryLabel}</strong>
                        {counterpart.secondaryLabel ? <span className="chatCounterpartMeta">{counterpart.secondaryLabel}</span> : null}
                        {counterpart.badgeLabel ? <span className="channelTag">{counterpart.badgeLabel}</span> : null}
                      </div>
                      <span
                        className={
                          request.status === "accepted"
                            ? "chatStatus chatStatusAccepted"
                            : isOutgoing
                              ? "chatStatus chatStatusMuted"
                              : "chatStatus chatStatusPending"
                        }
                      >
                        {request.status === "accepted" ? "Aktiv" : isOutgoing ? "Wartet" : "Neu"}
                      </span>
                    </div>
                    <span>{previewLabel}</span>
                  </div>
                  <div className="chatRowMeta">
                    <span>
                      {relatedPost ? `zu: ${relatedPost.body.slice(0, 38)}${relatedPost.body.length > 38 ? "..." : ""}` : "Direkte Nachricht"}
                    </span>
                    <div className="chatRowMetaSide">
                      <span className="chatRowTime">{formatTime(activityTime)}</span>
                      {unreadCount > 0 ? <span className="chatUnreadBadge">{unreadCount}</span> : null}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="emptyState emptyStateSoft">
              <strong>{activeTab === "threads" ? "Keine Nachrichten." : "Keine Anfragen."}</strong>
              <p className="supportCopy">
                {activeTab === "threads"
                  ? "Sobald jemand freigibt, erscheint die Unterhaltung hier."
                  : "Direkte Chats startest du aus einem Beitrag oder einer Antwort."}
              </p>
            </div>
          )}
        </div>
      </>
    </section>
  );
}


export function MeScreen({
  accountState,
  walletBalance,
  creatorApplication,
  plusEntitlement,
  onOpenWallet,
  onOpenCreator,
  onOpenPlus,
  onOpenSettings,
}: {
  accountState: AccountIdentity | null;
  walletBalance: WalletBalance;
  creatorApplication: CreatorApplication;
  plusEntitlement: PlusEntitlement;
  onOpenWallet: () => void;
  onOpenCreator: () => void;
  onOpenPlus: () => void;
  onOpenSettings: () => void;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const creatorSummary =
    creatorApplication.status === "approved"
      ? "Freigeschaltet"
      : creatorApplication.status === "under_review"
        ? "Wird geprueft"
      : creatorApplication.status === "rejected"
          ? "Anpassungen gewuenscht"
          : "Noch offen";

  return (
    <section className="screenStack">
      <div className="screenHeaderBlock">
        <h2 className="screenHeading">Ich</h2>
      </div>

      <div className="card meSummaryCard">
        <div className="sectionLabel">
          <div>
            <strong>Dein Bereich</strong>
            <span>Guthaben, Creator-Zugang und App-Einstellungen an einem Ort.</span>
          </div>
        </div>
        <div className="summaryList">
          <div className="summaryItem">
            <span>Account</span>
            <strong>{accountState ? `@${accountState.username}` : "Nur lokal"}</strong>
          </div>
          <div className="summaryItem">
            <span>Profilname</span>
            <strong>{accountState?.displayName || accountState?.username || "Noch keiner"}</strong>
          </div>
          <div className="summaryItem">
            <span>Guthaben</span>
            <strong>{formatEuro(walletBalance.availableCents)}</strong>
          </div>
          <div className="summaryItem">
            <span>Creator</span>
            <strong>{creatorSummary}</strong>
          </div>
          <div className="summaryItem">
            <span>Plus</span>
            <strong>{plusEntitlement.active ? "Aktiv" : "Aus"}</strong>
          </div>
        </div>
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Bereiche</strong>
            <span>Wallet, Creator, Plus und App auf einen Blick.</span>
          </div>
        </div>
        <div className="rowStack">
          <ListRow
            onClick={onOpenSettings}
            right={accountState ? `@${accountState.username}` : "Neu"}
            subtitle={accountState ? "E-Mail, Username und Sichtbarkeit verwalten" : "E-Mail sichern für Recovery und neue Geräte"}
            title={accountState ? "Account" : "E-Mail sichern"}
          />
          <ListRow
            onClick={onOpenWallet}
            right={formatEuro(walletBalance.availableCents)}
            subtitle="Aufladen, Tip-Verlauf und Ausgaben ansehen"
            title="Guthaben"
          />
          <ListRow
            onClick={onOpenCreator}
            right={creatorSummary}
            subtitle={`${formatKycState(creatorApplication.kycState)} • ${formatPayoutState(creatorApplication.payoutState)}`}
            title="Creator"
          />
          <ListRow
            onClick={onOpenPlus}
            right={plusEntitlement.active ? "Aktiv" : "Starten"}
            subtitle="Explorer, Bildchat und weniger Limits"
            title="NUUDL Plus"
          />
          <ListRow
            onClick={onOpenSettings}
            subtitle="Datenschutz, Hilfe, Regeln und Installation"
            title="Einstellungen"
          />
          <ListRow
            onClick={() => setFeedback("Antworten, Tips und Schutz-Hinweise findest du direkt im Postfach in der App.")}
            subtitle="Antworten, Tips, Chats und Hinweise im Postfach"
            title="Benachrichtigungen"
          />
        </div>
      </div>

      <div className="card sheetListCard dangerListCard">
        <div className="rowStack">
          <ListRow
            onClick={() => setFeedback("Das Zurücksetzen bleibt gesperrt, bis Sicherung und Wiederzugang sauber zusammenspielen.")}
            subtitle="Bleibt gesperrt, bis Sicherung und Wiederzugang bereit sind"
            title="Installation zurücksetzen"
          />
        </div>
      </div>

      {feedback ? (
        <div className="screenHeaderBlock">
          <p className="supportCopy inlineFeedback">{feedback}</p>
        </div>
      ) : null}
    </section>
  );
}

export function LocationSheet({
  activeCity,
  location,
  onClose,
  onResolve,
}: {
  activeCity: CityContext;
  location: LocationState;
  onClose: () => void;
  onResolve: () => void;
}) {
  const orderedCities = [...cities].sort(
    (left, right) => Number(right.id === activeCity.id) - Number(left.id === activeCity.id),
  );

  return (
    <ConsumerSheet title="Standort" onClose={onClose}>
      <div className="card sheetSummaryCard">
        <div className="sectionLabel">
          <div>
            <strong>Aktuelle Stadt</strong>
            <span>Feed, Chat und Suche bleiben an deinen Ort gebunden.</span>
          </div>
        </div>
        <div className="locationSummary">
          <div className="locationSummaryItem">
            <span>Stadt</span>
            <strong>{activeCity.label}</strong>
          </div>
          <div className="locationSummaryItem">
            <span>Land</span>
            <strong>{activeCity.countryCode}</strong>
          </div>
          <div className="locationSummaryItem">
            <span>Explorer</span>
            <strong>{activeCity.isExplorerEnabled ? "An" : "Aus"}</strong>
          </div>
        </div>
        <p className="supportCopy">{location.message}</p>
        <button className="primaryButton" onClick={onResolve} type="button">
          Standort jetzt pruefen
        </button>
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Stadtliste</strong>
            <span>Dein aktiver Ort bleibt oben, weitere Staedte lassen sich vorerst nur lesen.</span>
          </div>
        </div>
        <div className="cityAvailabilityList">
          {orderedCities.map((city) => (
            <div
              className={city.id === activeCity.id ? "cityAvailabilityRow cityAvailabilityRowActive" : "cityAvailabilityRow"}
              key={city.id}
            >
              <div className="cityAvailabilityMain">
                <strong>{city.label}</strong>
                <span>{city.id === activeCity.id ? "Dein aktiver Ort" : "Nur lesen"}</span>
              </div>
              <div className="cityAvailabilitySide">
                <span
                  className={
                    city.id === activeCity.id
                      ? "stateTag stateTagActive"
                      : city.isExplorerEnabled
                        ? "stateTag stateTagMuted"
                        : "stateTag stateTagLocked"
                  }
                >
                  {city.id === activeCity.id ? "Aktiv" : city.isExplorerEnabled ? "Lesen" : "Gesperrt"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ConsumerSheet>
  );
}

export function PlusSheet({
  onClose,
  plusEntitlement,
  walletBalance,
  onPurchase,
  paymentsEnabled,
}: {
  onClose: () => void;
  plusEntitlement: PlusEntitlement;
  walletBalance: WalletBalance;
  onPurchase: (productId: string) => Promise<{ ok: boolean; message: string }>;
  paymentsEnabled: boolean;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submittingProductId, setSubmittingProductId] = useState<string | null>(null);

  return (
    <ConsumerSheet title="NUUDL Plus" onClose={onClose}>
      <div className="heroCard heroCardWarm">
        <p className="eyebrow">Plus</p>
        <h1>Mehr Chat, Medien und Explorer</h1>
        <p className="heroCopy">Schalte Explorer, Bildchat und weniger Limits direkt in der App frei.</p>
        <div className="miniMetaRow miniMetaRowChannel">
          <span>{plusEntitlement.active ? "Plus aktiv" : "Monatlich kuendbar"}</span>
          <span>{formatEuro(walletBalance.availableCents)} Wallet</span>
        </div>
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Enthaelt</strong>
            <span>Was Plus direkt in der App freischaltet.</span>
          </div>
        </div>
        <div className="rowStack">
          <ListRow
            right={plusEntitlement.explorer ? "Frei" : "Plus"}
            rightTone={plusEntitlement.explorer ? "positive" : "warm"}
            subtitle="Andere Staedte lesen und entdecken"
            title="Explorer"
          />
          <ListRow
            right={plusEntitlement.imageChat ? "Frei" : "Plus"}
            rightTone={plusEntitlement.imageChat ? "positive" : "warm"}
            subtitle="Bilder in privaten Chats senden"
            title="Bildchat"
          />
          <ListRow
            right={plusEntitlement.noAds ? "Frei" : "Plus"}
            rightTone={plusEntitlement.noAds ? "positive" : "warm"}
            subtitle="Mehr Freiheiten für Chat und Profil"
            title="Weniger Limits"
          />
        </div>
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Pakete</strong>
            <span>{plusProducts.length} Optionen</span>
          </div>
        </div>
        {!paymentsEnabled ? (
          <p className="sheetActionNote">Plus-Kaeufe sind in dieser Closed Beta noch nicht freigeschaltet.</p>
        ) : null}
        <div className="sheetOptionList">
          {plusProducts.map((product) => (
            <button
              className="sheetOptionButton"
              key={product.id}
              disabled={!paymentsEnabled || submittingProductId === product.id}
              onClick={async () => {
                setSubmittingProductId(product.id);
                const result = await onPurchase(product.id);
                setSubmittingProductId(null);
                setFeedback(result.message);
              }}
              type="button"
            >
              <div className="sheetOptionMain">
                <strong>{product.title}</strong>
                <span>{product.features.join(" • ")}</span>
              </div>
              <div className="sheetOptionSide">
                <strong>{submittingProductId === product.id ? "..." : formatEuro(product.priceCents)}</strong>
                <span>{plusEntitlement.active ? "Verwalten" : "Starten"}</span>
              </div>
            </button>
          ))}
        </div>
        {feedback ? <p className="supportCopy inlineFeedback">{feedback}</p> : null}
      </div>
    </ConsumerSheet>
  );
}

export function WalletSheet({
  onClose,
  walletBalance,
  ledgerEntries,
  walletTopupEntries,
  onTopup,
  paymentsEnabled,
}: {
  onClose: () => void;
  walletBalance: WalletBalance;
  ledgerEntries: LedgerEntry[];
  walletTopupEntries: WalletTopup[];
  onTopup: (grossCents: number) => Promise<{ ok: boolean; message: string }>;
  paymentsEnabled: boolean;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <ConsumerSheet title="Wallet" onClose={onClose}>
      <div className="card sheetSummaryCard">
        <div className="sectionLabel">
          <div>
            <strong>Wallet</strong>
            <span>Für Tips, Plus und Creator-Auszahlungen.</span>
          </div>
        </div>
        <div className="summaryList">
          <div className="summaryItem">
            <span>Guthaben</span>
            <strong>{formatEuro(walletBalance.availableCents)}</strong>
          </div>
          <div className="summaryItem">
            <span>In Bearbeitung</span>
            <strong>{formatEuro(walletBalance.pendingCents)}</strong>
          </div>
          <div className="summaryItem">
            <span>Bisher verdient</span>
            <strong>{formatEuro(walletBalance.lifetimeEarnedCents)}</strong>
          </div>
        </div>
      </div>

      <div className="card sheetActionCard">
        <div className="sectionLabel">
          <div>
            <strong>Guthaben aufladen</strong>
            <span>{paymentsEnabled ? "Testguthaben direkt ins Wallet laden" : "In dieser Closed Beta noch gesperrt"}</span>
          </div>
        </div>
        <p className="sheetActionNote">
          {paymentsEnabled
            ? "Aufladungen landen direkt im Wallet, damit du Tips und Plus sofort nutzen kannst."
            : "Wallet-Topups werden erst mit dem echten Payment-Provider freigeschaltet."}
        </p>
        <div className="sheetOptionList">
          {[1000, 2500, 5000].map((amount) => (
            <button
              className="sheetOptionButton"
              key={amount}
              disabled={!paymentsEnabled}
              onClick={async () => {
                const result = await onTopup(amount);
                setFeedback(result.message);
              }}
              type="button"
            >
              <div className="sheetOptionMain">
                <strong>{formatEuro(amount)}</strong>
                <span>Direkt für Tips und Plus</span>
              </div>
              <div className="sheetOptionSide">
                <span>Aufladen</span>
              </div>
            </button>
          ))}
        </div>
        {feedback ? <p className="supportCopy inlineFeedback">{feedback}</p> : null}
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Verlauf</strong>
            <span>{ledgerEntries.length} Eintraege</span>
          </div>
        </div>
        <div className="rowStack">
          {ledgerEntries.map((entry) => (
            <ListRow
              key={entry.id}
              title={formatLedgerKind(entry.kind)}
              subtitle={`${formatLedgerStatus(entry.status)} • ${formatTime(entry.createdAt)}`}
              right={formatLedgerAmount(entry)}
              rightTone={entry.netCents > 0 ? "positive" : entry.netCents < 0 ? "danger" : "default"}
            />
          ))}
        </div>
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Aufladungen</strong>
            <span>{walletTopupEntries.length} Eintraege</span>
          </div>
        </div>
        <div className="rowStack">
          {walletTopupEntries.map((topup) => (
            <ListRow
              key={topup.id}
              right={formatEuro(topup.grossCents)}
              rightTone="positive"
              subtitle={`${topup.status} • ${formatTime(topup.createdAt)}`}
              title={topup.provider === "fake" ? "Wallet-Aufladung" : topup.provider}
            />
          ))}
        </div>
      </div>
    </ConsumerSheet>
  );
}

export function CreatorSheet({
  onClose,
  creatorApplication,
  creatorReviews,
  payoutAccounts,
  payouts,
  onApply,
}: {
  onClose: () => void;
  creatorApplication: CreatorApplication;
  creatorReviews: CreatorReview[];
  payoutAccounts: PayoutAccount[];
  payouts: Payout[];
  onApply: () => Promise<{ ok: boolean; message: string }>;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const creatorIdentity = creatorApplication.accountDisplayName || creatorApplication.accountUsername || "Noch lokal";
  const creatorHandle = creatorApplication.accountUsername ? `@${creatorApplication.accountUsername}` : "Noch kein Handle";
  const actionLabel =
    creatorApplication.status === "draft"
      ? "Creator werden"
      : creatorApplication.status === "rejected"
        ? "Erneut senden"
        : creatorApplication.status === "approved"
          ? "Status ansehen"
          : "Status ansehen";
  const statusCopy =
    creatorApplication.status === "draft"
      ? "Bevor du Tips erhalten kannst, müssen Alter, Identität und Auszahlung bestätigt sein."
      : creatorApplication.status === "approved"
        ? "Dein Creator-Zugang ist aktiv. Neue Tips und Auszahlungen laufen jetzt ueber deinen freigeschalteten Status."
        : creatorApplication.status === "rejected"
          ? "Dein letzter Antrag braucht Anpassungen. Du kannst ihn danach erneut senden."
          : "Dein Antrag ist eingereicht und wartet auf Entscheidung.";

  return (
    <ConsumerSheet title="Creator" onClose={onClose}>
      <div className="card sheetSummaryCard">
        <div className="sectionLabel">
          <div>
            <strong>Antrag</strong>
            <span>{formatCreatorStatus(creatorApplication.status)}</span>
          </div>
        </div>
        <div className="summaryList">
          <div className="summaryItem">
            <span>Identität</span>
            <strong>{creatorIdentity}</strong>
          </div>
          <div className="summaryItem">
            <span>Handle</span>
            <strong>{creatorHandle}</strong>
          </div>
          <div className="summaryItem">
            <span>18+</span>
            <strong>{creatorApplication.adultVerified ? "Ja" : "Nein"}</strong>
          </div>
          <div className="summaryItem">
            <span>KYC</span>
            <strong>{formatKycState(creatorApplication.kycState)}</strong>
          </div>
          <div className="summaryItem">
            <span>Auszahlung</span>
            <strong>{formatPayoutState(creatorApplication.payoutState)}</strong>
          </div>
        </div>
      </div>

      <div className="card sheetActionCard">
        <div className="sectionLabel">
          <div>
            <strong>Naechster Schritt</strong>
            <span>{actionLabel}</span>
          </div>
        </div>
        <p className="sheetActionNote">{statusCopy}</p>
        <button
          className="primaryButton"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true);
            const result = await onApply();
            setSubmitting(false);
            setFeedback(result.message);
          }}
          type="button"
        >
          {submitting ? "Lade..." : actionLabel}
        </button>
        {feedback ? <p className="supportCopy inlineFeedback">{feedback}</p> : null}
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Verlauf</strong>
            <span>{creatorReviews.length} Entscheidungen</span>
          </div>
        </div>
        {creatorReviews.length ? (
          <div className="rowStack">
            {creatorReviews.map((review) => (
              <ListRow
                key={review.id}
                right={formatTime(review.createdAt)}
                rightTone={review.decision === "approve" ? "positive" : review.decision === "reject" ? "danger" : "warm"}
                subtitle={review.note}
                title={formatReviewDecision(review.decision)}
              />
            ))}
          </div>
        ) : (
          <div className="emptyState emptyStateInline emptyStateSoft">
            <strong>Noch kein Verlauf.</strong>
            <p className="supportCopy">Bearbeitung und Entscheidungen zu deinem Antrag erscheinen hier.</p>
          </div>
        )}
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Auszahlung</strong>
            <span>{payoutAccounts.length} Eintraege</span>
          </div>
        </div>
        {payoutAccounts.length ? (
          <div className="rowStack">
            {payoutAccounts.map((account) => (
              <ListRow
                key={account.id}
                right={formatPayoutAccountState(account.state)}
                rightTone={account.state === "ready" ? "positive" : account.state === "paused" ? "danger" : "warm"}
                subtitle={account.provider === "adult_psp" ? "Auszahlungsweg" : "Manuelle Auszahlung"}
                title={account.label}
              />
            ))}
          </div>
        ) : (
          <div className="emptyState emptyStateInline emptyStateSoft">
            <strong>Noch kein Auszahlungsweg hinterlegt.</strong>
            <p className="supportCopy">Auszahlungswege werden sichtbar, sobald dein Creator-Zugang freigegeben ist.</p>
          </div>
        )}
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Auszahlungen</strong>
            <span>{payouts.length} Eintraege</span>
          </div>
        </div>
        {payouts.length ? (
          <div className="rowStack">
            {payouts.map((payout) => (
              <ListRow
                key={payout.id}
                right={formatEuro(payout.netCents)}
                rightTone={payout.status === "paid" ? "positive" : payout.status === "failed" ? "danger" : "warm"}
                subtitle={payoutAccounts.find((account) => account.id === payout.payoutAccountId)?.label ?? "Auszahlungsweg"}
                title={formatPayoutStatus(payout.status)}
              />
            ))}
          </div>
        ) : (
          <div className="emptyState emptyStateInline emptyStateSoft">
            <strong>Noch keine Auszahlungen verfuegbar.</strong>
            <p className="supportCopy">Verfuegbare Auszahlungen erscheinen hier zusammen mit ihrem Status.</p>
          </div>
        )}
      </div>
    </ConsumerSheet>
  );
}

export function AccountPreviewSheet({
  account,
  onClose,
}: {
  account: DiscoverAccount;
  onClose: () => void;
}) {
  const visibilityLabel = describeAccountVisibility(account);

  return (
    <ConsumerSheet title={account.isCreator ? "Creator-Profil" : "Profil-Vorschau"} onClose={onClose}>
      <div className="card sheetSummaryCard">
        <div className="profilePreviewHero">
          <div className={account.avatarUrl ? "profilePreviewAvatar profilePreviewAvatarFilled" : "profilePreviewAvatar"}>
            {account.avatarUrl ? (
              <img
                alt={`${account.displayName || account.username} Avatar`}
                className="profilePreviewAvatarImage"
                src={account.avatarUrl}
              />
            ) : (
              <span>{getAccountFallbackInitial(account)}</span>
            )}
          </div>
          <div className="profilePreviewCopy">
            <strong>{account.displayName || `@${account.username}`}</strong>
            <span>@{account.username}</span>
            <p className="supportCopy">{visibilityLabel}</p>
          </div>
        </div>
        <div className="summaryList">
          <div className="summaryItem">
            <span>Öffentliche Rolle</span>
            <strong>{account.isCreator ? "Creator" : "Profil"}</strong>
          </div>
          <div className="summaryItem">
            <span>Handle</span>
            <strong>@{account.username}</strong>
          </div>
          <div className="summaryItem">
            <span>Stadt</span>
            <strong>{account.cityLabel || "Nicht sichtbar"}</strong>
          </div>
        </div>
        <p className="sheetActionNote">
          {account.bio
            ? account.bio
            : account.isCreator
              ? "Dieses Creator-Profil ist öffentlich auffindbar und nutzt eine stabile Handle-Identität."
              : "Dieses Profil ist über die Suche sichtbar, ohne den anonymen Feed-Charakter aufzugeben."}
        </p>
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Identität</strong>
            <span>Öffentlich lesbar, Feed bleibt weiter anon-first.</span>
          </div>
        </div>
        <div className="rowStack">
          <ListRow
            right={account.isCreator ? "Creator" : "Profil"}
            rightTone={account.isCreator ? "positive" : "default"}
            subtitle={visibilityLabel}
            title="Sichtbarkeit"
          />
          <ListRow
            right={account.cityLabel || "Offen"}
            rightTone="default"
            subtitle="Die Suche zieht den Stadtkontext aus dem verknüpften Hauptgerät."
            title="Suchkontext"
          />
        </div>
      </div>
    </ConsumerSheet>
  );
}

export function SettingsSheet({
  accountState,
  onCheckUsernameAvailability,
  onClose,
  onLogoutAccount,
  onLogoutAccountDevice,
  onStartEmailAccountLogin,
  onUpdateAccountProfile,
  onVerifyEmailAccountLogin,
}: {
  accountState: AccountIdentity | null;
  onCheckUsernameAvailability: (input: { username: string }) => Promise<{
    available: boolean;
    normalizedUsername: string;
    reason?: string;
    username: string;
  }>;
  onClose: () => void;
  onLogoutAccount: () => Promise<{ ok: boolean; message: string }>;
  onLogoutAccountDevice: (installIdentityId: string) => Promise<{ ok: boolean; message: string }>;
  onStartEmailAccountLogin: (input: { email: string; displayName?: string; username?: string }) => Promise<{
    codePreview?: string | null;
    ok: boolean;
    message: string;
  }>;
  onUpdateAccountProfile: (input: { displayName?: string; bio?: string; discoverable?: boolean }) => Promise<{
    ok: boolean;
    message: string;
  }>;
  onVerifyEmailAccountLogin: (input: { email: string; code: string; displayName?: string; username?: string }) => Promise<{
    ok: boolean;
    message: string;
  }>;
}) {
  const [activeDocument, setActiveDocument] = useState<keyof typeof settingsDocuments | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState(accountState?.username ?? "");
  const [displayName, setDisplayName] = useState(accountState?.displayName ?? "");
  const [bio, setBio] = useState(accountState?.bio ?? "");
  const [discoverable, setDiscoverable] = useState(accountState?.discoverable ?? false);
  const [code, setCode] = useState("");
  const [codePreview, setCodePreview] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"start" | "verify" | "save" | "logout" | "device" | null>(null);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [usernameFeedback, setUsernameFeedback] = useState<{
    available: boolean;
    message: string;
    tone: "muted" | "positive" | "danger";
  }>({
    available: false,
    message: "Nutze ein eigenes @Handle für Suche, Creator-Identität und neue Geräte.",
    tone: "muted",
  });
  const activeDocumentContent = activeDocument ? settingsDocuments[activeDocument] : null;
  const hasAccount = Boolean(accountState);
  const linkedInstallCount = accountState?.linkedInstalls?.length ?? accountState?.linkedInstallCount ?? 0;
  const currentLinkedInstall = accountState?.linkedInstalls?.find((install) => install.current) ?? null;

  useEffect(() => {
    setUsername(accountState?.username ?? "");
    setDisplayName(accountState?.displayName ?? "");
    setBio(accountState?.bio ?? "");
    setDiscoverable(accountState?.discoverable ?? false);
    setCode("");
    setCodePreview(null);
  }, [accountState?.bio, accountState?.displayName, accountState?.discoverable, accountState?.username]);

  useEffect(() => {
    if (hasAccount) {
      setUsernameFeedback({
        available: true,
        message: `Dein Handle @${accountState?.username} bleibt aktuell stabil und wird für Creator-Identität und Suche genutzt.`,
        tone: "muted",
      });
      return;
    }

    const normalizedUsername = username.trim().replace(/^@+/, "");
    if (!normalizedUsername) {
      setUsernameFeedback({
        available: false,
        message: "Nutze ein eigenes @Handle für Suche, Creator-Identität und neue Geräte.",
        tone: "muted",
      });
      return;
    }

    if (normalizedUsername.length < 3) {
      setUsernameFeedback({
        available: false,
        message: "Ein Handle braucht mindestens 3 Zeichen.",
        tone: "danger",
      });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      onCheckUsernameAvailability({ username: normalizedUsername })
        .then((result) => {
          if (cancelled) {
            return;
          }

          setUsernameFeedback({
            available: result.available,
            message: result.available
              ? `@${result.normalizedUsername} ist verfügbar.`
              : result.reason || `@${result.normalizedUsername} ist schon vergeben.`,
            tone: result.available ? "positive" : "danger",
          });
        })
        .catch(() => {
          if (cancelled) {
            return;
          }

          setUsernameFeedback({
            available: false,
            message: "Handle konnte gerade nicht geprüft werden.",
            tone: "danger",
          });
        });
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [accountState?.username, hasAccount, onCheckUsernameAvailability, username]);

  return (
    <ConsumerSheet title="Einstellungen" onClose={onClose}>
      <div className="card sheetSummaryCard">
        <div className="sectionLabel">
          <div>
            <strong>{hasAccount ? "Account verbunden" : "Noch nur lokal"}</strong>
            <span>
              {hasAccount
                ? `@${accountState?.username} ist mit diesem Gerät verknüpft.`
                : "Mit E-Mail sichern bringt Recovery und Multi-Device-Login."}
            </span>
          </div>
        </div>
        <div className="summaryList">
          <div className="summaryItem">
            <span>Username</span>
            <strong>{hasAccount ? `@${accountState?.username}` : "Noch keiner"}</strong>
          </div>
          <div className="summaryItem">
            <span>Anzeigename</span>
            <strong>{hasAccount ? accountState?.displayName || accountState?.username || "Nicht gesetzt" : "Nicht gesetzt"}</strong>
          </div>
          <div className="summaryItem">
            <span>Profiltext</span>
            <strong>{hasAccount ? (accountState?.bio ? "Gefüllt" : "Noch leer") : "Kommt später"}</strong>
          </div>
          <div className="summaryItem">
            <span>E-Mail</span>
            <strong>{hasAccount ? (accountState?.emailVerified ? "Bestätigt" : "Offen") : "Nicht gesichert"}</strong>
          </div>
          <div className="summaryItem">
            <span>Sichtbarkeit</span>
            <strong>{hasAccount ? (accountState?.discoverable ? "Finde mich" : "Privat") : "Nur lokal"}</strong>
          </div>
          <div className="summaryItem">
            <span>Channel Sync</span>
            <strong>{hasAccount ? "Accountweit" : "Nur lokal"}</strong>
          </div>
          <div className="summaryItem">
            <span>Geräte</span>
            <strong>{hasAccount ? `${linkedInstallCount || 1} aktiv` : "1 lokal"}</strong>
          </div>
        </div>
        {hasAccount ? (
          <p className="sheetActionNote">
            Favoriten, Recent und Channel-Beitritte werden mit diesem Account synchronisiert.
            {currentLinkedInstall ? ` Dieses Gerät ist an ${currentLinkedInstall.cityLabel} gebunden.` : ""}
          </p>
        ) : null}
      </div>

      <div className="card sheetActionCard">
        <div className="sectionLabel">
          <div>
            <strong>{hasAccount ? "Account verwalten" : "Mit E-Mail sichern"}</strong>
            <span>{hasAccount ? "Username und Sichtbarkeit verwalten" : "Recovery, Gerätewechsel und Creator-Pfad vorbereiten"}</span>
          </div>
        </div>

        {!hasAccount ? (
          <>
            <div className="composerToolGrid">
              <label className="composerToolInfo">
                <strong>E-Mail</strong>
                <span>Wird für Login, Recovery und Multi-Device-Verknüpfung verwendet.</span>
                <input
                  className="searchInput denseSearchInput"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="deinname@example.com"
                  type="email"
                  value={email}
                />
              </label>
              <label className="composerToolInfo">
                <strong>Username</strong>
                <span>Dein Handle für Suche, Creator-Identität und spätere Profile.</span>
                <input
                  className="searchInput denseSearchInput"
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="@deinhandle"
                  type="text"
                  value={username}
                />
                <p className={`supportCopy settingsHandleStatus settingsHandleStatus${usernameFeedback.tone[0].toUpperCase()}${usernameFeedback.tone.slice(1)}`}>
                  {usernameFeedback.message}
                </p>
              </label>
              <label className="composerToolInfo">
                <strong>Anzeige-Name</strong>
                <span>Optional für Creator und spätere Profile.</span>
                <input
                  className="searchInput denseSearchInput"
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Dein Anzeigename"
                  type="text"
                  value={displayName}
                />
              </label>
            </div>
            <div className="composerStepActionRow">
              <button
                className="primaryButton"
                disabled={busyAction === "start"}
                onClick={async () => {
                  const normalizedEmail = email.trim();
                  if (!normalizedEmail) {
                    setFeedback("Bitte gib zuerst eine E-Mail an.");
                    return;
                  }
                  if (!usernameFeedback.available) {
                    setFeedback(usernameFeedback.message);
                    return;
                  }

                  setBusyAction("start");
                  const result = await onStartEmailAccountLogin({
                    displayName: displayName.trim() || undefined,
                    email: normalizedEmail,
                    username: username.trim() || undefined,
                  });
                  setBusyAction(null);
                  setFeedback(result.message);
                  setCodePreview(result.codePreview ?? null);
                }}
                type="button"
              >
                Verifizierungscode senden
              </button>
              <button
                className="secondaryButton"
                disabled={busyAction === "verify"}
                onClick={async () => {
                  const normalizedEmail = email.trim();
                  const normalizedCode = code.trim();
                  if (!normalizedEmail || !normalizedCode) {
                    setFeedback("Bitte E-Mail und Code ausfüllen.");
                    return;
                  }
                  if (!usernameFeedback.available) {
                    setFeedback(usernameFeedback.message);
                    return;
                  }

                  setBusyAction("verify");
                  const result = await onVerifyEmailAccountLogin({
                    code: normalizedCode,
                    displayName: displayName.trim() || undefined,
                    email: normalizedEmail,
                    username: username.trim() || undefined,
                  });
                  setBusyAction(null);
                  setFeedback(result.message);
                  if (result.ok) {
                    setCode("");
                    setCodePreview(null);
                  }
                }}
                type="button"
              >
                E-Mail bestätigen
              </button>
            </div>
            {codePreview ? <p className="sheetActionNote">Dev-Code: {codePreview}</p> : null}
            <p className="sheetActionNote">
              Ein gesicherter Account hilft bei Recovery, Multi-Device-Nutzung und später bei Creator-Zugriff.
            </p>
          </>
        ) : (
          <>
            <div className="composerToolGrid">
              <div className="composerToolInfo">
                <strong>{accountState?.displayName}</strong>
                <span>@{accountState?.username}</span>
              </div>
              <div className="composerToolInfo">
                <strong>Handle</strong>
                <span>{usernameFeedback.message}</span>
              </div>
              <label className="composerToolInfo">
                <strong>Anzeigename</strong>
                <span>Wird bei Creator und späteren Profilen angezeigt.</span>
                <input
                  className="searchInput denseSearchInput"
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Anzeigename"
                  type="text"
                  value={displayName}
                />
              </label>
              <label className="composerToolInfo composerToolInfoWide">
                <strong>Profiltext</strong>
                <span>Kurze Einordnung für Creator und öffentliche Profil-Vorschauen.</span>
                <textarea
                  className="composerInput settingsBioInput"
                  onChange={(event) => setBio(event.target.value)}
                  placeholder="Kurz beschreiben, wofür man dich öffentlich finden soll."
                  rows={3}
                  value={bio}
                />
              </label>
              <button
                className={discoverable ? "sheetOptionButton sheetOptionButtonActive" : "sheetOptionButton"}
                onClick={() => setDiscoverable((current) => !current)}
                type="button"
              >
                <div className="sheetOptionMain">
                  <strong>Öffentlich auffindbar</strong>
                  <span>Nur Creator und freigegebene Profile werden später gefunden.</span>
                </div>
                <div className="sheetOptionSide">
                  <span className="stateTag stateTagActive">{discoverable ? "An" : "Aus"}</span>
                </div>
              </button>
            </div>
            <div className="composerStepActionRow composerStepActionRowSplit">
              <button
                className="primaryButton"
                disabled={busyAction === "save"}
                onClick={async () => {
                  setBusyAction("save");
                  const result = await onUpdateAccountProfile({
                    displayName: displayName.trim() || undefined,
                    bio: bio.trim(),
                    discoverable,
                  });
                  setBusyAction(null);
                  setFeedback(result.message);
                }}
                type="button"
              >
                Profil speichern
              </button>
              <button
                className="secondaryButton"
                disabled={busyAction === "logout"}
                onClick={async () => {
                  setBusyAction("logout");
                  const result = await onLogoutAccount();
                  setBusyAction(null);
                  setFeedback(result.message);
                }}
                type="button"
              >
                Auf diesem Gerät abmelden
              </button>
            </div>
            {accountState?.linkedInstalls?.length ? (
              <div className="rowStack">
                {accountState.linkedInstalls.slice(0, 4).map((install) => {
                  const isBusyDevice = busyAction === "device" && busyDeviceId === install.installIdentityId;
                  const sessionLabel = install.sessionCount === 1 ? "1 Session" : `${install.sessionCount} Sessions`;
                  const statusLabel = install.status === "active" ? "Aktiv" : "Abgemeldet";
                  const canLogoutDevice = !install.current && install.canRemoteLogout && busyAction !== "device";

                  return (
                    <ListRow
                      key={install.installIdentityId}
                      right={install.current ? "Dieses Gerät" : isBusyDevice ? "Trennt..." : "Abmelden"}
                      rightTone={install.current ? "positive" : "danger"}
                      subtitle={`${statusLabel} · ${sessionLabel} · Stadtbindung: ${install.cityLabel}`}
                      title={install.deviceLabel || (install.current ? "Aktuelles Gerät" : "Weiteres Gerät")}
                      onClick={
                        canLogoutDevice
                          ? async () => {
                              setBusyAction("device");
                              setBusyDeviceId(install.installIdentityId);
                              const result = await onLogoutAccountDevice(install.installIdentityId);
                              setFeedback(result.message);
                              setBusyAction(null);
                              setBusyDeviceId(null);
                            }
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>App</strong>
            <span>Standort, Hinweise und deine anonyme Installation.</span>
          </div>
        </div>
        <div className="rowStack">
          <ListRow
            right="Alerts"
            rightTone="positive"
            title="Benachrichtigungen"
            subtitle="Antworten, Tips, Chats und Hinweise in deinen Alerts"
            onClick={() => setFeedback("Deine Alerts sammeln Antworten, Tips, Chats und wichtige Hinweise direkt in der App.")}
          />
          <ListRow
            right="Lokal"
            rightTone="warm"
            title="Sicherung"
            subtitle="Deine anonyme Installation bleibt auf diesem Gerät"
            onClick={() => setFeedback("Deine anonyme Installation lebt aktuell nur auf diesem Gerät. Eine Cloud-Sicherung gibt es hier bewusst noch nicht.")}
          />
          <ListRow
            right="Stadt"
            rightTone="positive"
            title="Standortbindung"
            subtitle="Dein Feed bleibt an eine feste Stadt gekoppelt"
            onClick={() => setFeedback("Deine Stadt steuerst du über den Standort-Dialog oben im Header. Der Feed bleibt dabei an einen festen Ort gebunden.")}
          />
        </div>
      </div>

      <div className="card sheetListCard">
        <div className="sectionLabel">
          <div>
            <strong>Sicherheit und Hilfe</strong>
            <span>Die wichtigsten Hinweise an einem Ort.</span>
          </div>
        </div>
        <div className="rowStack">
          <ListRow
            right="Info"
            rightTone="default"
            title="Hilfe und Support"
            subtitle="Zentrale Hilfe und kurze Antworten"
            onClick={() => setActiveDocument("support")}
          />
          <ListRow
            right="Info"
            rightTone="default"
            title="Community-Regeln"
            subtitle="Was erlaubt ist und was wir entfernen"
            onClick={() => setActiveDocument("rules")}
          />
          <ListRow
            right="Info"
            rightTone="default"
            title="Datenschutz"
            subtitle="Standort, Wallet, Creator und KYC"
            onClick={() => setActiveDocument("privacy")}
          />
          <ListRow
            right="Info"
            rightTone="default"
            title="Impressum"
            subtitle="Rechtliche Angaben zu NUUDL"
            onClick={() => setActiveDocument("imprint")}
          />
        </div>
      </div>

      {activeDocumentContent ? (
        <div className="card sheetListCard settingsDocCard">
          <div className="sectionLabel">
            <div>
              <strong>{activeDocumentContent.title}</strong>
              <span>{activeDocumentContent.eyebrow}</span>
            </div>
            <button className="inlineAction" onClick={() => setActiveDocument(null)} type="button">
              Schließen
            </button>
          </div>
          <div className="settingsDocBody">
            {activeDocumentContent.sections.map((section) => (
              <div className="settingsDocSection" key={section.heading}>
                <strong>{section.heading}</strong>
                <p className="supportCopy">{section.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card sheetListCard dangerListCard">
        <div className="sectionLabel">
          <div>
            <strong>Installation</strong>
            <span>Nur wenn du dieses Gerät wirklich komplett zurücksetzen willst.</span>
          </div>
        </div>
        <div className="rowStack">
          <ListRow
            right="Aus"
            rightTone="danger"
            title="Anonyme Installation entfernen"
            subtitle="Löscht lokale Daten, Verlauf und Zugang auf diesem Gerät"
            onClick={() => setFeedback("Zurücksetzen bleibt gesperrt, bis Sicherung und sicherer Wiederzugang sauber zusammenspielen.")}
          />
        </div>
      </div>

      {feedback ? (
        <div className="card sheetFeedbackCard">
          <p className="supportCopy inlineFeedback settingsFeedback">{feedback}</p>
        </div>
      ) : null}
    </ConsumerSheet>
  );
}

export function ComposerSheet({
  onClose,
  activeCity,
  channelEntries,
  favoriteChannelIds,
  onRememberRecentChannel,
  onSubmit,
  onToggleFavoriteChannel,
}: {
  onClose: () => void;
  activeCity: CityContext;
  channelEntries: Channel[];
  favoriteChannelIds: string[];
  onRememberRecentChannel: (cityId: string, channelIds: string[]) => void;
  onSubmit: (input: {
    body: string;
    channelId: string | null;
    media?: Array<{ kind: "image"; url: string }>;
  }) => Promise<string | null>;
  onToggleFavoriteChannel: (channelId: string) => void;
}) {
  const cityChannels = filterChannelsByCity(activeCity.id, channelEntries);
  const initialDraft = readComposerDraft(activeCity.id);
  const [body, setBody] = useState(initialDraft.body);
  const [pendingMedia, setPendingMedia] = useState<ComposerMediaAttachment | null>(null);
  const [recentChannelIds, setRecentChannelIds] = useState<string[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(
    initialDraft.selectedChannelId ?? cityChannels[0]?.id ?? null,
  );
  const [step, setStep] = useState<"compose" | "channel">(initialDraft.step);
  const [channelQuery, setChannelQuery] = useState(initialDraft.channelQuery);
  const [submitting, setSubmitting] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<string | null>(null);
  const composerBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const channelSearchRef = useRef<HTMLInputElement | null>(null);
  const composerMediaInputRef = useRef<HTMLInputElement | null>(null);
  const favoriteIndex = useMemo(
    () => new Map(favoriteChannelIds.map((channelId, index) => [channelId, index] as const)),
    [favoriteChannelIds],
  );
  const favoriteChannels = useMemo(
    () =>
      [...cityChannels]
        .filter((channel) => favoriteIndex.has(channel.id))
        .sort((left, right) => sortChannelsByWeekPriority(left, right, favoriteIndex, new Map())),
    [cityChannels, favoriteIndex],
  );
  const recentChannels = useMemo(() => {
    const recentIndex = new Map(recentChannelIds.map((channelId, index) => [channelId, index] as const));

    return [...cityChannels]
      .filter((channel) => recentIndex.has(channel.id))
      .sort((left, right) => sortChannelsByWeekPriority(left, right, favoriteIndex, recentIndex));
  }, [cityChannels, favoriteIndex, recentChannelIds]);
  const selectedChannel = cityChannels.find((channel) => channel.id === selectedChannelId) ?? null;
  const frequentChannels = useMemo(
    () =>
      [...cityChannels]
        .filter((channel) => !recentChannelIds.includes(channel.id) && !favoriteChannelIds.includes(channel.id))
        .sort(
          (left, right) =>
            Number(right.joined) - Number(left.joined) ||
            Number(right.isVerified) - Number(left.isVerified) ||
            right.memberCount - left.memberCount,
        )
        .slice(0, 4),
    [cityChannels, favoriteChannelIds, recentChannelIds],
  );
  const filteredChannels = useMemo(() => {
    const normalizedQuery = channelQuery.trim().toLowerCase();
    const recentIndex = new Map(recentChannelIds.map((channelId, index) => [channelId, index] as const));
    const sortedChannels = [...cityChannels].sort((left, right) => sortChannelsByWeekPriority(left, right, favoriteIndex, recentIndex));

    if (!normalizedQuery) {
      return sortedChannels;
    }

    return sortedChannels.filter((channel) =>
      `${channel.slug} ${channel.title} ${channel.description}`.toLowerCase().includes(normalizedQuery),
    );
  }, [channelQuery, cityChannels, favoriteIndex, recentChannelIds]);

  useEffect(() => {
    const storedRecentIds = readRecentChannelIds(activeCity.id);
    setRecentChannelIds(storedRecentIds);
  }, [activeCity.id]);

  useEffect(() => {
    const draft = readComposerDraft(activeCity.id);
    setBody(draft.body);
    setStep(draft.step);
    setChannelQuery(draft.channelQuery);
    setSelectedChannelId(draft.selectedChannelId ?? cityChannels[0]?.id ?? null);
    setPendingMedia(null);
    setSubmissionFeedback(null);
    if (composerMediaInputRef.current) {
      composerMediaInputRef.current.value = "";
    }
  }, [activeCity.id]);

  useEffect(() => {
    const availableChannelIds = new Set(cityChannels.map((channel) => channel.id));

    if (selectedChannelId && availableChannelIds.has(selectedChannelId)) {
      return;
    }

    const favoriteSelection = favoriteChannels.find((channel) => availableChannelIds.has(channel.id));
    const recentSelection = recentChannels.find((channel) => availableChannelIds.has(channel.id));
    setSelectedChannelId(favoriteSelection?.id ?? recentSelection?.id ?? cityChannels[0]?.id ?? null);
  }, [cityChannels, favoriteChannels, recentChannels, selectedChannelId]);

  const rememberChannel = (channelId: string | null) => {
    if (!channelId) {
      return [] as string[];
    }

    const next = [channelId, ...recentChannelIds.filter((entry) => entry !== channelId)].slice(0, RECENT_CHANNEL_LIMIT);
    setRecentChannelIds(next);
    writeRecentChannelIds(activeCity.id, next);
    return next;
  };

  useEffect(() => {
    writeComposerDraft(activeCity.id, {
      body,
      step,
      selectedChannelId,
      channelQuery,
    });
  }, [activeCity.id, body, channelQuery, selectedChannelId, step]);

  useEffect(() => {
    autoResizeTextarea(composerBodyRef.current, 160, 280);
  }, [body]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const focusTarget = step === "compose" ? composerBodyRef.current : channelSearchRef.current;

    if (!focusTarget) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      focusTarget.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [step]);

  return (
    <ConsumerSheet title={step === "compose" ? "Neuer Post" : "Channel wählen"} onClose={onClose}>
      {step === "compose" ? (
        <div className="card composerStepCard">
          <div className="sectionLabel">
            <div>
                <strong>Post</strong>
                <span>Schreib erst den Post, dann wähle den Channel.</span>
            </div>
          </div>
          <textarea
            className="composerInput"
            ref={composerBodyRef}
            onChange={(event) => setBody(event.target.value)}
            placeholder={`Was passiert gerade in ${activeCity.label}?`}
            rows={5}
            value={body}
          />
          {pendingMedia ? (
            <div className="composerMediaPreview">
              <div className="composerMediaCard">
                <img alt="Post Vorschau" className="composerMediaImage" draggable={false} src={pendingMedia.url} />
              </div>
              <div className="composerMediaRow">
                <div className="composerMediaInfo">
                  <strong>Bild angehängt</strong>
                  <span>{pendingMedia.fileName}</span>
                </div>
                <button
                  className="inlineAction composerMediaRemove"
                  onClick={() => {
                    setPendingMedia(null);
                    if (composerMediaInputRef.current) {
                      composerMediaInputRef.current.value = "";
                    }
                  }}
                  type="button"
                >
                  Entfernen
                </button>
              </div>
            </div>
          ) : null}
          <div className="composerToolGrid">
            <button
              className="composerToolAction"
              onClick={() => composerMediaInputRef.current?.click()}
              type="button"
            >
              <div className="composerToolMeta">
                <strong>Bild</strong>
                <span className="composerToolTag">{pendingMedia ? "1 Bild" : "Bild wählen"}</span>
              </div>
              <span>Ein Bild reicht. Du kannst es vor dem Senden wieder entfernen.</span>
            </button>
            <div className="composerToolInfo">
              <div className="composerToolMeta">
                <strong>Umfrage</strong>
                <span className="composerToolTag composerToolTagMuted">Bald</span>
              </div>
              <span>Umfragen kommen später als eigener Post und nicht in diesen Schnell-Flow.</span>
            </div>
            <div className="composerToolInfo">
              <div className="composerToolMeta">
                <strong>Privatsphäre</strong>
                <span className="composerToolTag composerToolTagPositive">Anonym</span>
              </div>
              <span>Der Post erscheint ohne persönliches Profil.</span>
            </div>
          </div>
          <input
            accept="image/*"
            className="composerMediaInput"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;

              if (!file) {
                return;
              }

              if (!file.type.startsWith("image/")) {
                event.currentTarget.value = "";
                return;
              }

              void (async () => {
                try {
                  const attachment = await createComposerMediaAttachment(file);
                  setPendingMedia(attachment);
                } catch (error) {
                  console.warn("NUUDL composer image read failed.", error);
                } finally {
                  event.currentTarget.value = "";
                }
              })();
            }}
            ref={composerMediaInputRef}
            type="file"
          />
          <div className="composerStepActionRow">
            <button className="primaryButton" disabled={!body.trim()} onClick={() => setStep("channel")} type="button">
              Weiter
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="card sheetSummaryCard">
            <div className="sectionLabel">
              <div>
                <strong>Post</strong>
                <span>{selectedChannel ? `Für @${selectedChannel.slug}` : "Wähle einen passenden Channel."}</span>
              </div>
            </div>
            <p className="composerPreviewText">{body}</p>
            {pendingMedia ? (
              <div className="composerSummaryMedia">
                <div className="composerSummaryMediaThumb">
                  <img alt="Post Vorschau" className="composerSummaryImage" draggable={false} src={pendingMedia.url} />
                </div>
                <div className="composerSummaryMediaMeta">
                  <strong>Bild angehängt</strong>
                  <span>{pendingMedia.fileName}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="card sheetListCard composerChannelCard">
            <div className="sectionLabel">
              <div>
                <strong>Channel wählen</strong>
                <span>Suche, Recent und lokale Bereiche.</span>
              </div>
            </div>

            <div className="composerSearchWrap">
              <div className="composerSearchMeta">
                <span className="composerSectionMiniLabel">Suche</span>
                <span className="searchHint">
                  {selectedChannel ? `Aktiv: @${selectedChannel.slug}` : `${filteredChannels.length} Channels`}
                </span>
              </div>
              {selectedChannel ? (
                <button className="inlineAction" onClick={() => onToggleFavoriteChannel(selectedChannel.id)} type="button">
                  {favoriteChannelIds.includes(selectedChannel.id) ? "Aus Favoriten" : "Als Favorit"}
                </button>
              ) : null}
              <div className="discoverSearchShell">
                <input
                  className="searchInput denseSearchInput"
                  onChange={(event) => setChannelQuery(event.target.value)}
                  placeholder="Channel suchen"
                  ref={channelSearchRef}
                  value={channelQuery}
                />
                {channelQuery ? (
                  <button className="searchClearButton" onClick={() => setChannelQuery("")} type="button">
                    Leeren
                  </button>
                ) : null}
              </div>
            </div>

            {favoriteChannels.length ? (
              <div className="composerRecentChannels">
                <span className="composerSectionMiniLabel">Favoriten</span>
                <div className="chipRow">
                  {favoriteChannels.map((channel) => (
                    <button
                      className={selectedChannelId === channel.id ? "chip chipActive" : "chip chipMuted"}
                      key={`favorite-${channel.id}`}
                      onClick={() => setSelectedChannelId(channel.id)}
                      type="button"
                    >
                      @{channel.slug}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {recentChannels.length ? (
              <div className="composerRecentChannels">
                <span className="composerSectionMiniLabel">Recent</span>
                <div className="chipRow">
                  {recentChannels.map((channel) => (
                    <button
                      className={selectedChannelId === channel.id ? "chip chipActive" : "chip chipMuted"}
                      key={`recent-${channel.id}`}
                      onClick={() => setSelectedChannelId(channel.id)}
                      type="button"
                    >
                      @{channel.slug}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {frequentChannels.length ? (
              <div className="composerQuickChannels">
                <span className="composerSectionMiniLabel">Empfohlen</span>
                <div className="chipRow">
                  {frequentChannels.map((channel) => (
                    <button
                      className={selectedChannelId === channel.id ? "chip chipActive" : "chip chipMuted"}
                      key={channel.id}
                      onClick={() => setSelectedChannelId(channel.id)}
                      type="button"
                    >
                      @{channel.slug}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="sheetOptionList">
              {filteredChannels.map((channel) => {
                const isSelected = selectedChannelId === channel.id;

                return (
                  <button
                    className={isSelected ? "sheetOptionButton sheetOptionButtonActive" : "sheetOptionButton"}
                    key={channel.id}
                    onClick={() => setSelectedChannelId(channel.id)}
                    type="button"
                  >
                    <div className="sheetOptionMain">
                      <strong>@{channel.slug}</strong>
                      <span>{channel.title}</span>
                    </div>
                    <div className="sheetOptionSide">
                      <span className={isSelected ? "stateTag stateTagActive" : "stateTag stateTagMuted"}>
                        {isSelected ? "Aktiv" : "Wählen"}
                      </span>
                      {favoriteChannelIds.includes(channel.id) ? <span className="channelFavoriteHint">Favorit</span> : null}
                      <span>{channel.memberCount} Mitglieder</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {!filteredChannels.length ? (
              <div className="emptyState emptyStateInline">
                <strong>Kein Channel gefunden.</strong>
                <p className="supportCopy">Probier einen anderen Namen oder wähle einen Bereich aus dem Schnellzugriff.</p>
              </div>
            ) : null}
          </div>

          <div className="composerStepActionRow composerStepActionRowSplit">
            <button className="secondaryButton" onClick={() => setStep("compose")} type="button">
              Zurück
            </button>
            <button
              className="primaryButton"
              disabled={!selectedChannelId || submitting}
              onClick={async () => {
                setSubmitting(true);
                setSubmissionFeedback(null);
                let uploadedMedia:
                  | Array<{
                      kind: "image";
                      url: string;
                    }>
                  | undefined;

                try {
                  uploadedMedia = pendingMedia ? [{ kind: "image", url: (await consumerApi.uploadMedia(pendingMedia.file)).asset.url }] : undefined;
                } catch (error) {
                  console.warn("NUUDL composer image upload failed.", error);
                  setSubmitting(false);
                  setSubmissionFeedback("Bild konnte gerade nicht hochgeladen werden.");
                  return;
                }

                const createdPostId = await onSubmit({
                  body,
                  channelId: selectedChannelId,
                  media: uploadedMedia,
                });

                if (createdPostId) {
                  const nextRecentChannelIds = rememberChannel(selectedChannelId);
                  if (nextRecentChannelIds.length) {
                    onRememberRecentChannel(activeCity.id, nextRecentChannelIds);
                  }
                  clearComposerDraft(activeCity.id);
                  setBody("");
                  setChannelQuery("");
                  setSelectedChannelId(null);
                  setPendingMedia(null);
                  if (composerMediaInputRef.current) {
                    composerMediaInputRef.current.value = "";
                  }
                  setStep("compose");
                  setSubmissionFeedback(null);
                  setSubmitting(false);
                  onClose();
                  return;
                }
                setSubmissionFeedback("Post konnte gerade nicht gesendet werden.");
                setSubmitting(false);
              }}
              type="button"
            >
              {submitting ? "Sende..." : "Posten"}
            </button>
          </div>
          {submissionFeedback ? <p className="supportCopy composerFeedback">{submissionFeedback}</p> : null}
        </>
      )}
    </ConsumerSheet>
  );
}

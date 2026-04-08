"use client";

import type { Channel } from "@veil/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { consumerApi } from "../_lib/consumer-api";
import { useConsumerApp } from "./consumer-provider";
import { goBackOrFallback, openOrCreateChatFromPost } from "./consumer-helpers";
import type { RootView } from "./consumer-types";
import {
  BackIcon,
  ConsumerBottomNav,
  ConsumerDesktopHint,
  ConsumerGateScreen,
  ConsumerPhoneFrame,
  ConsumerScreenBody,
  ConsumerStatusScreen,
} from "./mobile-shell";
import { FeedCard } from "./consumer-screens";
import styles from "./consumer-channel-route.module.css";

const hrefByView: Record<RootView, string> = {
  feed: "/",
  discover: "/channels",
  chat: "/chat",
  alerts: "/notifications",
  me: "/me",
};

export function ConsumerChannelRoute({ slug }: { slug: string }) {
  const router = useRouter();
  const {
    booted,
    hydrationMessage,
    hydrationStatus,
    gateAccepted,
    activeCity,
    installIdentityId,
    location,
    acceptGate,
    resolveLocation,
    channelEntries,
    favoriteChannelIds,
    chatRequests,
    createChatRequest,
    loadChannels,
    feedPosts,
    feedReplies,
    postVotes,
    tipPost,
    toggleChannelJoined,
    toggleFavoriteChannel,
    votePost,
    retryHydration,
  } = useConsumerApp();
  const [resolvedChannel, setResolvedChannel] = useState<Channel | null>(null);
  const [resolvedPosts, setResolvedPosts] = useState<typeof feedPosts>([]);

  useEffect(() => {
    if (booted && gateAccepted && location.status === "unknown") {
      resolveLocation();
    }
  }, [booted, gateAccepted, location.status]);

  useEffect(() => {
    if (!booted || !gateAccepted || location.status !== "ready" || hydrationStatus !== "ready") {
      return;
    }

    void loadChannels(activeCity.id).catch((error: unknown) => {
      console.warn("NUUDL API channel list refresh failed.", error);
    });
  }, [activeCity.id, booted, gateAccepted, hydrationStatus, location.status]);

  useEffect(() => {
    if (!booted || !gateAccepted || location.status !== "ready" || hydrationStatus !== "ready") {
      return;
    }

    void consumerApi
      .getChannelBySlug(slug)
      .then((response) => {
        setResolvedChannel(response.channel);
        setResolvedPosts(response.posts);
      })
      .catch((error: unknown) => {
        console.warn("NUUDL API channel detail failed, keeping local channel state.", error);
      });
  }, [booted, gateAccepted, hydrationStatus, location.status, slug]);

  const storedChannel = channelEntries.find((entry) => entry.slug === slug || entry.id === resolvedChannel?.id) ?? null;
  const channel = resolvedChannel
    ? {
        ...resolvedChannel,
        joined: storedChannel?.joined ?? resolvedChannel.joined,
      }
    : storedChannel;
  const isFavorite = channel ? favoriteChannelIds.includes(channel.id) : false;
  const channelPosts = channel
    ? (resolvedPosts.length ? resolvedPosts : feedPosts.filter((post) => post.channelId === channel.id && post.cityId === activeCity.id)).map(
        (post) => feedPosts.find((entry) => entry.id === post.id) ?? post,
      )
    : [];

  if (!booted) {
    return null;
  }

  if (!gateAccepted) {
    return <ConsumerGateScreen onAcceptGate={acceptGate} />;
  }

  if (location.status !== "ready") {
    return (
      <ConsumerStatusScreen
        actionLabel={location.status === "loading" ? undefined : "Standort erneut pruefen"}
        eyebrow={location.status === "blocked" ? "Blockiert" : "Standort"}
        message={location.message}
        onAction={location.status === "loading" ? undefined : resolveLocation}
        title={location.status === "loading" ? "Standort wird geladen" : "Standortpruefung erforderlich"}
      />
    );
  }

  if (hydrationStatus !== "ready") {
    return (
      <ConsumerStatusScreen
        actionLabel={hydrationStatus === "blocked" ? "Erneut versuchen" : undefined}
        eyebrow={hydrationStatus === "blocked" ? "Offline" : "Verbinden"}
        message={hydrationMessage || "Channel wird mit der API synchronisiert."}
        onAction={hydrationStatus === "blocked" ? retryHydration : undefined}
        title={hydrationStatus === "blocked" ? "NUUDL ist gerade nicht erreichbar" : "Channel wird geladen"}
      />
    );
  }

  return (
    <main className="appLayout">
      <ConsumerPhoneFrame>
        <header className={`topBar ${styles.channelTopBar}`}>
          <div className="topBarSide">
            <button className="titleIconButton" onClick={() => goBackOrFallback(router, "/channels")} type="button">
              <BackIcon className="titleIconSvg" />
            </button>
          </div>

          <div className={`${styles.channelTopBarCenter} topBarCenter`}>
            <span className={`titleHeader ${styles.channelTitle}`}>{channel ? `@${channel.slug}` : "Channel"}</span>
            {channel ? <span className={styles.channelSubtitle}>{channel.title}</span> : null}
          </div>

          <div className="topBarSide topBarSideRight">
            {channel ? <span className={styles.channelTopBarBadge}>{channel.isAdultOnly ? "18+" : "Lokal"}</span> : null}
          </div>
        </header>

        <ConsumerScreenBody>
          {channel ? (
            <section className={styles.channelRoute}>
              <div className={styles.channelOverview}>
                <div className={styles.channelOverviewTop}>
                  <div>
                    <p className={styles.channelEyebrow}>{channel.isVerified ? "Verifiziert" : "Lokal"}</p>
                    <h1 className={styles.channelHeadline}>@{channel.slug}</h1>
                  </div>
                  <div className={styles.channelControlsCard}>
                    <span className={styles.channelControlsLabel}>Nur auf diesem Geraet</span>
                    <div className={styles.channelControls}>
                      <button
                        aria-pressed={channel.joined}
                        className={channel.joined ? `${styles.joinButton} ${styles.joinButtonJoined}` : `${styles.joinButton} ${styles.joinButtonReadOnly}`}
                        onClick={() => toggleChannelJoined(channel.id)}
                        type="button"
                      >
                        <span className={styles.controlButtonTitle}>{channel.joined ? "Folge ich" : "Folgen"}</span>
                        <span className={styles.controlButtonMeta}>{channel.joined ? "Im Feed halten" : "Im Feed merken"}</span>
                      </button>
                      <button
                        aria-pressed={isFavorite}
                        className={isFavorite ? `${styles.favoriteButton} ${styles.favoriteButtonActive}` : styles.favoriteButton}
                        onClick={() => toggleFavoriteChannel(channel.id)}
                        type="button"
                      >
                        <span className={styles.controlButtonTitle}>{isFavorite ? "Favorit" : "Merken"}</span>
                        <span className={styles.controlButtonMeta}>{isFavorite ? "Oben in Listen" : "Schneller finden"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <p className={styles.channelDescription}>{channel.description}</p>

                <p className={styles.localControlHint}>Diese Auswahl bleibt lokal in deiner PWA und aendert nichts am Channel selbst.</p>

                <div className={styles.channelMetaRow}>
                  <span className={styles.channelMetaPill}>{channel.memberCount} Mitglieder</span>
                  <span className={styles.channelMetaPill}>{channel.isAdultOnly ? "18+" : "Offen"}</span>
                  <span className={styles.channelMetaPill}>{channel.isExclusive ? "Exklusiv" : "Standard"}</span>
                </div>
              </div>

                <div className={styles.postsHeader}>
                  <div className="sectionLabel screenHeaderBlock screenHeaderBlockCompact">
                    <div>
                    <strong>Aktuelle Beitraege</strong>
                    <span>{channelPosts.length} Beitraege</span>
                    </div>
                  </div>
                </div>

              <div className={styles.channelPostsList}>
                {channelPosts.length ? (
                  channelPosts.map((post) => (
                    <FeedCard
                  channel={channel}
                  key={post.id}
                      onOpenAuthor={() =>
                        openOrCreateChatFromPost({
                          createChatRequest,
                          fallbackRoute: `/post/${post.id}`,
                          installIdentityId,
                          navigate: (href) => router.push(href),
                          post,
                          requests: chatRequests,
                        })
                      }
                      showQuickTips={false}
                      onOpenPost={() => router.push(`/post/${post.id}`)}
                      onTip={(amountCents) => tipPost(post.id, amountCents)}
                      onVote={(value) => votePost(post.id, value)}
                      post={post}
                      replyCount={feedReplies.filter((reply) => reply.postId === post.id).length || post.replyCount}
                      userVote={postVotes[post.id] ?? 0}
                    />
                  ))
                ) : (
                  <div className={`emptyState ${styles.channelEmptyState}`}>
                    <strong>Gerade ist es in diesem Channel ruhig.</strong>
                    <p className="supportCopy">Neue Beitraege aus deiner Stadt tauchen hier automatisch auf.</p>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className={styles.channelRoute}>
              <div className={`emptyState ${styles.channelEmptyState}`}>
                <strong>Channel nicht verfuegbar.</strong>
                <p className="supportCopy">Dieser Channel ist gerade nicht verfuegbar oder wurde entfernt.</p>
                <button className="primaryButton" onClick={() => goBackOrFallback(router, "/channels")} type="button">
                  Zurueck zu Channels
                </button>
              </div>
            </section>
          )}
        </ConsumerScreenBody>

        <ConsumerBottomNav activeView="discover" onChangeView={(nextView) => router.push(hrefByView[nextView])} />
      </ConsumerPhoneFrame>

      <ConsumerDesktopHint />
    </main>
  );
}

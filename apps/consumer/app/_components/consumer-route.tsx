"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Post, SearchResults } from "@veil/shared";
import { useConsumerApp } from "./consumer-provider";
import { goBackOrFallback, openOrCreateChatFromPost } from "./consumer-helpers";
import {
  AlertsScreen,
  ChatScreen,
  ComposerSheet,
  CreatorSheet,
  DiscoverScreen,
  FeedScreen,
  LocationSheet,
  MeScreen,
  PlusSheet,
  SettingsSheet,
  WalletSheet,
} from "./consumer-screens";
import type { FeedSort, RootView, SheetView } from "./consumer-types";
import {
  ConsumerBottomNav,
  ConsumerDesktopHint,
  ConsumerGateScreen,
  ConsumerPhoneFrame,
  ConsumerScreenBody,
  ConsumerStatusScreen,
  ConsumerTopBar,
  PlusIcon,
} from "./mobile-shell";

const hrefByView: Record<RootView, string> = {
  feed: "/",
  discover: "/channels",
  chat: "/chat",
  alerts: "/notifications",
  me: "/me",
};

export function ConsumerRoute({ view }: { view: RootView }) {
  const router = useRouter();
  const {
    booted,
    accountState,
    demoPaymentsEnabled,
    hydrationMessage,
    hydrationStatus,
    gateAccepted,
    installIdentityId,
    activeCity,
    channelEntries,
    favoriteChannelIds,
    location,
    unreadNotifications,
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
    postVotes,
    acceptGate,
    resolveLocation,
    createPost,
    createChatRequest,
    startEmailAccountLogin,
    verifyEmailAccountLogin,
    logoutAccount,
    updateAccountProfile,
    loadChannels,
    searchCity,
    loadChatOverview,
    tipPost,
    votePost,
    markNotificationRead,
    markAllNotificationsRead,
    loadNotifications,
    fakeTopupWallet,
    rememberRecentChannel,
    toggleFavoriteChannel,
    purchasePlus,
    applyForCreator,
    refreshCreatorState,
    retryHydration,
  } = useConsumerApp();
  const [sheet, setSheet] = useState<SheetView>(null);
  const [activeSort, setActiveSort] = useState<FeedSort>("Neu");
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverResults, setDiscoverResults] = useState<SearchResults>({
    accounts: [],
    channels: [],
    hashtags: [],
    posts: [],
  });
  const openSheet = (nextSheet: Exclude<SheetView, null>) => {
    if (typeof window !== "undefined") {
      const currentState = window.history.state as Record<string, unknown> | null;
      if (currentState?.nuudlSheet && sheet) {
        window.history.replaceState({ ...(currentState ?? {}), nuudlSheet: nextSheet }, "");
      } else if (currentState?.nuudlSheet !== nextSheet) {
        window.history.pushState({ ...(currentState ?? {}), nuudlSheet: nextSheet }, "");
      }
    }

    setSheet(nextSheet);
  };

  const closeSheet = () => {
    if (typeof window !== "undefined") {
      const currentState = window.history.state as { nuudlSheet?: SheetView } | null;

      if (currentState?.nuudlSheet) {
        window.history.back();
        return;
      }
    }

    setSheet(null);
  };

  useEffect(() => {
    if (booted && gateAccepted && location.status === "unknown") {
      resolveLocation();
    }
  }, [booted, gateAccepted, location.status]);

  useEffect(() => {
    if (!booted || !gateAccepted || location.status !== "ready" || hydrationStatus !== "ready" || view !== "chat") {
      return;
    }

    void loadChatOverview().catch((error: unknown) => {
      console.warn("NUUDL API chat refresh failed.", error);
    });
  }, [booted, gateAccepted, hydrationStatus, location.status, view]);

  useEffect(() => {
    if (!booted || !gateAccepted || location.status !== "ready" || hydrationStatus !== "ready" || view !== "alerts") {
      return;
    }

    void loadNotifications().catch((error: unknown) => {
      console.warn("NUUDL API notifications refresh failed.", error);
    });
  }, [booted, gateAccepted, hydrationStatus, loadNotifications, location.status, view]);

  useEffect(() => {
    if (!booted || !gateAccepted || location.status !== "ready" || hydrationStatus !== "ready" || view !== "discover") {
      return;
    }

    void loadChannels(activeCity.id).catch((error: unknown) => {
      console.warn("NUUDL API channel refresh failed.", error);
    });
  }, [activeCity.id, booted, gateAccepted, hydrationStatus, location.status, view]);

  useEffect(() => {
    if (!booted || !gateAccepted || location.status !== "ready" || hydrationStatus !== "ready" || view !== "discover") {
      return;
    }

    const normalizedQuery = discoverQuery.trim();

    if (!normalizedQuery) {
      setDiscoverResults({
        accounts: [],
        channels: [],
        hashtags: [],
        posts: [],
      });
      return;
    }

    let cancelled = false;

    void searchCity(activeCity.id, normalizedQuery)
      .then((results) => {
        if (!cancelled) {
          setDiscoverResults(results);
        }
      })
      .catch((error: unknown) => {
        console.warn("NUUDL API search failed.", error);
        if (!cancelled) {
          setDiscoverResults({
            accounts: [],
            channels: [],
            hashtags: [],
            posts: [],
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCity.id, booted, discoverQuery, gateAccepted, hydrationStatus, location.status, view]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { nuudlSheet?: SheetView } | null;

      if (state?.nuudlSheet) {
        setSheet(state.nuudlSheet);
        return;
      }

      setSheet(null);
    };

    if (typeof window !== "undefined") {
      const currentState = window.history.state as { nuudlSheet?: SheetView } | null;

      if (currentState?.nuudlSheet) {
        setSheet(currentState.nuudlSheet);
      }
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

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
        message={hydrationMessage || "Deine Session wird mit der API synchronisiert."}
        onAction={hydrationStatus === "blocked" ? retryHydration : undefined}
        title={hydrationStatus === "blocked" ? "NUUDL ist gerade nicht erreichbar" : "Feed wird geladen"}
      />
    );
  }

  const openAuthorChat = async (post: Post) => {
    await openOrCreateChatFromPost({
      createChatRequest,
      fallbackRoute: `/post/${post.id}`,
      installIdentityId,
      navigate: (href) => router.push(href),
      post,
      requests: chatRequests,
    });
  };

  return (
    <>
      <main className="appLayout">
        <ConsumerPhoneFrame>
          <ConsumerTopBar
            activeCityLabel={activeCity.label}
            onGoBack={() => {
              if (sheet) {
                closeSheet();
                return;
              }

              goBackOrFallback(router, "/");
            }}
            onOpenLocation={() => openSheet("location")}
            onOpenMe={() => router.push("/me")}
            onOpenPlus={() => openSheet("plus")}
            onOpenSettings={() => openSheet("settings")}
            unreadCount={unreadNotifications}
            variant={view === "feed" || view === "discover" ? "home" : "section"}
            view={view}
          />

          <ConsumerScreenBody>
            {view === "feed" ? (
              <FeedScreen
                activeCity={activeCity}
                activeSort={activeSort}
                channelEntries={channelEntries}
                onOpenAuthorChat={openAuthorChat}
                onOpenPost={(postId) => router.push(`/post/${postId}`)}
                onSortChange={setActiveSort}
                onTipPost={tipPost}
                onVotePost={votePost}
                postVotes={postVotes}
                posts={feedPosts}
                replies={feedReplies}
              />
            ) : null}
            {view === "discover" ? (
              <DiscoverScreen
                activeCity={activeCity}
                channels={
                  discoverQuery.trim()
                    ? discoverResults.channels
                    : channelEntries.filter((channel) => channel.cityId === activeCity.id)
                }
                favoriteChannelIds={favoriteChannelIds}
                hashtags={discoverQuery.trim() ? discoverResults.hashtags : []}
                accounts={discoverQuery.trim() ? discoverResults.accounts ?? [] : []}
                onOpenChannel={(slug) => router.push(`/channel/${slug}`)}
                onOpenAuthorChat={openAuthorChat}
                onOpenPost={(postId) => router.push(`/post/${postId}`)}
                onQueryChange={setDiscoverQuery}
                onToggleFavoriteChannel={toggleFavoriteChannel}
                posts={
                  discoverQuery.trim()
                    ? discoverResults.posts
                    : feedPosts.filter((post) => post.cityId === activeCity.id)
                }
                query={discoverQuery}
              />
            ) : null}
            {view === "chat" ? (
              <ChatScreen
                chatRequests={chatRequests}
                currentAccountId={accountState?.id}
                installIdentityId={installIdentityId}
                onOpenThread={(requestId) => router.push(`/chat/${requestId}`)}
                posts={feedPosts}
              />
            ) : null}
            {view === "alerts" ? (
              <AlertsScreen
                notifications={notificationItems}
                onMarkAllRead={markAllNotificationsRead}
                onOpenNotification={(item) => {
                  markNotificationRead(item.id);

                  if (item.targetRoute) {
                    router.push(item.targetRoute);
                    return;
                  }

                  router.push("/");
                }}
              />
            ) : null}
            {view === "me" ? (
              <MeScreen
                accountState={accountState}
                creatorApplication={creatorApplicationState}
                onOpenCreator={() => {
                  openSheet("creator");
                  void refreshCreatorState().catch((error: unknown) => {
                    console.warn("NUUDL API creator refresh failed while opening creator sheet.", error);
                  });
                }}
                onOpenPlus={() => openSheet("plus")}
                onOpenSettings={() => openSheet("settings")}
                onOpenWallet={() => openSheet("wallet")}
                plusEntitlement={plusEntitlement}
                walletBalance={walletBalance}
              />
            ) : null}
          </ConsumerScreenBody>

          <ConsumerBottomNav activeView={view} onChangeView={(nextView) => router.push(hrefByView[nextView])} />

          {view === "feed" ? (
            <button aria-label="Neuen Beitrag erstellen" className="composeRing" onClick={() => openSheet("composer")} type="button">
              <PlusIcon className="composeRingIcon" />
            </button>
          ) : null}
        </ConsumerPhoneFrame>

        <ConsumerDesktopHint />
      </main>

      {sheet === "location" ? (
        <LocationSheet activeCity={activeCity} location={location} onClose={closeSheet} onResolve={resolveLocation} />
      ) : null}
      {sheet === "plus" ? (
        <PlusSheet
          paymentsEnabled={demoPaymentsEnabled}
          onClose={closeSheet}
          onPurchase={purchasePlus}
          plusEntitlement={plusEntitlement}
          walletBalance={walletBalance}
        />
      ) : null}
      {sheet === "wallet" ? (
        <WalletSheet
          ledgerEntries={ledgerEntries.filter((entry) =>
            entry.accountId ? entry.accountId === accountState?.id : entry.installIdentityId === installIdentityId
          )}
          onClose={closeSheet}
          onTopup={fakeTopupWallet}
          paymentsEnabled={demoPaymentsEnabled}
          walletBalance={walletBalance}
          walletTopupEntries={walletTopupEntries.filter((entry) =>
            entry.accountId ? entry.accountId === accountState?.id : entry.installIdentityId === installIdentityId
          )}
        />
      ) : null}
      {sheet === "creator" ? (
        <CreatorSheet
          creatorApplication={creatorApplicationState}
          creatorReviews={creatorReviewEntries.filter((review) => review.creatorApplicationId === creatorApplicationState.id)}
          onApply={applyForCreator}
          onClose={closeSheet}
          payoutAccounts={payoutAccountEntries.filter((account) =>
            account.accountId ? account.accountId === accountState?.id : account.installIdentityId === installIdentityId
          )}
          payouts={payoutEntries.filter((payout) =>
            payout.accountId ? payout.accountId === accountState?.id : payout.installIdentityId === installIdentityId
          )}
        />
      ) : null}
      {sheet === "settings" ? (
        <SettingsSheet
          accountState={accountState}
          onClose={closeSheet}
          onLogoutAccount={logoutAccount}
          onStartEmailAccountLogin={startEmailAccountLogin}
          onUpdateAccountProfile={updateAccountProfile}
          onVerifyEmailAccountLogin={verifyEmailAccountLogin}
        />
      ) : null}
      {sheet === "composer" ? (
        <ComposerSheet
          activeCity={activeCity}
          channelEntries={channelEntries}
          favoriteChannelIds={favoriteChannelIds}
          onClose={closeSheet}
          onRememberRecentChannel={rememberRecentChannel}
          onSubmit={async ({ body, channelId, media }) => {
            const createdPostId = await createPost({
              body,
              channelId,
              cityId: activeCity.id,
              media,
            });

            if (createdPostId) {
              router.push(`/post/${createdPostId}`);
            }

            return createdPostId;
          }}
          onToggleFavoriteChannel={toggleFavoriteChannel}
        />
      ) : null}
    </>
  );
}

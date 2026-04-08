"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { autoResizeTextarea, formatTime, goBackOrFallback, openOrCreateChatFromPost } from "./consumer-helpers";
import { useConsumerApp } from "./consumer-provider";
import type { RootView } from "./consumer-types";
import {
  BackIcon,
  ConsumerBottomNav,
  ConsumerDesktopHint,
  ConsumerGateScreen,
  ConsumerPhoneFrame,
  ConsumerScreenBody,
  ConsumerStatusScreen,
  VoteDownIcon,
  VoteUpIcon,
} from "./mobile-shell";
import { FeedCard } from "./consumer-screens";
import styles from "./consumer-post-route.module.css";

const hrefByView: Record<RootView, string> = {
  feed: "/",
  discover: "/channels",
  chat: "/chat",
  alerts: "/notifications",
  me: "/me",
};

const reportReasons = [
  { value: "spam", label: "Spam oder Scam" },
  { value: "harassment", label: "Belästigung" },
  { value: "illegal", label: "Illegale Inhalte" },
  { value: "adult", label: "Grenzüberschreitender Inhalt" },
  { value: "other", label: "Etwas anderes" },
] as const;

type ReportReason = (typeof reportReasons)[number]["value"];

type ReportTarget =
  | {
      targetType: "post";
      targetId: string;
    }
  | {
      targetType: "reply";
      targetId: string;
    };

function replyDraftStorageKey(postId: string) {
  return `nuudl-reply-draft:${postId}`;
}

function readReplyDraft(postId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(replyDraftStorageKey(postId)) ?? "";
  } catch {
    return "";
  }
}

function writeReplyDraft(postId: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!value.trim()) {
      window.localStorage.removeItem(replyDraftStorageKey(postId));
      return;
    }

    window.localStorage.setItem(replyDraftStorageKey(postId), value);
  } catch {
    // Ignore storage errors in the reply flow.
  }
}

function clearReplyDraft(postId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(replyDraftStorageKey(postId));
  } catch {
    // Ignore storage errors in the reply flow.
  }
}

function ReportPicker({
  busy,
  compact = false,
  confirmation,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  compact?: boolean;
  confirmation: string | null;
  onCancel: () => void;
  onSubmit: (reason: ReportReason) => void;
}) {
  const [selectedReason, setSelectedReason] = useState<ReportReason>("spam");

  if (confirmation) {
    return <div className={compact ? styles.inlineConfirmationCompact : styles.inlineConfirmation}>{confirmation}</div>;
  }

  return (
    <div className={compact ? styles.inlineReportCompact : styles.inlineReport}>
      <div className={styles.inlineReportHeader}>
        <strong>Melden</strong>
        <span>Worum geht es?</span>
      </div>
      <div className={styles.inlineReasonList}>
        {reportReasons.map((reason) => (
          <button
            aria-pressed={selectedReason === reason.value}
            className={selectedReason === reason.value ? styles.inlineReasonButtonActive : styles.inlineReasonButton}
            key={reason.value}
            onClick={() => setSelectedReason(reason.value)}
            type="button"
          >
            {reason.label}
          </button>
        ))}
      </div>
      <div className={styles.inlineReportActions}>
        <button className={styles.inlineGhostButton} onClick={onCancel} type="button">
          Abbrechen
        </button>
        <button className={styles.inlineReportSubmit} disabled={busy} onClick={() => onSubmit(selectedReason)} type="button">
          {busy ? "Sendet..." : "Senden"}
        </button>
      </div>
    </div>
  );
}

function ReplyCard({
  id,
  authorLabel,
  body,
  createdAt,
  score,
  isOwnReply,
  userVote,
  onVote,
  onOpenAuthor,
  onReport,
  reportConfirmation,
  reportBusy,
}: {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  score: number;
  isOwnReply: boolean;
  userVote: -1 | 0 | 1;
  onVote: (replyId: string, value: -1 | 1) => void;
  onOpenAuthor?: () => void;
  onReport: (replyId: string, reason: ReportReason) => void;
  reportConfirmation: string | null;
  reportBusy: boolean;
}) {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <article className="replyCard">
      <div className="replyCardMain">
        <div className="replyMeta">
          {onOpenAuthor && !isOwnReply ? (
            <button className="replyAuthorButton" onClick={onOpenAuthor} type="button">
              {authorLabel}
            </button>
          ) : (
            <strong className="replyAuthorLabel">{authorLabel}</strong>
          )}
          <span>{formatTime(createdAt)}</span>
          <button
            className={styles.inlineAction}
            onClick={() => setReportOpen((current) => !current)}
            type="button"
          >
            {reportConfirmation ? "Gemeldet" : "Melden"}
          </button>
        </div>
        <p className="replyBody">{body}</p>
        {(reportOpen || reportConfirmation) && (
          <ReportPicker
            busy={reportBusy}
            compact
            confirmation={reportConfirmation}
            onCancel={() => setReportOpen(false)}
            onSubmit={(reason) => {
              onReport(id, reason);
              setReportOpen(false);
            }}
          />
        )}
      </div>

      <div className="voteRail">
        <button
          aria-label="Antwort hochvoten"
          className={userVote === 1 ? "voteButton voteButtonActive" : "voteButton"}
          onClick={() => onVote(id, 1)}
          type="button"
        >
          <VoteUpIcon className="voteIconSvg" />
        </button>
        <strong>{score}</strong>
        <button
          aria-label="Antwort runtervoten"
          className={userVote === -1 ? "voteButton voteButtonActive" : "voteButton"}
          onClick={() => onVote(id, -1)}
          type="button"
        >
          <VoteDownIcon className="voteIconSvg" />
        </button>
      </div>
    </article>
  );
}

export function ConsumerPostRoute({ postId }: { postId: string }) {
  const router = useRouter();
  const consumerApp = useConsumerApp();
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
    feedPosts,
    feedReplies,
    chatRequests,
    postVotes,
    replyVotes,
    createReply,
    createChatRequest,
    loadThread,
    tipPost,
    votePost,
    voteReply,
    retryHydration,
  } = consumerApp;
  const submitReport = (
    consumerApp as typeof consumerApp & {
      submitReport?: (input: {
        targetId: string;
        targetType: "post" | "reply";
        reason: string;
      }) => Promise<{ ok: boolean; message: string }>;
    }
  ).submitReport;
  const [replyBody, setReplyBody] = useState("");
  const [loadedDraftPostId, setLoadedDraftPostId] = useState<string | null>(null);
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [postReportOpen, setPostReportOpen] = useState(false);
  const [reportBusyTarget, setReportBusyTarget] = useState<string | null>(null);
  const [reportConfirmationByTarget, setReportConfirmationByTarget] = useState<Record<string, string>>({});
  const [replyFeedback, setReplyFeedback] = useState<string | null>(null);
  const replyComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const replyLength = replyBody.trim().length;

  useEffect(() => {
    if (booted && gateAccepted && location.status === "unknown") {
      resolveLocation();
    }
  }, [booted, gateAccepted, location.status]);

  useEffect(() => {
    if (!booted || !gateAccepted || location.status !== "ready" || hydrationStatus !== "ready") {
      return;
    }

    void loadThread(postId).catch((error: unknown) => {
      console.warn("NUUDL API post thread refresh failed.", error);
    });
  }, [booted, gateAccepted, hydrationStatus, location.status, postId]);

  useEffect(() => {
    setReplyBody(readReplyDraft(postId));
    setLoadedDraftPostId(postId);
    setReplyFeedback(null);
  }, [postId]);

  useEffect(() => {
    if (!booted || !gateAccepted || loadedDraftPostId !== postId) {
      return;
    }

    writeReplyDraft(postId, replyBody);
  }, [booted, gateAccepted, loadedDraftPostId, postId, replyBody]);

  useEffect(() => {
    autoResizeTextarea(replyComposerRef.current, 42, 112);
  }, [replyBody]);

  const post = feedPosts.find((entry) => entry.id === postId) ?? null;
  const repliesForPost = useMemo(
    () =>
      feedReplies
        .filter((reply) => reply.postId === postId && reply.moderation !== "blocked")
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)),
    [feedReplies, postId],
  );
  const channel = post ? channelEntries.find((entry) => entry.id === post.channelId) : undefined;
  const openAuthorChat = async (recipientInstallIdentityId?: string) => {
    if (!post || chatSubmitting) {
      return;
    }

    setChatSubmitting(true);
    await openOrCreateChatFromPost({
      createChatRequest,
      fallbackRoute: `/post/${post.id}`,
      installIdentityId,
      navigate: (href) => router.push(href),
      post: {
        ...post,
        recipientInstallIdentityId: recipientInstallIdentityId ?? post.recipientInstallIdentityId,
      },
      requests: chatRequests,
    });
    setChatSubmitting(false);
  };

  const submitInlineReport = async ({ targetId, targetType }: ReportTarget, reason: ReportReason) => {
    const reportKey = `${targetType}:${targetId}`;
    setReportBusyTarget(reportKey);

    try {
      if (submitReport) {
        const result = await submitReport({ reason, targetId, targetType });
        setReportConfirmationByTarget((current) => ({
          ...current,
          [reportKey]: result.ok ? "Danke, wir schauen es uns an." : result.message,
        }));
        return;
      }

      setReportConfirmationByTarget((current) => ({
        ...current,
        [reportKey]: "Danke, wir schauen es uns an.",
      }));
    } finally {
      setReportBusyTarget(null);
    }
  };

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
        message={hydrationMessage || "Beitrag wird mit der API synchronisiert."}
        onAction={hydrationStatus === "blocked" ? retryHydration : undefined}
        title={hydrationStatus === "blocked" ? "NUUDL ist gerade nicht erreichbar" : "Beitrag wird geladen"}
      />
    );
  }

  return (
    <main className="appLayout">
      <ConsumerPhoneFrame>
        <header className={`${styles.topBarCompact} topBar`}>
          <div className="topBarSide">
            <button
              className={`${styles.topBarBackButton} titleIconButton`}
              onClick={() => goBackOrFallback(router, "/")}
              type="button"
            >
              <BackIcon className="titleIconSvg" />
            </button>
          </div>

          <div className={`${styles.topBarCenter} topBarCenter`}>
            <span className={`${styles.topBarTitle} titleHeader`}>Beitrag</span>
            <span className={styles.topBarSubline}>{channel ? `@${channel.slug}` : activeCity.label}</span>
          </div>

          <div className="topBarSide topBarSideRight">
            <span className={styles.replyCountPill}>
              <strong>{repliesForPost.length}</strong>
              <span>Antworten</span>
            </span>
          </div>
        </header>

        <section className={styles.threadColumn}>
          <ConsumerScreenBody>
            {post ? (
              <section className={`${styles.threadScreen} screenStack`}>
                <div className={`${styles.threadIntro} screenHeaderBlock`}>
                  <div className={styles.threadIntroMeta}>
                    <span>{activeCity.label}</span>
                    <span>{channel ? `@${channel.slug}` : "main"}</span>
                    <span>{repliesForPost.length} Antworten</span>
                  </div>
                  <p className={styles.threadIntroCopy}>Diskussion aus deinem Stadtfeed.</p>
                </div>

                <div className={styles.threadPostWrap}>
                  <FeedCard
                    channel={channel}
                    onOpenAuthor={() => openAuthorChat(post.recipientInstallIdentityId)}
                    onVote={(value) => votePost(post.id, value)}
                    onTip={(amountCents) => tipPost(post.id, amountCents)}
                    post={post}
                    replyCount={repliesForPost.length}
                    userVote={postVotes[post.id] ?? 0}
                  />
                </div>
                <div className={styles.postActionsRow}>
                  <button className={styles.inlineAction} onClick={() => setPostReportOpen((current) => !current)} type="button">
                    {reportConfirmationByTarget[`post:${post.id}`] ? "Beitrag gemeldet" : "Melden"}
                  </button>
                </div>
                {(postReportOpen || reportConfirmationByTarget[`post:${post.id}`]) && (
                  <div className={styles.postReportWrap}>
                    <ReportPicker
                      busy={reportBusyTarget === `post:${post.id}`}
                      confirmation={reportConfirmationByTarget[`post:${post.id}`] ?? null}
                      onCancel={() => setPostReportOpen(false)}
                      onSubmit={(reason) => {
                        void submitInlineReport({ targetId: post.id, targetType: "post" }, reason);
                        setPostReportOpen(false);
                      }}
                    />
                  </div>
                )}

                <div className={`${styles.repliesSection} screenHeaderBlock`}>
                  <h2 className={`${styles.replyListHeading} screenHeading`}>Diskussion</h2>
                </div>

                <div className={styles.replyList}>
                  {repliesForPost.length ? (
                    repliesForPost.map((reply) => (
                      <div className={styles.replyItemWrap} key={reply.id}>
                      <ReplyCard
                        authorLabel={reply.authorLabel}
                        body={reply.body}
                        createdAt={reply.createdAt}
                        id={reply.id}
                        isOwnReply={reply.recipientInstallIdentityId === installIdentityId}
                        onOpenAuthor={
                          reply.recipientInstallIdentityId && reply.recipientInstallIdentityId !== installIdentityId
                            ? () => openAuthorChat(reply.recipientInstallIdentityId)
                            : undefined
                        }
                        onVote={voteReply}
                        onReport={(replyId, reason) => {
                          void submitInlineReport({ targetId: replyId, targetType: "reply" }, reason);
                        }}
                        reportBusy={reportBusyTarget === `reply:${reply.id}`}
                        reportConfirmation={reportConfirmationByTarget[`reply:${reply.id}`] ?? null}
                        score={reply.score}
                        userVote={replyVotes[reply.id] ?? 0}
                      />
                    </div>
                    ))
                  ) : (
                    <div className={`${styles.replyEmpty} emptyState`}>
                      <strong>Noch keine Antworten.</strong>
                      <p className="supportCopy">Die erste Antwort startet hier die Diskussion.</p>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className="screenStack">
                <div className="emptyState">
                  <strong>Beitrag nicht gefunden.</strong>
                  <p className="supportCopy">Dieser Beitrag ist nicht mehr verfuegbar oder passt nicht zu deinem aktuellen Feed.</p>
                  <button className="primaryButton" onClick={() => goBackOrFallback(router, "/")} type="button">
                    Zurueck zum Feed
                  </button>
                </div>
              </section>
            )}
          </ConsumerScreenBody>

          {post ? (
            <>
              <div className={styles.replyComposerDock}>
                <textarea
                  className={`${styles.replyComposerInput} composerInput`}
                  ref={replyComposerRef}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder="Antwort schreiben..."
                  rows={1}
                  value={replyBody}
                />
                <button
                  className={`${styles.replyComposerButton} primaryButton`}
                  disabled={!replyLength}
                  onClick={async () => {
                    setReplyFeedback(null);
                    const createdReplyId = await createReply({ postId, body: replyBody });

                    if (createdReplyId) {
                      setReplyBody("");
                      clearReplyDraft(postId);
                      return;
                    }

                    setReplyFeedback("Antwort konnte gerade nicht gesendet werden.");
                  }}
                  type="button"
                >
                  Senden
                </button>
              </div>
              {replyFeedback ? <p className="supportCopy">{replyFeedback}</p> : null}
            </>
          ) : null}
        </section>

        <ConsumerBottomNav activeView="feed" onChangeView={(nextView) => router.push(hrefByView[nextView])} />
      </ConsumerPhoneFrame>

      <ConsumerDesktopHint />
    </main>
  );
}

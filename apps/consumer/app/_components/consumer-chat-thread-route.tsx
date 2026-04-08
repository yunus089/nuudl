"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { consumerApi } from "../_lib/consumer-api";
import { useConsumerApp } from "./consumer-provider";
import { autoResizeTextarea, formatTime, goBackOrFallback, readFileAsDataUrl } from "./consumer-helpers";
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
import styles from "./consumer-chat-thread-route.module.css";

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

function chatDraftStorageKey(requestId: string) {
  return `nuudl-chat-draft:${requestId}`;
}

function readChatDraft(requestId: string) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(chatDraftStorageKey(requestId)) ?? "";
  } catch {
    return "";
  }
}

function writeChatDraft(requestId: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!value.trim()) {
      window.localStorage.removeItem(chatDraftStorageKey(requestId));
      return;
    }

    window.localStorage.setItem(chatDraftStorageKey(requestId), value);
  } catch {
    // Ignore storage errors in the chat flow.
  }
}

function clearChatDraft(requestId: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(chatDraftStorageKey(requestId));
  } catch {
    // Ignore storage errors in the chat flow.
  }
}

function AttachIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path
        d="M9 12.25 13.35 7.9a2.1 2.1 0 1 1 2.97 2.97l-6.46 6.46a3.35 3.35 0 0 1-4.74-4.74l7.17-7.17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.85"
      />
    </svg>
  );
}

function ReportPicker({
  busy,
  confirmation,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  confirmation: string | null;
  onCancel: () => void;
  onSubmit: (reason: ReportReason) => void;
}) {
  const [selectedReason, setSelectedReason] = useState<ReportReason>("spam");

  if (confirmation) {
    return <div className={styles.inlineConfirmation}>{confirmation}</div>;
  }

  return (
    <div className={styles.inlineReport}>
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

export function ConsumerChatThreadRoute({ requestId }: { requestId: string }) {
  const router = useRouter();
  const consumerApp = useConsumerApp();
  const {
    booted,
    accountState,
    hydrationMessage,
    hydrationStatus,
    gateAccepted,
    location,
    acceptGate,
    resolveLocation,
    activeCity,
    installIdentityId,
    chatRequests,
    chatMessages,
    feedPosts,
    loadChatOverview,
    loadChatThread,
    respondChatRequest,
    sendChatMessage,
    markChatThreadRead,
    retryHydration,
  } = consumerApp;
  const submitReport = (
    consumerApp as typeof consumerApp & {
      submitReport?: (input: {
        cityId?: string;
        reason: string;
        targetId: string;
        targetType: "chat" | "post" | "reply";
      }) => Promise<{ ok: boolean; message: string }>;
    }
  ).submitReport;
  const [messageBody, setMessageBody] = useState("");
  const [loadedDraftRequestId, setLoadedDraftRequestId] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<{
    id: string;
    kind: "image";
    dataUrl: string;
    file: File;
    name: string;
  } | null>(null);
  const [chatReportOpen, setChatReportOpen] = useState(false);
  const [chatReportConfirmation, setChatReportConfirmation] = useState<string | null>(null);
  const [chatReportBusy, setChatReportBusy] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [messageSubmitting, setMessageSubmitting] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<string | null>(null);
  const messageComposerRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (booted && gateAccepted && location.status === "unknown") {
      resolveLocation();
    }
  }, [booted, gateAccepted, location.status]);

  useEffect(() => {
    if (!booted || !gateAccepted || location.status !== "ready" || hydrationStatus !== "ready") {
      return;
    }

    void loadChatOverview().catch((error: unknown) => {
      console.warn("NUUDL API chat request refresh failed.", error);
    });
    void loadChatThread(requestId).catch((error: unknown) => {
      console.warn("NUUDL API chat thread refresh failed.", error);
    });
  }, [booted, gateAccepted, hydrationStatus, location.status, requestId]);

  useEffect(() => {
    setMessageBody(readChatDraft(requestId));
    setLoadedDraftRequestId(requestId);
    setChatReportOpen(false);
    setChatReportConfirmation(null);
    setSendFeedback(null);
    setPendingMedia(null);
  }, [requestId]);

  useEffect(() => {
    if (!booted || !gateAccepted || loadedDraftRequestId !== requestId) {
      return;
    }

    writeChatDraft(requestId, messageBody);
  }, [booted, gateAccepted, loadedDraftRequestId, messageBody, requestId]);

  useEffect(() => {
    autoResizeTextarea(messageComposerRef.current, 42, 112);
  }, [messageBody]);

  const request = chatRequests.find((entry) => entry.id === requestId) ?? null;
  const relatedPost = request ? feedPosts.find((entry) => entry.id === request.postId) ?? null : null;
  const contactLabel = relatedPost?.authorLabel ?? "Person";
  const isRequestRecipient =
    (Boolean(accountState?.id) && request?.toAccountId === accountState?.id) || request?.toInstallIdentityId === installIdentityId;
  const isRequestSender =
    (Boolean(accountState?.id) && request?.fromAccountId === accountState?.id) || request?.fromInstallIdentityId === installIdentityId;
  const threadMessages = useMemo(
    () =>
      chatMessages
        .filter((entry) => entry.chatRequestId === requestId)
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)),
    [chatMessages, requestId],
  );
  const emptyThreadTitle =
    request?.status === "declined"
      ? "Diese Anfrage wurde abgelehnt."
      : request?.status === "accepted"
        ? "Noch keine Nachrichten."
        : isRequestSender
          ? "Wartet auf Antwort."
          : isRequestRecipient
            ? "Gib den Chat frei, um zu antworten."
            : "Dieser Chat ist noch nicht aktiv.";
  const emptyThreadCopy =
    request?.status === "declined"
      ? "Der direkte Chat wurde nicht freigeschaltet."
      : request?.status === "accepted"
        ? `Schreib die erste Nachricht an ${contactLabel}.`
        : isRequestSender
          ? `Sobald ${contactLabel} antwortet, erscheint der Chat hier.`
          : isRequestRecipient
            ? `Nach deiner Freigabe startet die Unterhaltung mit ${contactLabel}.`
            : "Sobald der Chat freigegeben ist, erscheinen hier Nachrichten.";

  useEffect(() => {
    if (request?.status === "accepted") {
      markChatThreadRead(requestId);
    }
  }, [markChatThreadRead, request?.status, requestId]);

  const submitChatReport = async (reason: ReportReason) => {
    setChatReportBusy(true);

    try {
      if (submitReport) {
        const result = await submitReport({
          cityId: activeCity.id,
          reason,
          targetId: requestId,
          targetType: "chat",
        });
        setChatReportConfirmation(result.ok ? "Danke, wir schauen es uns an." : result.message);
        return;
      }

      setChatReportConfirmation("Danke, wir schauen es uns an.");
    } catch (error) {
      console.warn("NUUDL chat report failed, keeping local confirmation.", error);
      setChatReportConfirmation("Danke, wir schauen es uns an.");
    } finally {
      setChatReportBusy(false);
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
        message={hydrationMessage || "Chat wird mit der API synchronisiert."}
        onAction={hydrationStatus === "blocked" ? retryHydration : undefined}
        title={hydrationStatus === "blocked" ? "NUUDL ist gerade nicht erreichbar" : "Chat wird geladen"}
      />
    );
  }

  return (
    <main className="appLayout">
      <ConsumerPhoneFrame>
        <header className={`${styles.topBar} topBar`}>
          <div className="topBarSide">
            <button className="titleIconButton" onClick={() => goBackOrFallback(router, "/chat")} type="button">
              <BackIcon className="titleIconSvg" />
            </button>
          </div>

          <div className={`${styles.topBarCenter} topBarCenter`}>
            <span className="titleHeader">{request ? contactLabel : "Chat"}</span>
            <span className={styles.topBarSubline}>{request ? `seit ${formatTime(request.createdAt)}` : "Nachricht"}</span>
          </div>

          <div className="topBarSide topBarSideRight">
            <span className={`${styles.topBarStatus} ${styles.statusPill}`}>
              {request?.status === "accepted"
                ? "Aktiv"
                : request?.status === "pending"
                  ? isRequestRecipient
                    ? "Freigeben"
                    : "Wartet"
                  : request?.status === "declined"
                    ? "Abgelehnt"
                    : "Inaktiv"}
            </span>
          </div>
        </header>

        <section className={styles.threadColumn}>
          <ConsumerScreenBody>
            {request ? (
              <section className={styles.screen}>
                {request.status === "accepted" ? (
                  <article className={`${styles.requestCard} ${styles.requestCardCompact}`}>
                    <div className={styles.compactMetaRow}>
                      <span className={styles.compactMetaLabel}>Zu diesem Beitrag</span>
                      <span className={styles.compactMetaTime}>{formatTime(request.createdAt)}</span>
                    </div>
                    <p className={styles.compactMetaBody}>
                      {relatedPost ? relatedPost.body : `Direkte Unterhaltung mit ${contactLabel}.`}
                    </p>
                  </article>
                ) : (
                  <article className={styles.requestCard}>
                    <div className={styles.requestTop}>
                      <div>
                        <p className={styles.eyebrow}>Person</p>
                        <h1 className={styles.requestTitle}>{contactLabel}</h1>
                        <p className={styles.requestCopy}>
                          {request.status === "declined" ? "Diese Anfrage wurde abgelehnt." : "Noch nicht freigeschaltet."}
                        </p>
                      </div>
                      <span className={`${styles.statusPill} ${styles.statusMuted}`}>
                        {request.status === "declined"
                          ? "Abgelehnt"
                          : request.status === "pending"
                            ? isRequestRecipient
                              ? "Freigeben"
                              : "Wartet"
                            : "Inaktiv"}
                      </span>
                    </div>

                    {relatedPost ? (
                      <div className={styles.sourceCard}>
                        <span className={styles.sourceLabel}>Zu diesem Beitrag</span>
                        <p className={styles.sourceBody}>{relatedPost.body}</p>
                      </div>
                    ) : null}

                    <div className={styles.metaRow}>
                      <span>{relatedPost ? `mit ${contactLabel}` : "Direkte Nachricht"}</span>
                      <span>{formatTime(request.createdAt)}</span>
                    </div>

                    {isRequestRecipient ? (
                      <div className={styles.actionRow}>
                        <button
                          className="primaryButton"
                          disabled={requestSubmitting}
                          onClick={async () => {
                            setRequestSubmitting(true);
                            const result = await respondChatRequest(request.id, "accepted");
                            setRequestSubmitting(false);
                            setSendFeedback(result.message);
                          }}
                          type="button"
                        >
                          {requestSubmitting ? "..." : "Freigeben"}
                        </button>
                        <button
                          className="secondaryButton"
                          disabled={requestSubmitting}
                          onClick={async () => {
                            setRequestSubmitting(true);
                            const result = await respondChatRequest(request.id, "declined");
                            setRequestSubmitting(false);
                            setSendFeedback(result.message);
                          }}
                          type="button"
                        >
                          {requestSubmitting ? "..." : "Ablehnen"}
                        </button>
                      </div>
                    ) : (
                      <p className={styles.hintText}>Gesendet. Sobald {contactLabel} antwortet, startet der Chat hier.</p>
                    )}

                    {request.status === "declined" ? <p className={styles.hintText}>Diese Anfrage wurde abgelehnt.</p> : null}
                    {sendFeedback ? <p className={`${styles.hintText} ${styles.feedbackText}`}>{sendFeedback}</p> : null}
                  </article>
                )}

                <div className={styles.chatActionRow}>
                  <button
                    className={styles.inlineAction}
                    onClick={() => setChatReportOpen((current) => !current)}
                    type="button"
                  >
                    {chatReportConfirmation ? "Chat gemeldet" : "Melden"}
                  </button>
                </div>

                {(chatReportOpen || chatReportConfirmation) && (
                  <div className={styles.chatReportWrap}>
                    <ReportPicker
                      busy={chatReportBusy}
                      confirmation={chatReportConfirmation}
                      onCancel={() => setChatReportOpen(false)}
                      onSubmit={(reason) => {
                        void submitChatReport(reason);
                        setChatReportOpen(false);
                      }}
                    />
                  </div>
                )}

                <div className={styles.messageList}>
                  {threadMessages.length ? (
                    threadMessages.map((message) => {
                      const isOwnMessage =
                        (Boolean(accountState?.id) && message.accountId === accountState?.id) ||
                        message.senderInstallIdentityId === installIdentityId;

                      return (
                        <div
                          className={isOwnMessage ? `${styles.messageBubble} ${styles.messageBubbleSelf}` : styles.messageBubble}
                          key={message.id}
                        >
                          <div className={styles.messageHead}>
                            <strong>{isOwnMessage ? "Du" : contactLabel}</strong>
                            <span>{message.readAt ? `gelesen ${formatTime(message.readAt)}` : formatTime(message.createdAt)}</span>
                          </div>
                          {message.body ? <p>{message.body}</p> : null}
                          {message.media.length ? (
                            <div className={styles.messageMediaGrid}>
                              {message.media.map((asset) => (
                                <div className={styles.messageMediaFrame} key={asset.id}>
                                  <img alt="Chat Bild" className={styles.messageMediaImage} draggable={false} src={asset.url} />
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.emptyThread}>
                      <strong>{emptyThreadTitle}</strong>
                      <p>{emptyThreadCopy}</p>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className={styles.screen}>
                <div className={styles.emptyThread}>
                  <strong>Chat nicht gefunden.</strong>
                  <p>Dieser Chat ist gerade nicht verfuegbar.</p>
                  <button className="primaryButton" onClick={() => goBackOrFallback(router, "/chat")} type="button">
                    Zurueck zu Chats
                  </button>
                </div>
              </section>
            )}
          </ConsumerScreenBody>

          {request?.status === "accepted" ? (
            <div className={styles.composerDock}>
                {pendingMedia ? (
                  <div className={styles.pendingMediaPreview}>
                    <img alt={pendingMedia.name} className={styles.pendingMediaImage} draggable={false} src={pendingMedia.dataUrl} />
                    <div className={styles.pendingMediaMeta}>
                      <strong>{pendingMedia.name || "Bild"}</strong>
                      <span>Bild bereit zum Senden</span>
                    </div>
                    <button className={styles.pendingMediaRemove} onClick={() => setPendingMedia(null)} type="button">
                      Entfernen
                    </button>
                  </div>
                ) : null}

              <div className={styles.composerDockRow}>
                <input
                  accept="image/*"
                  className={styles.hiddenFileInput}
                  hidden
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    event.currentTarget.value = "";

                    if (!file || !file.type.startsWith("image/")) {
                      return;
                    }

                    void (async () => {
                      try {
                        const dataUrl = await readFileAsDataUrl(file);
                        setPendingMedia({
                          id: `chat-media-${Date.now()}`,
                          kind: "image",
                          name: file.name,
                          dataUrl,
                          file,
                        });
                      } catch (error) {
                        console.warn("NUUDL chat image read failed.", error);
                      }
                    })();
                  }}
                  ref={mediaInputRef}
                  type="file"
                />
                <button
                  className={styles.attachButton}
                  onClick={() => mediaInputRef.current?.click()}
                  type="button"
                >
                  <AttachIcon className={styles.attachIconSvg} />
                </button>
                <textarea
                  className={`${styles.composerInput} composerInput`}
                  ref={messageComposerRef}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder={`Nachricht an ${contactLabel}...`}
                  rows={1}
                  value={messageBody}
                />
                <button
                  className={`${styles.sendButton} primaryButton`}
                  disabled={!messageBody.trim() || messageSubmitting}
                  onClick={async () => {
                    setMessageSubmitting(true);
                    let uploadedMedia:
                      | Array<{
                          kind: "image";
                          url: string;
                        }>
                      | undefined;

                    try {
                      uploadedMedia = pendingMedia ? [{ kind: "image", url: (await consumerApi.uploadMedia(pendingMedia.file)).asset.url }] : undefined;
                    } catch (error) {
                      console.warn("NUUDL chat image upload failed.", error);
                      setMessageSubmitting(false);
                      setSendFeedback("Bild konnte gerade nicht hochgeladen werden.");
                      return;
                    }

                    const result = await sendChatMessage(request.id, messageBody, uploadedMedia);
                    setMessageSubmitting(false);

                    if (result.ok && result.messageId) {
                      setMessageBody("");
                      setSendFeedback(null);
                      clearChatDraft(request.id);
                      setPendingMedia(null);
                      return;
                    }

                    setSendFeedback(result.message);
                  }}
                  type="button"
                >
                  {messageSubmitting ? "..." : "Senden"}
                </button>
              </div>

              {sendFeedback ? <p className={styles.sendFeedback}>{sendFeedback}</p> : null}
            </div>
          ) : null}
        </section>

        <ConsumerBottomNav activeView="chat" onChangeView={(nextView) => router.push(hrefByView[nextView])} />
      </ConsumerPhoneFrame>

      <ConsumerDesktopHint />
    </main>
  );
}

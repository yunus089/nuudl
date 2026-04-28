"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { rootTabs, titleForView } from "./consumer-helpers";
import type { RootView, TopBarVariant } from "./consumer-types";

type IconProps = {
  className?: string;
};

export function BackIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path
        d="M14.5 6.5 8.5 12l6 5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path
        d="m7.5 10 4.5 4.5 4.5-4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path
        d="m10 7.5 4.5 4.5-4.5 4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path d="M12 6.5v11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M6.5 12h11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

export function VoteUpIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path
        d="m7.5 14.5 4.5-5 4.5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

export function VoteDownIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <path
        d="m7.5 9.5 4.5 5 4.5-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function NavIcon({ view }: { view: RootView }) {
  switch (view) {
    case "feed":
      return (
        <svg aria-hidden="true" className="navIconSvg" viewBox="0 0 24 24">
          <path d="M4.5 10.5 12 4.5l7.5 6v8a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M9.5 19.5v-5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "discover":
      return (
        <svg aria-hidden="true" className="navIconSvg" viewBox="0 0 24 24">
          <circle cx="12" cy="12" fill="none" r="7.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="m9 15 2-6 6-2-2 6-6 2Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <circle cx="12" cy="12" fill="currentColor" r="1.1" />
        </svg>
      );
    case "chat":
      return (
        <svg aria-hidden="true" className="navIconSvg" viewBox="0 0 24 24">
          <path d="M6 7.5h12a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 18 16.5H11l-4.5 3v-3H6A1.5 1.5 0 0 1 4.5 15V9A1.5 1.5 0 0 1 6 7.5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
      );
    case "alerts":
      return (
        <svg aria-hidden="true" className="navIconSvg" viewBox="0 0 24 24">
          <path d="M12 4.5a4.5 4.5 0 0 1 4.5 4.5v2.4c0 .8.2 1.6.7 2.2l1 1.3c.5.7 0 1.6-.8 1.6H6.6c-.8 0-1.3-.9-.8-1.6l1-1.3c.5-.6.7-1.4.7-2.2V9A4.5 4.5 0 0 1 12 4.5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
          <path d="M10 18.5a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    case "me":
      return (
        <svg aria-hidden="true" className="navIconSvg" viewBox="0 0 24 24">
          <circle cx="12" cy="8.2" fill="none" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6.5 18.5a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      );
    default:
      return null;
  }
}

export function ConsumerGateScreen({
  betaInviteRequired = false,
  onAcceptGate,
}: {
  betaInviteRequired?: boolean;
  onAcceptGate: (betaInviteCode?: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const result = await onAcceptGate(inviteCode);
    if (!result.ok) {
      setMessage(result.message);
    }

    setSubmitting(false);
  };

  return (
    <main className="gate">
      <form className="gateCard" onSubmit={handleSubmit}>
        <p className="eyebrow">18+</p>
        <h1>Nur für Erwachsene.</h1>
        <p className="supportCopy">
          Nach deiner Bestätigung wird NUUDL an deinen Standort und eine feste Stadt gebunden. NUUDL läuft direkt im Browser als mobile App.
        </p>
        {betaInviteRequired ? (
          <label className="gateInviteField">
            <span>Beta-Code</span>
            <input
              autoCapitalize="characters"
              autoComplete="one-time-code"
              inputMode="text"
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="z. B. NUUDL-MUC-001"
              value={inviteCode}
            />
          </label>
        ) : null}
        {message ? <p className="gateError">{message}</p> : null}
        <button className="primaryButton" disabled={submitting} type="submit">
          {submitting ? "Prüfe..." : betaInviteRequired ? "Code prüfen und 18+ bestätigen" : "Ich bin 18+"}
        </button>
        <p className="gateConsent">
          Mit der Bestätigung stimmst du den{" "}
          <Link href="/nutzungsbedingungen" target="_blank">Nutzungsbedingungen</Link>
          {" "}zu.{" "}
          <Link href="/impressum" target="_blank">Impressum</Link>
          {" · "}
          <Link href="/meldepfad" target="_blank">Meldepfad</Link>
        </p>
      </form>
    </main>
  );
}

export function ConsumerStatusScreen({
  eyebrow = "Status",
  title,
  message,
  actionLabel,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <main className="gate">
      <section className="gateCard">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="supportCopy">{message}</p>
        {actionLabel && onAction ? (
          <button className="primaryButton" onClick={onAction} type="button">
            {actionLabel}
          </button>
        ) : null}
      </section>
    </main>
  );
}

export function ConsumerPhoneFrame({ children }: { children: ReactNode }) {
  return <section className="phoneFrame">{children}</section>;
}

export function ConsumerTopBar({
  variant,
  view,
  activeCityLabel,
  unreadCount,
  onGoBack,
  onOpenPlus,
  onOpenLocation,
  onOpenMe,
  onOpenSettings,
}: {
  variant: TopBarVariant;
  view: RootView;
  activeCityLabel: string;
  unreadCount: number;
  onGoBack: () => void;
  onOpenPlus: () => void;
  onOpenLocation: () => void;
  onOpenMe: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <header className="topBar">
      {variant === "home" ? (
        <>
          <div className="topBarSide" />

          <div className="topBarCenter">
            <button className="utilityCity" onClick={onOpenLocation} type="button">
              <span className="utilityCityLabel">{activeCityLabel}</span>
              <span className="utilityCityChevron">
                <ChevronDownIcon className="utilityCityChevronSvg" />
              </span>
            </button>
          </div>

          <div className="topBarSide topBarSideRight" />
        </>
      ) : (
        <>
          <div className="topBarSide">
            <button className="titleIconButton" onClick={onGoBack} type="button">
              <BackIcon className="titleIconSvg" />
            </button>
          </div>

          <div className="topBarCenter">
            <span className="titleHeader">{titleForView(view, activeCityLabel)}</span>
          </div>

          <div className="topBarSide topBarSideRight">
            {view === "me" ? (
              <button className="utilityButton utilityUpgrade" onClick={onOpenSettings} type="button">
                Mehr
              </button>
            ) : view === "alerts" && unreadCount > 0 ? (
              <span className="utilityKarma utilityKarmaCompact">
                <strong>{unreadCount}</strong>
                <span>NEU</span>
              </span>
            ) : null}
          </div>
        </>
      )}
    </header>
  );
}

export function ConsumerScreenBody({ children }: { children: ReactNode }) {
  return <div className="screenBody">{children}</div>;
}

export function ConsumerBottomNav({
  activeView,
  onChangeView,
}: {
  activeView: RootView;
  onChangeView: (view: RootView) => void;
}) {
  return (
    <nav className="bottomNav">
      {rootTabs.map((tab) => (
        <button
          className={tab.id === activeView ? "navButton navButtonActive" : "navButton"}
          aria-label={tab.label}
          key={tab.id}
          onClick={() => onChangeView(tab.id)}
          type="button"
        >
          <span className="navIcon">
            <NavIcon view={tab.id} />
          </span>
          <small>{tab.label}</small>
        </button>
      ))}
    </nav>
  );
}

export function ConsumerDesktopHint() {
  return (
    <aside className="desktopHint">
      <strong>Nur mobil</strong>
      <p>NUUDL läuft als mobile App mit echten Bereichen für Feed, Channels, Chat, Alerts und Ich.</p>
    </aside>
  );
}

export function ConsumerSheet({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const onCloseRef = useRef(onClose);
  const historyMarkerRef = useRef(`nuudl-sheet-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const closingFromHistoryRef = useRef(false);

  const requestClose = () => {
    if (typeof window !== "undefined" && !closingFromHistoryRef.current) {
      const state = window.history.state as Record<string, unknown> | null;
      if (state?.nuudlSheetId === historyMarkerRef.current) {
        window.history.back();
        return;
      }
    }

    onCloseRef.current();
  };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const marker = historyMarkerRef.current;
    const previousState = window.history.state && typeof window.history.state === "object"
      ? (window.history.state as Record<string, unknown>)
      : {};

    window.history.pushState({ ...previousState, nuudlSheetId: marker }, "", window.location.href);

    const handlePopState = () => {
      closingFromHistoryRef.current = true;
      onCloseRef.current();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      requestClose();
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="sheetBackdrop" onClick={requestClose}>
      <section aria-modal="true" className="sheetPanel" onClick={(event) => event.stopPropagation()} role="dialog">
        <header className="sheetHeader">
          <button className="headerButton" onClick={requestClose} type="button">
            Schließen
          </button>
          {title ? <strong>{title}</strong> : <span />}
          <span className="sheetSpacer" />
        </header>
        <div className="sheetBody">{children}</div>
      </section>
    </div>
  );
}

const FIRST_POST_OVERLAY_KEY = "nuudl-first-post-overlay-shown";

export function hasSeenFirstPostOverlay(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(FIRST_POST_OVERLAY_KEY) === "1";
}

export function markFirstPostOverlayShown(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FIRST_POST_OVERLAY_KEY, "1");
}

export function FirstPostOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  function handleTap() {
    if (exiting) return;
    setExiting(true);
    setTimeout(onDismiss, 180);
  }

  return (
    <div
      onClick={handleTap}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "#000",
        display: "grid",
        placeItems: "center",
        padding: "0 32px",
        opacity: exiting ? 0 : 1,
        transition: exiting ? "opacity 180ms ease-in" : "opacity 250ms ease-out",
        cursor: "pointer",
      }}
    >
      <p
        style={{
          fontSize: "22px",
          fontWeight: 400,
          lineHeight: 1.8,
          color: "rgba(255,255,255,0.92)",
          textAlign: "center",
          maxWidth: "280px",
          margin: 0,
        }}
      >
        <span style={{ display: "block" }}>Kein Name.</span>
        <span style={{ display: "block" }}>Kein Gesicht.</span>
        <span style={{ display: "block" }}>Niemand weiß, dass du das bist.</span>
      </p>
    </div>
  );
}

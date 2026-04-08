"use client";

import type { ReactNode } from "react";
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

export function ConsumerGateScreen({ onAcceptGate }: { onAcceptGate: () => void }) {
  return (
    <main className="gate">
      <section className="gateCard">
        <p className="eyebrow">18+</p>
        <h1>Nur für Erwachsene.</h1>
        <p className="supportCopy">
          Nach deiner Bestätigung wird NUUDL an deinen Standort und eine feste Stadt gebunden. NUUDL läuft direkt im Browser als mobile App.
        </p>
        <button className="primaryButton" onClick={onAcceptGate} type="button">
          Ich bin 18+
        </button>
      </section>
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
  karma = "40943",
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
  karma?: string;
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
          <div className="topBarSide">
            <button className="utilityButton utilityUpgrade" onClick={onOpenPlus} type="button">
              Plus
            </button>
          </div>

          <div className="topBarCenter">
            <button className="utilityCity" onClick={onOpenLocation} type="button">
              <span className="utilityCityLabel">{activeCityLabel}</span>
              <span className="utilityCityChevron">
                <ChevronDownIcon className="utilityCityChevronSvg" />
              </span>
            </button>
          </div>

          <div className="topBarSide topBarSideRight">
            <button className="utilityKarma utilityKarmaCompact" onClick={onOpenMe} type="button">
              <strong>{karma}</strong>
              <span>KARMA</span>
            </button>
          </div>
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
            ) : (
              <button className="utilityKarma utilityKarmaCompact" onClick={onOpenMe} type="button">
                <strong>{view === "alerts" ? String(unreadCount) : karma}</strong>
                <span>{view === "alerts" ? "NEU" : "KARMA"}</span>
              </button>
            )}
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
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheetBackdrop">
      <section className="sheetPanel">
        <header className="sheetHeader">
          <button className="headerButton" onClick={onClose} type="button">
            Schließen
          </button>
          <strong>{title}</strong>
          <span className="sheetSpacer" />
        </header>
        <div className="sheetBody">{children}</div>
      </section>
    </div>
  );
}

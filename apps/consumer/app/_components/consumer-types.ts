import type { CityContext } from "@veil/shared";

export type GateState = "pending" | "accepted";

export type RootView = "feed" | "discover" | "chat" | "alerts" | "me";

export type SheetView = null | "location" | "plus" | "settings" | "wallet" | "creator" | "composer" | "profile";

export type FeedSort = "Neu" | "Kommentiert" | "Lauteste";

export type ChatTab = "requests" | "threads" | "safety";

export type AlertTab = "all" | "money" | "safety";

export type LocationState = {
  status: "unknown" | "loading" | "ready" | "blocked";
  city: CityContext | null;
  message: string;
};

export type RootTab = {
  id: RootView;
  label: string;
  glyph: string;
};

export type TopBarVariant = "home" | "section";

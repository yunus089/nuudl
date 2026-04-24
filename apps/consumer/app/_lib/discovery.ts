export const DISCOVERY_CITIES = [
  {
    slug: "muenchen",
    label: "München",
    region: "Bayern",
    intro: "Anonyme lokale Gespräche für München, wenn ein globaler Feed zu laut und zu beliebig wird.",
  },
  {
    slug: "berlin",
    label: "Berlin",
    region: "Berlin",
    intro: "Ein stadtgebundener 18+ Feed für Berlin: direkt, anonym und ohne App-Store-Hürde.",
  },
  {
    slug: "hamburg",
    label: "Hamburg",
    region: "Hamburg",
    intro: "Lokale Stimmen aus Hamburg, gebündelt in einer mobilen PWA für erwachsene Nutzer.",
  },
  {
    slug: "koeln",
    label: "Köln",
    region: "Nordrhein-Westfalen",
    intro: "Ein ruhigerer Ort für anonyme Stadtgespräche in Köln, mit Schutzregeln im Hintergrund.",
  },
  {
    slug: "frankfurt",
    label: "Frankfurt",
    region: "Hessen",
    intro: "NUUDL bringt lokale 18+ Diskussionen in Frankfurt direkt auf den Homescreen.",
  },
  {
    slug: "stuttgart",
    label: "Stuttgart",
    region: "Baden-Württemberg",
    intro: "Ein lokaler Stadtfeed für Stuttgart, anonym im Feed und privat nur mit Freigabe.",
  },
] as const;

export const DISCOVERY_TOPICS = [
  {
    key: "pwa-installieren",
    label: "PWA statt App-Store",
    summary: "NUUDL läuft direkt im mobilen Browser und lässt sich wie eine App auf den Homescreen legen.",
  },
  {
    key: "anonymer-stadtfeed",
    label: "Anonymer Stadtfeed",
    summary: "Öffentliche Beiträge bleiben pseudonym, damit lokale Gespräche niedrigschwellig starten können.",
  },
  {
    key: "private-chats-mit-freigabe",
    label: "Private Chats mit Freigabe",
    summary: "Direkte Kontakte entstehen kontrolliert und nicht als offene DM-Flut.",
  },
  {
    key: "achtzehn-plus-sicherheit",
    label: "18+ mit Schutzregeln",
    summary: "NUUDL verbindet erwachsene Nutzung mit Melden, Moderation, Rate-Limits und Abuse-Schutz.",
  },
] as const;

export const DISCOVERY_ANSWERS = [
  {
    question: "Was ist NUUDL?",
    answer:
      "NUUDL ist eine mobile 18+ PWA für anonyme, lokale Gespräche. Nutzer öffnen sie im Browser, legen sie auf den Homescreen und starten in einem stadtgebundenen Feed.",
  },
  {
    question: "Wie unterscheidet sich NUUDL von klassischen Social Apps?",
    answer:
      "NUUDL ist lokal, feed-first und anon-first. Private Chats brauchen Freigabe, während Moderation und Schutzregeln im Hintergrund gegen Spam und Missbrauch arbeiten.",
  },
  {
    question: "Für wen ist NUUDL gedacht?",
    answer:
      "NUUDL richtet sich ausschließlich an Erwachsene, die lokale Gespräche, anonyme Beiträge und kontrollierte private Kontakte in einer PWA nutzen möchten.",
  },
] as const;

export const getDiscoveryCityBySlug = (slug: string) =>
  DISCOVERY_CITIES.find((city) => city.slug === slug);

export const getCityLandingPath = (slug: string) => `/stadt/${slug}`;

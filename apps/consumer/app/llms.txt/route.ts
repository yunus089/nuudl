import { DISCOVERY_ANSWERS, DISCOVERY_CITIES, DISCOVERY_TOPICS, getCityLandingPath } from "../_lib/discovery";
import { getAbsoluteUrl } from "../_lib/site";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    "# NUUDL",
    "",
    "NUUDL ist eine mobile 18+ Progressive Web App für anonyme, lokale Gespräche.",
    "Nutzer öffnen NUUDL direkt im Browser, legen die PWA auf den Homescreen und starten in einem stadtgebundenen Feed.",
    "",
    "## Kernaussagen",
    "- 18+ Produkt: ausschließlich für Erwachsene.",
    "- PWA: kein App Store nötig, Installation über Homescreen.",
    "- Lokal: Beiträge, Kanäle und Suche sind auf Städte und Stadtfeeds ausgelegt.",
    "- Anon-first: normale öffentliche Beiträge bleiben pseudonym.",
    "- Private Chats: kontrolliert und nicht als offene DM-Flut.",
    "- Sicherheit: Melden, Moderation, Rate-Limits, Restriction-System und Abuse-Schutz.",
    "",
    "## Themen",
    ...DISCOVERY_TOPICS.map((topic) => `- ${topic.label}: ${topic.summary}`),
    "",
    "## Städte",
    ...DISCOVERY_CITIES.map((city) => `- ${city.label}: ${getAbsoluteUrl(getCityLandingPath(city.slug)).toString()}`),
    "",
    "## Kurze Antworten",
    ...DISCOVERY_ANSWERS.flatMap((item) => [`### ${item.question}`, item.answer, ""]),
    "## Wichtige URLs",
    `- Landingpage: ${getAbsoluteUrl("/landing").toString()}`,
    `- App: ${getAbsoluteUrl("/").toString()}`,
    `- Sitemap: ${getAbsoluteUrl("/sitemap.xml").toString()}`,
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

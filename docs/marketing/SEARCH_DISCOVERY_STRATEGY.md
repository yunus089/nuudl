# NUUDL Search Discovery Strategy

Stand: 2026-04-20

Ziel: maximale Auffindbarkeit, ohne dass die Landingpage wie eine SEO-Seite wirkt. Sichtbare Copy bleibt knapp, produktnah und conversion-orientiert. Strukturierte Daten, City-Pages, Sitemap und `llms.txt` tragen den größten Teil der Discovery-Arbeit im Hintergrund.

## Grundregel

- Landingpage verkauft das Produkt, nicht Keywords.
- Search-/Answer-/LLM-Signale werden über klare Informationsarchitektur, Schema.org, kurze FAQs und programmatische Stadtseiten eingebaut.
- Kein Keyword-Stuffing, keine versteckten Textblöcke, keine Doorway-Seiten ohne echten Nutzwert.
- 18+, Datenschutz, Sicherheit und lokale Bindung bleiben immer sichtbar und ehrlich.

## Abgedeckte Discovery-Flächen

| Fläche | Umsetzung | Status |
| --- | --- | --- |
| SEO | Meta-Titles, Descriptions, Keywords, OpenGraph, Sitemap, indexierbare Landingpage und Stadtseiten. | aktiv |
| LLM SEO / GEO | `/llms.txt`, klare Kernaussagen, strukturierte Themen, Stadtlinks und kurze Antworten. | aktiv |
| AEO | FAQPage, HowTo für PWA-Installation, kurze Answer-Snippets auf der Landingpage. | aktiv |
| Social Search | Kurze wiederverwendbare Phrasen: PWA, Homescreen, lokaler Stadtfeed, private Chats mit Freigabe. | vorbereitet |
| Topical Authority | Themencluster `PWA`, `anonymer Stadtfeed`, `private Chats`, `18+ Sicherheit`. | aktiv |
| Local SEO | Statische `/stadt/[slug]`-Seiten für priorisierte Startstädte. | aktiv |
| Programmatic SEO | Zentrale City-Datenquelle in `apps/consumer/app/_lib/discovery.ts`, Sitemap-Anbindung. | aktiv |
| Parasite SEO | Nur als späterer Offsite-Plan: saubere Profile/Beiträge auf Plattformen mit echter Relevanz, keine Spam-Taktiken. | geplant |

## Aktive URLs

- `/landing`: Haupt-Landingpage
- `/stadt/muenchen`
- `/stadt/berlin`
- `/stadt/hamburg`
- `/stadt/koeln`
- `/stadt/frankfurt`
- `/stadt/stuttgart`
- `/llms.txt`
- `/sitemap.xml`
- `/robots.txt`

## Offsite-/Parasite-SEO-Regeln für später

- Nur Plattformen nutzen, auf denen NUUDL wirklich erklärt werden darf: Product Hunt, Startup-Verzeichnisse, PWA-Verzeichnisse, lokale Gründer-/Tech-Communities.
- Kein Adult-Spam, keine massenhaften Kommentarlinks, keine Doorway-Profile.
- Jede externe Seite muss die Kernbotschaft sauber tragen: `18+`, `PWA`, `lokal`, `anon-first`, `private Chats mit Freigabe`.
- Externe Seiten sollen auf `/landing` oder passende `/stadt/[slug]`-Seiten zeigen, nicht direkt auf interne App-Flows.

## Nächste Ausbaustufe

- City-Daten später aus echten Launch-Städten statt fixer Liste speisen.
- Sobald echte Rechtstexte final sind, strukturierte `Organization`-/`ContactPoint`-/`WebSite`-Daten vervollständigen.
- Social-Search-Copy für TikTok/Instagram als kurze Hooks vorbereiten, aber nicht in die Landingpage stopfen.
- Nach Rebranding visuell prüfen, dass Discovery-Cluster leise bleiben und nicht conversion-störend wirken.

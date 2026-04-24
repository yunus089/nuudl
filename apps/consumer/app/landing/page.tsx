import type { Metadata } from "next";
import Link from "next/link";
import { DISCOVERY_ANSWERS, DISCOVERY_CITIES, DISCOVERY_TOPICS, getCityLandingPath } from "../_lib/discovery";
import { getAbsoluteUrl } from "../_lib/site";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "Anonyme lokale 18+ PWA direkt auf deinem Homescreen",
  description:
    "NUUDL ist die mobile 18+ PWA für anonyme lokale Gespräche, Stadtfeeds und private Chats mit Freigabe. Direkt im Browser öffnen und auf den Homescreen legen.",
  alternates: {
    canonical: "/landing"
  },
  keywords: [
    "NUUDL",
    "PWA",
    "PWA installieren",
    "lokale Community",
    "anonymer Stadtfeed",
    "anonym posten",
    "private Chats mit Freigabe",
    "18+ Community",
    "München Stadtfeed",
    "Berlin Stadtfeed"
  ],
  openGraph: {
    title: "NUUDL | Anonyme lokale 18+ PWA",
    description:
      "Lokaler Stadtfeed, anonyme Beiträge und private Chats mit Freigabe. Direkt im Browser öffnen und auf den Homescreen legen.",
    url: "/landing",
    images: [
      {
        url: "/brand/nuudl/png/hero-logo.png",
        width: 1024,
        height: 512,
        alt: "NUUDL Logo"
      }
    ],
    locale: "de_DE",
    siteName: "NUUDL",
    type: "website"
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large"
    }
  },
  twitter: {
    card: "summary_large_image",
    title: "NUUDL | Anonyme lokale 18+ PWA",
    description: "Lokaler Stadtfeed, anonyme Beiträge und private Chats mit Freigabe.",
    images: ["/brand/nuudl/png/hero-logo.png"]
  }
};

const heroCtas = [
  { href: "/", label: "App öffnen", tone: "primary" as const },
  { href: "#install", label: "Zum Homescreen", tone: "secondary" as const },
  { href: "#safety", label: "Schutz", tone: "ghost" as const }
];

const trustPoints = [
  "18+",
  "Anonym im Feed",
  "Lokal statt beliebig",
  "Private Chats mit Freigabe",
  "Schnell melden",
  "Moderiert"
];

const conversionCards = [
  {
    title: "Lokal zuerst",
    copy: "Du startest direkt bei den Stimmen aus deiner Stadt statt in einem globalen Strom aus belanglosem Zeug."
  },
  {
    title: "Anonym im Feed",
    copy: "Du liest und postest ohne Klarnamen. Regeln, Meldungen und Moderation halten den Raum trotzdem benutzbar."
  },
  {
    title: "Privat nur mit Freigabe",
    copy: "Direkte Chats starten kontrolliert. Das reduziert Spam und hält Kontakte ruhiger und respektvoller."
  }
];

const installSteps = [
  {
    title: "1. Link öffnen",
    copy: "NUUDL läuft direkt im mobilen Browser. Kein Store, kein Download, kein Warten."
  },
  {
    title: "2. Zum Homescreen legen",
    copy: "Speichere NUUDL über Safari oder Chrome wie eine App auf deinem Homescreen."
  },
  {
    title: "3. Direkt rein",
    copy: "18+ bestätigen, Stadt freigeben, Feed öffnen. Mehr braucht es nicht."
  }
];

const onboardingCards = [
  {
    title: "iPhone",
    copy: "In Safari öffnen, auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen. Danach startet NUUDL wie eine App."
  },
  {
    title: "Android",
    copy: "In Chrome öffnen, Menü antippen und auf den Startbildschirm legen. Danach nutzt du NUUDL wie eine App."
  },
  {
    title: "Beim ersten Start",
    copy: "18+ bestätigen, Stadt freigeben, Push bei Bedarf erlauben. Ohne Stadt bleibt der Feed bewusst gesperrt."
  }
];

const flowPoints = [
  {
    title: "Erst Feed",
    copy: "Du siehst sofort, was in deiner Stadt gerade diskutiert wird. Ohne globalen Lärm und ohne lange Umwege."
  },
  {
    title: "Dann Diskussion",
    copy: "Beiträge, Diskussionen und Reaktionen bleiben nah beieinander, damit Gespräche natürlich lesbar bleiben."
  },
  {
    title: "Privat nur mit Zustimmung",
    copy: "Private Kontakte starten kontrolliert und nicht ungefragt. Das hält den Einstieg ruhiger und respektvoller."
  },
  {
    title: "Schutz im Hintergrund",
    copy: "Melden, Moderation und Schutzregeln halten das System sauber, ohne den Flow zu bremsen."
  }
];

const legalModules = [
  {
    title: "Datenschutz auf einen Blick",
    intro:
      "NUUDL verarbeitet nur die Daten, die für Betrieb, Sicherheit, Stadtbindung und Moderation nötig sind. Vor dem öffentlichen Launch gehören dazu klare Angaben zu Verantwortlichen, Zwecken, Speicherfristen und deinen Rechten.",
    items: [
      "Standort, Push und vergleichbare Gerätefunktionen laufen nur nach klarer Einwilligung und bleiben widerrufbar.",
      "Auskunft, Löschung, Berichtigung, Widerspruch und Beschwerdeweg müssen sichtbar erreichbar sein.",
      "Datenschutz gehört hier nicht ins Kleingedruckte."
    ]
  },
  {
    title: "Sichere Kontakte statt offener DMs",
    intro:
      "Private Chats entstehen kontrolliert. Das reduziert Spam, schützt Grenzen und macht klar, dass Zustimmung hier nicht optional ist.",
    items: [
      "Private Kontakte laufen nicht als offenes Direktnachrichten-Chaos, sondern mit Freigabe.",
      "Blockieren, Melden und Moderation bleiben mit wenigen Taps erreichbar.",
      "Keine sensiblen Daten wie Adresse, Telefonnummer oder exakte Live-Orte teilen."
    ]
  },
  {
    title: "18+ und klare Inhaltsregeln",
    intro:
      "NUUDL ist nur für Erwachsene. Minderjährige, Grooming, nicht-einvernehmliche Inhalte und grenzverletzendes Verhalten führen zu Einschränkungen oder Sperren.",
    items: [
      "Der 18+ Zugang ist keine Fußnote, sondern eine klare Produktvoraussetzung.",
      "Grenzüberschreitende Inhalte und übergriffiges Verhalten werden gemeldet, geprüft und eingeschränkt.",
      "Offline-Treffen bleiben freiwillig, respektvoll und idealerweise an öffentlichen Orten."
    ]
  },
  {
    title: "Impressum, Kontakt und Regeln",
    intro:
      "Bevor NUUDL öffentlich startet, müssen Ansprechpartner, Impressum, Datenschutz und Support vollständig und leicht erreichbar hinterlegt sein.",
    items: [
      "Verantwortlicher, ladungsfähige Anschrift und Kontakt müssen final eingetragen werden.",
      "Rechtstexte dürfen nicht nur tief in der App versteckt sein.",
      "Änderungen an Sicherheits- oder Datenschutzregeln sollten versioniert und nachvollziehbar bleiben."
    ]
  }
];

const faqItems = [
  {
    question: "Muss ich etwas aus dem App Store herunterladen?",
    answer:
      "Nein. Du öffnest NUUDL im mobilen Browser und legst es danach direkt auf deinen Homescreen. So nutzt du es fast wie eine normale App, nur ohne Store."
  },
  {
    question: "Warum fragt NUUDL nach meinem Standort?",
    answer:
      "Weil der Feed bewusst lokal funktioniert. Ohne Stadtbindung wäre NUUDL nur eine weitere anonyme Plattform. Der Standort sorgt dafür, dass Beiträge und Gespräche wirklich zu deinem Umfeld passen."
  },
  {
    question: "Bin ich in NUUDL wirklich anonym?",
    answer:
      "Im öffentlichen Feed ja: Du trittst nicht mit deinem Klarnamen auf. Gleichzeitig schützen Moderation, Session-Schutz und Missbrauchsregeln das System im Hintergrund."
  },
  {
    question: "Kann mir hier jeder einfach privat schreiben?",
    answer:
      "Nein. Private Kontakte laufen kontrolliert und nicht über offene Direktnachrichten. Das hält den Einstieg respektvoller und ruhiger."
  },
  {
    question: "Ist rechtlich schon alles final?",
    answer:
      "Die Landingpage zeigt Datenschutz, Sicherheit und Regeln bereits sichtbar. Vor dem öffentlichen Start werden die finalen Unternehmens- und Rechtstexte vollständig ergänzt."
  },
  {
    question: "Für welche Städte ist NUUDL gedacht?",
    answer:
      "NUUDL ist stadtgebunden gedacht. Der Start konzentriert sich auf ausgewählte Städte und kann später programmatisch auf weitere lokale Feeds erweitert werden."
  },
  {
    question: "Was macht NUUDL für KI- und Antwortsuche verständlich?",
    answer:
      "NUUDL erklärt klar, dass es eine 18+ PWA für lokale anonyme Gespräche ist: Browser öffnen, Homescreen speichern, Stadtbindung aktivieren und kontrolliert privat weitergehen."
  }
];

const landingUrl = getAbsoluteUrl("/landing").toString();
const homeUrl = getAbsoluteUrl("/").toString();
const structuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${homeUrl}#organization`,
      name: "NUUDL",
      url: homeUrl,
      logo: getAbsoluteUrl("/brand/nuudl/png/app-icon-square.png").toString()
    },
    {
      "@type": "WebSite",
      "@id": `${homeUrl}#website`,
      name: "NUUDL",
      url: homeUrl,
      inLanguage: "de-DE",
      publisher: {
        "@id": `${homeUrl}#organization`
      }
    },
    {
      "@type": "WebApplication",
      "@id": `${landingUrl}#pwa`,
      name: "NUUDL",
      url: landingUrl,
      applicationCategory: "SocialNetworkingApplication",
      operatingSystem: "iOS, Android, Web",
      isAccessibleForFree: true,
      inLanguage: "de-DE",
      description:
        "NUUDL ist eine mobile 18+ PWA für anonyme, lokale Gespräche direkt im Browser.",
      audience: {
        "@type": "PeopleAudience",
        requiredMinAge: 18
      },
      areaServed: ["DE", "AT", "CH"]
    },
    {
      "@type": "HowTo",
      "@id": `${landingUrl}#install-howto`,
      name: "NUUDL als PWA auf dem Homescreen installieren",
      description: "So wird NUUDL ohne App Store als mobile PWA genutzt.",
      totalTime: "PT1M",
      step: installSteps.map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: step.title.replace(/^\d+\.\s*/, ""),
        text: step.copy
      }))
    },
    {
      "@type": "ItemList",
      "@id": `${landingUrl}#local-city-pages`,
      name: "NUUDL Stadtfeeds",
      itemListElement: DISCOVERY_CITIES.map((city, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: `${city.label} Stadtfeed`,
        url: getAbsoluteUrl(getCityLandingPath(city.slug)).toString()
      }))
    },
    {
      "@type": "ItemList",
      "@id": `${landingUrl}#topic-clusters`,
      name: "NUUDL Themencluster",
      itemListElement: DISCOVERY_TOPICS.map((topic, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: topic.label,
        description: topic.summary
      }))
    },
    {
      "@type": "FAQPage",
      "@id": `${landingUrl}#faq`,
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer
        }
      }))
    }
  ]
}).replaceAll("<", "\\u003c");

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <script
        dangerouslySetInnerHTML={{
          __html: structuredData
        }}
        type="application/ld+json"
      />
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.brandBadge}>
            <img alt="NUUDL App Icon" className={styles.brandIcon} src="/brand/nuudl/png/icon.png" />
            <span>NUUDL PWA</span>
          </div>
          <span className={styles.agePill}>Nur für Erwachsene</span>
        </div>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Anonym. Lokal. Direkt auf deinem Homescreen.</p>
            <h1>Die 18+ PWA für ehrliche Stimmen aus deiner Stadt.</h1>
            <p className={styles.lead}>
              NUUDL startet direkt im Browser und liegt nach wenigen Sekunden auf deinem Homescreen. Lies, was in
              deiner Stadt wirklich gesagt wird, poste anonym und geh nur privat weiter, wenn es für beide passt.
            </p>

            <div className={styles.ctaRow}>
              {heroCtas.map((cta) =>
                cta.tone === "primary" ? (
                  <Link className={styles.primaryCta} href={cta.href} key={cta.href}>
                    {cta.label}
                  </Link>
                ) : cta.tone === "secondary" ? (
                  <Link className={styles.secondaryCta} href={cta.href} key={cta.href}>
                    {cta.label}
                  </Link>
                ) : (
                  <Link className={styles.ghostCta} href={cta.href} key={cta.href}>
                    {cta.label}
                  </Link>
                )
              )}
            </div>

            <div className={styles.heroFactRow}>
              <span>Ohne Store</span>
              <span>Auf dem Homescreen in Sekunden</span>
              <span>Ein Feed pro Stadt</span>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="NUUDL Vorschau">
            <img alt="NUUDL Brand Logo" className={styles.heroLogo} src="/brand/nuudl/png/hero-logo.png" />
            <div className={styles.phoneMock}>
              <div className={styles.phoneTop}>
                <span className={styles.phoneCity}>München</span>
                <span className={styles.phoneState}>Sofort startklar</span>
              </div>
              <div className={styles.phoneFeed}>
                <div className={styles.feedChipRow}>
                  <span>Stadtfeed</span>
                  <span>Kanäle</span>
                  <span>Privat mit Freigabe</span>
                </div>
                <article className={styles.previewCard}>
                  <div className={styles.previewMeta}>
                    <span>Anon 53</span>
                    <span>@main</span>
                    <span>Heute 13:12</span>
                  </div>
                  <p>Was heute in München wirklich gesagt wird, landet hier zuerst. Lokal, direkt und ohne globalen Lärm.</p>
                </article>
                <article className={styles.previewCardSoft}>
                  <div className={styles.previewMeta}>
                    <span>Private Kontakte</span>
                    <span>nur mit Freigabe</span>
                  </div>
                  <p>Persönlicher Kontakt bleibt möglich, aber nicht ungefragt. Genau das macht den Ton spürbar ruhiger.</p>
                </article>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.trustStrip}>
          {trustPoints.map((point) => (
            <span className={styles.trustPill} key={point}>
              {point}
            </span>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Warum sich NUUDL sofort anders anfühlt</p>
          <h2>Weniger Lärm. Mehr Relevanz.</h2>
          <p>
            NUUDL bringt dich direkt in die Gespräche, die in deiner Stadt gerade wirklich zählen.
          </p>
        </div>
        <div className={styles.conversionGrid}>
          {conversionCards.map((card) => (
            <article className={styles.conversionCard} key={card.title}>
              <strong>{card.title}</strong>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="local">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Lokale Suche, leise integriert</p>
          <h2>Für Stadtmomente, die nicht in globale Feeds gehören.</h2>
          <p>
            NUUDL ist als lokale PWA gedacht: Städte, Themen und Antworten sind klar strukturiert, ohne die Seite in
            ein SEO-Textlager zu verwandeln.
          </p>
        </div>
        <div className={styles.discoveryGrid}>
          {DISCOVERY_TOPICS.map((topic) => (
            <article className={styles.discoveryCard} key={topic.key}>
              <strong>{topic.label}</strong>
              <p>{topic.summary}</p>
            </article>
          ))}
        </div>
        <div className={styles.cityLinkPanel}>
          <div>
            <strong>Stadtbasiert statt beliebig</strong>
            <p>Ausgewählte lokale Einstiege helfen Nutzern und Suchsystemen zu verstehen, wo NUUDL später relevant wird.</p>
          </div>
          <div className={styles.cityLinkGrid}>
            {DISCOVERY_CITIES.map((city) => (
              <Link className={styles.cityLink} href={getCityLandingPath(city.slug)} key={city.slug}>
                <span>{city.label}</span>
                <small>{city.region}</small>
              </Link>
            ))}
          </div>
        </div>
        <div className={styles.answerSnippetGrid} aria-label="Kurze Antworten für Such- und KI-Systeme">
          {DISCOVERY_ANSWERS.map((item) => (
            <article className={styles.answerSnippet} key={item.question}>
              <strong>{item.question}</strong>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="install">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Ohne Store</p>
          <h2>In Sekunden auf deinem Homescreen.</h2>
          <p>
            Einmal im Browser öffnen, einmal speichern, danach startet NUUDL wie eine App direkt vom Homescreen.
          </p>
        </div>
        <div className={styles.installGrid}>
          {installSteps.map((step) => (
            <article className={styles.installCard} key={step.title}>
              <strong>{step.title}</strong>
              <p>{step.copy}</p>
            </article>
          ))}
        </div>
        <div className={styles.onboardingGrid}>
          {onboardingCards.map((card) => (
            <article className={styles.onboardingCard} key={card.title}>
              <strong>{card.title}</strong>
              <p>{card.copy}</p>
            </article>
          ))}
        </div>
        <div className={styles.midCtaPanel}>
          <div>
            <strong>Verstanden. Jetzt ausprobieren.</strong>
            <p>Ein Tap bringt dich in die App. Der zweite legt sie auf deinen Homescreen.</p>
          </div>
          <div className={styles.midCtaRow}>
            <Link className={styles.primaryCta} href="/">
              App jetzt öffnen
            </Link>
            <Link className={styles.secondaryCta} href="/channels">
              Stadt zuerst ansehen
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>So läuft es</p>
          <h2>Erst Feed. Dann Kontakt, wenn es passt.</h2>
          <p>
            Du startest im lokalen Feed, steigst in Diskussionen ein und gehst nur dann privat weiter, wenn beide
            Seiten das auch wirklich wollen.
          </p>
        </div>
        <div className={styles.flowGrid}>
          {flowPoints.map((point) => (
            <article className={styles.flowCard} key={point.title}>
              <strong>{point.title}</strong>
              <p>{point.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section} id="safety">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Sicherheit</p>
          <h2>Anonym heißt hier nicht schutzlos.</h2>
          <p>
            NUUDL ist für ehrliche, lokale Gespräche gemacht, nicht für Spam, Druck oder Chaos. Genau deshalb laufen
            Schutzmechanismen nicht nebenbei, sondern fest im Produkt.
          </p>
        </div>
        <div className={styles.safetyPanel}>
          <div>
            <strong>Was du sofort merkst</strong>
            <p>18+, anonymer Feed, lokale Begrenzung, Melden, Blockieren und private Kontakte nur mit Freigabe.</p>
          </div>
          <div>
            <strong>Was im Hintergrund schützt</strong>
            <p>Schutz gegen Spam, auffällige Aktivität, Flooding, Missbrauch und manipulative Nutzung hält NUUDL ruhig und benutzbar.</p>
          </div>
        </div>
      </section>

      <section className={styles.section} id="legal">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Datenschutz, Sicherheit und Regeln</p>
          <h2>Wichtige Regeln, klar sichtbar.</h2>
          <p>
            Wer eine lokale, anonyme 18+ Community baut, muss Verantwortung sichtbar machen. Darum stehen diese Themen
            direkt hier und nicht erst tief im Kleingedruckten.
          </p>
        </div>
        <div className={styles.legalGrid}>
          {legalModules.map((module) => (
            <details className={styles.legalModule} key={module.title}>
              <summary className={styles.legalSummary}>
                <span>{module.title}</span>
                <span className={styles.legalSummaryHint}>Öffnen</span>
              </summary>
              <div className={styles.legalBody}>
                <p>{module.intro}</p>
                <ul className={styles.legalList}>
                  {module.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </details>
          ))}
        </div>
        <div className={styles.legalNote}>
          <strong>Vor dem öffentlichen Launch verbindlich ergänzen</strong>
          <p>
            Vor Livegang brauchen Landingpage und App noch finale Unternehmensdaten, Kontaktstellen, Datenschutzerklärung,
            Impressum, Speicherfristen und die abschließende juristische Prüfung.
          </p>
        </div>
      </section>

      <section className={styles.section} id="faq">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>FAQ</p>
          <h2>Vor dem ersten Tap.</h2>
        </div>
        <div className={styles.faqGrid}>
          {faqItems.map((item) => (
            <details className={styles.faqItem} key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.finalCtaPanel}>
          <div>
            <p className={styles.eyebrow}>Bereit?</p>
            <h2>Öffne NUUDL und schau, was in deiner Stadt gerade zählt.</h2>
            <p>Feed, Kanäle und private Kontakte sind in wenigen Sekunden da. Ohne Store und ohne Umweg.</p>
          </div>
          <div className={styles.finalCtaRow}>
            <Link className={styles.primaryCta} href="/">
              NUUDL starten
            </Link>
            <Link className={styles.secondaryCta} href="/channels">
              Stadt entdecken
            </Link>
          </div>
        </div>
      </section>

      <div className={styles.stickyCtaBar}>
        <div className={styles.stickyCtaText}>
          <strong>Direkt im Browser. Direkt auf dem Homescreen.</strong>
          <span>18+ · lokal · ohne Store</span>
        </div>
        <div className={styles.stickyCtaActions}>
          <Link className={styles.stickySecondary} href="#install">
            Homescreen
          </Link>
          <Link className={styles.stickyPrimary} href="/">
            Jetzt öffnen
          </Link>
        </div>
      </div>
    </main>
  );
}

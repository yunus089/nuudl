import type { Metadata } from "next";
import Link from "next/link";
import styles from "./landing.module.css";

export const metadata: Metadata = {
  title: "NUUDL | Anonym. Lokal. 18+.",
  description:
    "NUUDL ist die mobile 18+ PWA für echte Stimmen aus deiner Stadt. Direkt im Browser starten, auf den Homescreen legen und wie eine App nutzen."
};

const heroCtas = [
  { href: "/", label: "NUUDL öffnen", tone: "primary" as const },
  { href: "#install", label: "So installierst du es", tone: "secondary" as const },
  { href: "#safety", label: "Schutz & Regeln", tone: "ghost" as const }
];

const heroStats = [
  {
    value: "0",
    label: "Store-Umwege",
    copy: "Öffnen, speichern, loslegen."
  },
  {
    value: "3",
    label: "Schritte bis zur App",
    copy: "Browser auf, Homescreen an, fertig."
  },
  {
    value: "1",
    label: "Stadt im Fokus",
    copy: "Kein globales Rauschen. Nur dein lokaler Feed."
  }
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
    title: "Direkt bei dir",
    copy: "Kein globaler Strom aus belanglosem Zeug. Du siehst, was in deiner Stadt gerade wirklich Thema ist."
  },
  {
    title: "Anonym, aber klar",
    copy: "Im Feed bleibst du anonym. Regeln, Meldungen und Moderation halten den Raum trotzdem benutzbar."
  },
  {
    title: "Privat nur, wenn es passt",
    copy: "Private Chats starten kontrolliert. Das reduziert Spam und hält Kontakte respektvoller."
  }
];

const installSteps = [
  {
    title: "1. Link öffnen",
    copy: "NUUDL läuft direkt im mobilen Browser. Kein Store, kein Download, kein Warten."
  },
  {
    title: "2. Auf den Homescreen",
    copy: "Speichere NUUDL über Safari oder Chrome als App und öffne es künftig direkt vom Homescreen."
  },
  {
    title: "3. Feed öffnen",
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
    title: "Direkt im Feed",
    copy: "Du siehst sofort, was in deiner Stadt gerade diskutiert wird. Ohne globalen Lärm und ohne lange Umwege."
  },
  {
    title: "Antworten ohne Reibung",
    copy: "Beiträge, Diskussionen und Reaktionen bleiben nah beieinander, damit Gespräche natürlich lesbar bleiben."
  },
  {
    title: "Privat nur mit Zustimmung",
    copy: "Private Kontakte starten kontrolliert und nicht ungefragt. Das hält den Einstieg ruhiger und respektvoller."
  },
  {
    title: "Sicherheit im Hintergrund",
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
      "Nein. Du öffnest NUUDL im mobilen Browser und legst es danach direkt auf deinen Homescreen. So nutzt du es fast wie eine normale App, nur ohne Store-Umweg."
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
  }
];

export default function LandingPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <div className={styles.brandBadge}>
            <img alt="NUUDL App Icon" className={styles.brandIcon} src="/brand/nuudl/png/icon.png" />
            <span>NUUDL als PWA</span>
          </div>
          <span className={styles.agePill}>Nur für Erwachsene</span>
        </div>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Anonym. Lokal. Direkt auf deinem Homescreen.</p>
            <h1>Die 18+ PWA für ehrliche Stimmen aus deiner Stadt.</h1>
            <p className={styles.lead}>
              NUUDL startet direkt im Browser und liegt nach wenigen Sekunden auf deinem Homescreen. Lies, was Menschen
              in deiner Stadt wirklich sagen, poste anonym und halte private Kontakte in einem klar geregelten Rahmen.
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

            <div className={styles.heroStatGrid}>
              {heroStats.map((item) => (
                <article className={styles.heroStatCard} key={item.label}>
                  <strong className={styles.heroStatValue}>{item.value}</strong>
                  <span className={styles.heroStatLabel}>{item.label}</span>
                  <p className={styles.heroStatCopy}>{item.copy}</p>
                </article>
              ))}
            </div>

            <div className={styles.noticeBox}>
              <strong>Nur für Erwachsene</strong>
              <p>Im Feed bleibst du anonym. Regeln, Meldungen und Moderation halten den Raum klar und ruhig.</p>
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
          <h2>Weniger Lärm. Mehr Relevanz. Kein Umweg.</h2>
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

      <section className={styles.section} id="install">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>PWA Onboarding</p>
          <h2>Kein App Store. Kein Warten. Einfach öffnen.</h2>
          <p>
            NUUDL startet direkt im mobilen Browser und fühlt sich nach dem Speichern wie eine normale App an. Öffnen,
            speichern, starten.
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
            <p>Ein Tap bringt dich in die App. Ein zweiter legt NUUDL auf deinen Homescreen.</p>
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
          <p className={styles.eyebrow}>Produktfluss</p>
          <h2>Vom ersten Scroll bis zum privaten Kontakt: klar und kontrolliert.</h2>
          <p>
            Du startest im lokalen Feed, steigst mit einem Tap in Diskussionen ein und gehst nur dann privat, wenn
            beide Seiten das auch wirklich wollen.
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
          <h2>Diese Punkte sind hier nicht versteckt.</h2>
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
          <h2>Die wichtigsten Fragen vor dem ersten Tap.</h2>
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
            <p className={styles.eyebrow}>Bereit für den ersten Blick?</p>
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
            <Link className={styles.secondaryCta} href="#install">
              PWA installieren
            </Link>
          </div>
        </div>
      </section>

      <div className={styles.stickyCtaBar}>
        <div className={styles.stickyCtaText}>
          <strong>In unter einer Minute auf dem Homescreen</strong>
          <span>18+ · lokal · ohne App Store</span>
        </div>
        <div className={styles.stickyCtaActions}>
          <Link className={styles.stickySecondary} href="#install">
            Installieren
          </Link>
          <Link className={styles.stickyPrimary} href="/">
            Jetzt öffnen
          </Link>
        </div>
      </div>
    </main>
  );
}

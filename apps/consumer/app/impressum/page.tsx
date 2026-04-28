import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Impressum",
  robots: { index: false }
};

export default function ImpressumPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", padding: "32px 20px 64px", maxWidth: 560, margin: "0 auto" }}>
      <Link
        href="/"
        style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 32 }}
      >
        ← NUUDL
      </Link>

      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 300, fontSize: 28, color: "var(--text-primary)", marginBottom: 8 }}>
        Impressum
      </h1>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", marginBottom: 40, letterSpacing: "0.04em" }}>
        Angaben gemäß § 5 TMG
      </p>

      <Section heading="Anbieter">
        <p>[DEIN VOLLSTÄNDIGER NAME]</p>
        <p>[STRASSE UND HAUSNUMMER]</p>
        <p>[POSTLEITZAHL] [STADT]</p>
        <p>Deutschland</p>
      </Section>

      <Section heading="Kontakt">
        <p>
          E-Mail:{" "}
          <a href="mailto:yunus089@gmail.com" style={{ color: "var(--text-primary)" }}>
            yunus089@gmail.com
          </a>
        </p>
      </Section>

      <Section heading="Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV">
        <p>[DEIN VOLLSTÄNDIGER NAME]</p>
        <p>[ANSCHRIFT WIE OBEN]</p>
      </Section>

      <Section heading="Produkt">
        <p>
          NUUDL ist eine mobile 18+ Progressive Web App (PWA) für anonyme lokale Gespräche,
          Stadtfeeds und private Chats. Die App läuft direkt im Browser und erfordert keine
          Installation über App Stores.
        </p>
      </Section>

      <Section heading="Haftungsausschluss">
        <p>
          Trotz sorgfältiger inhaltlicher Kontrolle übernehmen wir keine Haftung für die Inhalte
          externer Links. Für den Inhalt der verlinkten Seiten sind ausschließlich deren Betreiber
          verantwortlich.
        </p>
        <p style={{ marginTop: 8 }}>
          Nutzergenerierte Inhalte unterliegen den{" "}
          <Link href="/nutzungsbedingungen" style={{ color: "var(--text-primary)" }}>
            Nutzungsbedingungen
          </Link>
          . Meldungen über rechtswidrige Inhalte können über den{" "}
          <Link href="/meldepfad" style={{ color: "var(--text-primary)" }}>
            Meldepfad
          </Link>{" "}
          eingereicht werden.
        </p>
      </Section>

      <Section heading="Streitbeilegung">
        <p>
          Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            rel="noopener noreferrer"
            style={{ color: "var(--text-primary)" }}
            target="_blank"
          >
            ec.europa.eu/consumers/odr
          </a>
          . Zur Teilnahme an einem Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle sind wir nicht verpflichtet und grundsätzlich nicht bereit.
        </p>
      </Section>
    </main>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontFamily: "var(--font-stack)",
          fontWeight: 500,
          fontSize: 13,
          color: "var(--text-primary)",
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border-subtle)"
        }}
      >
        {heading}
      </h2>
      <div style={{ fontFamily: "var(--font-stack)", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
        {children}
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Meldepfad · Missbrauch melden",
  robots: { index: false }
};

export default function MeldepfadPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", padding: "32px 20px 64px", maxWidth: 560, margin: "0 auto" }}>
      <Link
        href="/"
        style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 32 }}
      >
        ← NUUDL
      </Link>

      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 300, fontSize: 28, color: "var(--text-primary)", marginBottom: 8 }}>
        Meldepfad
      </h1>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", marginBottom: 40, letterSpacing: "0.04em" }}>
        Missbrauch und rechtswidrige Inhalte melden
      </p>

      <Section heading="Wie du meldest">
        <p>
          Meldungen sendest du per E-Mail an:
        </p>
        <a
          href="mailto:yunus089@gmail.com?subject=Meldung%20%E2%80%93%20NUUDL"
          style={{
            display: "block",
            marginTop: 12,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--text-primary)",
            textDecoration: "none",
            padding: "10px 14px",
            border: "1px solid var(--border-subtle)",
            borderRadius: 6
          }}
        >
          yunus089@gmail.com
        </a>
        <p style={{ marginTop: 12 }}>
          Alternativ kannst du Inhalte direkt in der App über den Melden-Button am Beitrag melden.
        </p>
      </Section>

      <Section heading="Was du angeben solltest">
        <ul style={{ paddingLeft: 16, display: "grid", gap: 6 }}>
          <li>Art des gemeldeten Inhalts (z. B. Beitrag, Kommentar, Chat)</li>
          <li>Beschreibung des Problems in eigenen Worten</li>
          <li>Zeitpunkt und Kontext, wenn bekannt</li>
          <li>Screenshot oder Link, falls vorhanden</li>
        </ul>
      </Section>

      <Section heading="Bearbeitung und Reaktionszeit">
        <p>
          Meldungen werden innerhalb von 48 Stunden geprüft. Bei dringendem Handlungsbedarf
          (z. B. direkte Bedrohungen) reagieren wir so schnell wie möglich.
        </p>
      </Section>

      <Section heading="Kinderschutzmaterial (§ 184b StGB)">
        <p style={{ color: "var(--text-primary)" }}>
          Inhalte mit sexuellen Darstellungen von Minderjährigen werden sofort und dauerhaft entfernt.
          Zusätzlich erfolgt eine Meldung beim Bundeskriminalamt (BKA) und — je nach Inhalt —
          beim Nationalen Zentrum für vermisste und ausgebeutete Kinder (NCMEC).
        </p>
        <p style={{ marginTop: 8 }}>
          Du kannst solche Inhalte außerdem direkt beim BKA melden:{" "}
          <a
            href="https://www.bka.de/DE/IhreSicherheit/Ratgeberfuerverbraucher/DigitaleSicherheit/DigitaleSicherheit_node.html"
            rel="noopener noreferrer"
            style={{ color: "var(--text-primary)" }}
            target="_blank"
          >
            bka.de
          </a>
        </p>
      </Section>

      <Section heading="Weitere Hinweise">
        <p>
          NUUDL ist eine 18+ Plattform. Rechtsgrundlagen für Moderationsentscheidungen sind
          die{" "}
          <Link href="/nutzungsbedingungen" style={{ color: "var(--text-primary)" }}>
            Nutzungsbedingungen
          </Link>
          {" "}und geltendes deutsches Recht. Betreiberangaben sind im{" "}
          <Link href="/impressum" style={{ color: "var(--text-primary)" }}>
            Impressum
          </Link>
          {" "}zu finden.
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

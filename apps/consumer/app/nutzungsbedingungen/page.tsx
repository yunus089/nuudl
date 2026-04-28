import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Nutzungsbedingungen",
  robots: { index: false }
};

export default function NutzungsbedingungenPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", padding: "32px 20px 64px", maxWidth: 560, margin: "0 auto" }}>
      <Link
        href="/"
        style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 32 }}
      >
        ← NUUDL
      </Link>

      <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 300, fontSize: 28, color: "var(--text-primary)", marginBottom: 8 }}>
        Nutzungsbedingungen
      </h1>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", marginBottom: 40, letterSpacing: "0.04em" }}>
        Stand: April 2026 · Gilt für NUUDL Beta
      </p>

      <Section heading="1. Mindestalter">
        <p>
          NUUDL ist ausschließlich für Personen ab 18 Jahren. Mit der Nutzung bestätigst du,
          dass du mindestens 18 Jahre alt bist. Konten von Minderjährigen werden ohne Vorankündigung
          gesperrt und gelöscht.
        </p>
      </Section>

      <Section heading="2. Anonyme Nutzung">
        <p>
          NUUDL ist anonym. Deine Installation wird an eine Stadt gebunden, nicht an eine
          Echtidentität. Du bist verantwortlich für alles, was du über deine Installation postest,
          kommentierst oder sendest.
        </p>
      </Section>

      <Section heading="3. Verbotene Inhalte">
        <p>Folgendes ist auf NUUDL nicht erlaubt und führt zur sofortigen Sperrung:</p>
        <ul style={{ marginTop: 8, paddingLeft: 16, display: "grid", gap: 6 }}>
          <li>Sexuelle Darstellungen von Minderjährigen (§ 184b StGB) — wird unverzüglich den Behörden gemeldet</li>
          <li>Gewaltandrohungen, Nötigung oder Einschüchterung</li>
          <li>Doxxing (Veröffentlichung persönlicher Daten Dritter)</li>
          <li>Inhalte, die auf die Verletzung oder den Tod von Personen abzielen</li>
          <li>Spam, koordinierte Desinformation oder kommerzielle Werbung ohne Kennzeichnung</li>
          <li>Inhalte, die gegen deutsches Recht verstoßen</li>
        </ul>
      </Section>

      <Section heading="4. Moderation">
        <p>
          NUUDL behält sich vor, Inhalte zu entfernen, die gegen diese Bedingungen verstoßen.
          Meldungen werden geprüft. Bei schwerwiegenden Verstößen — insbesondere § 184b StGB —
          erfolgt eine Meldung an das Bundeskriminalamt (BKA).
        </p>
        <p style={{ marginTop: 8 }}>
          Den Meldepfad für Missbrauch findest du unter{" "}
          <Link href="/meldepfad" style={{ color: "var(--text-primary)" }}>
            /meldepfad
          </Link>
          .
        </p>
      </Section>

      <Section heading="5. Verfügbarkeit">
        <p>
          NUUDL befindet sich in der geschlossenen Beta. Der Dienst kann jederzeit ohne Vorankündigung
          geändert, eingeschränkt oder eingestellt werden. Es besteht kein Anspruch auf dauerhafte
          Verfügbarkeit.
        </p>
      </Section>

      <Section heading="6. Haftung">
        <p>
          Für nutzergenerierte Inhalte übernimmt NUUDL keine Haftung. Die Plattform ist ein
          technisches Werkzeug — Verantwortung für Inhalte liegt bei den Nutzer:innen, die sie
          erstellen. Rechtswidrige Inhalte werden auf Meldung hin entfernt.
        </p>
      </Section>

      <Section heading="7. Änderungen">
        <p>
          Diese Nutzungsbedingungen können jederzeit geändert werden. Bei wesentlichen Änderungen
          wird in der App darauf hingewiesen. Die weitere Nutzung nach einer Änderung gilt als
          Zustimmung.
        </p>
      </Section>

      <Section heading="8. Anwendbares Recht">
        <p>
          Es gilt deutsches Recht. Gerichtsstand ist, soweit gesetzlich zulässig, der Sitz des
          Anbieters (siehe{" "}
          <Link href="/impressum" style={{ color: "var(--text-primary)" }}>
            Impressum
          </Link>
          ).
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

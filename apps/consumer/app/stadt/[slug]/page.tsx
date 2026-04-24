import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DISCOVERY_CITIES, DISCOVERY_TOPICS, getDiscoveryCityBySlug } from "../../_lib/discovery";
import { getAbsoluteUrl } from "../../_lib/site";
import styles from "../../landing/landing.module.css";

type CityPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return DISCOVERY_CITIES.map((city) => ({
    slug: city.slug,
  }));
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const city = getDiscoveryCityBySlug(slug);

  if (!city) {
    return {
      title: "Lokaler Stadtfeed",
    };
  }

  return {
    title: `${city.label}: anonyme lokale 18+ PWA`,
    description: `${city.intro} NUUDL läuft direkt im Browser und lässt sich als PWA auf den Homescreen legen.`,
    alternates: {
      canonical: `/stadt/${city.slug}`,
    },
    keywords: [
      `anonymer Stadtfeed ${city.label}`,
      `lokale Community ${city.label}`,
      `PWA ${city.label}`,
      `18+ Community ${city.label}`,
      "NUUDL",
    ],
    openGraph: {
      title: `NUUDL für ${city.label}`,
      description: city.intro,
      url: `/stadt/${city.slug}`,
      images: [
        {
          url: "/brand/nuudl/png/hero-logo.png",
          width: 1024,
          height: 512,
          alt: "NUUDL Logo",
        },
      ],
      locale: "de_DE",
      siteName: "NUUDL",
      type: "website",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
      },
    },
    twitter: {
      card: "summary_large_image",
      title: `NUUDL für ${city.label}`,
      description: city.intro,
      images: ["/brand/nuudl/png/hero-logo.png"],
    },
  };
}

export default async function CityLandingPage({ params }: CityPageProps) {
  const { slug } = await params;
  const city = getDiscoveryCityBySlug(slug);

  if (!city) {
    notFound();
  }

  const cityUrl = getAbsoluteUrl(`/stadt/${city.slug}`).toString();
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${cityUrl}#webpage`,
        name: `NUUDL für ${city.label}`,
        url: cityUrl,
        inLanguage: "de-DE",
        description: city.intro,
        isPartOf: {
          "@id": `${getAbsoluteUrl("/").toString()}#website`,
        },
        about: DISCOVERY_TOPICS.map((topic) => topic.label),
      },
      {
        "@type": "Place",
        "@id": `${cityUrl}#place`,
        name: city.label,
        address: {
          "@type": "PostalAddress",
          addressRegion: city.region,
          addressCountry: "DE",
        },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${cityUrl}#pwa`,
        name: `NUUDL ${city.label}`,
        applicationCategory: "SocialNetworkingApplication",
        operatingSystem: "iOS, Android, Web",
        isAccessibleForFree: true,
        audience: {
          "@type": "PeopleAudience",
          requiredMinAge: 18,
        },
      },
    ],
  }).replaceAll("<", "\\u003c");

  return (
    <main className={styles.page}>
      <script
        dangerouslySetInnerHTML={{
          __html: structuredData,
        }}
        type="application/ld+json"
      />

      <section className={styles.hero}>
        <div className={styles.heroTop}>
          <Link className={styles.brandBadge} href="/landing">
            <img alt="NUUDL App Icon" className={styles.brandIcon} src="/brand/nuudl/png/icon.png" />
            <span>NUUDL</span>
          </Link>
          <span className={styles.agePill}>18+ lokale PWA</span>
        </div>

        <div className={styles.cityHero}>
          <p className={styles.eyebrow}>Stadtfeed {city.label}</p>
          <h1>{city.label}: anonym lesen, lokal posten, kontrolliert privat weitergehen.</h1>
          <p className={styles.lead}>
            {city.intro} Der öffentliche Feed bleibt pseudonym; private Chats entstehen nur mit Freigabe.
          </p>
          <div className={styles.ctaRow}>
            <Link className={styles.primaryCta} href="/">
              App öffnen
            </Link>
            <Link className={styles.secondaryCta} href="/landing#install">
              PWA installieren
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Warum lokal?</p>
          <h2>Ein Feed ist nur spannend, wenn er nah genug ist.</h2>
          <p>
            NUUDL ordnet Gespräche nach Stadt, nicht nach globaler Reichweite. Dadurch bleiben Themen schneller
            verständlich und private Kontakte bewusst kontrollierter.
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
      </section>

      <section className={styles.section}>
        <div className={styles.finalCtaPanel}>
          <div>
            <p className={styles.eyebrow}>Direkt starten</p>
            <h2>NUUDL für {city.label} öffnen.</h2>
            <p>Browser öffnen, 18+ bestätigen, Stadtbindung erlauben und den lokalen Feed nutzen.</p>
          </div>
          <div className={styles.finalCtaRow}>
            <Link className={styles.primaryCta} href="/">
              Jetzt in die App
            </Link>
            <Link className={styles.secondaryCta} href="/landing">
              Mehr erfahren
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

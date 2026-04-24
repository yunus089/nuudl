import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ConsumerAppProvider } from "./_components/consumer-provider";
import { getSiteUrl } from "./_lib/site";
import { PwaBootstrap } from "./pwa-bootstrap";

const appFont = Inter({
  subsets: ["latin"],
  variable: "--font-stack",
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "NUUDL",
    template: "%s | NUUDL"
  },
  description:
    "NUUDL ist eine mobile 18+ PWA für anonyme lokale Gespräche, Stadtfeeds und private Chats mit Freigabe direkt im Browser.",
  applicationName: "NUUDL",
  category: "social networking",
  keywords: [
    "NUUDL",
    "anonyme lokale PWA",
    "Stadtfeed",
    "PWA installieren",
    "18+ Community",
    "private Chats mit Freigabe"
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NUUDL"
  },
  icons: {
    apple: "/brand/nuudl/png/app-icon-square.png",
    icon: [
      {
        url: "/brand/nuudl/png/app-icon.png",
        type: "image/png"
      }
    ]
  },
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/",
    types: {
      "text/plain": "/llms.txt"
    }
  },
  openGraph: {
    title: "NUUDL",
    description: "Anonyme lokale 18+ PWA: Stadtfeed, Homescreen-App und private Chats mit Freigabe.",
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
  twitter: {
    card: "summary_large_image",
    title: "NUUDL",
    description: "Anonym. Lokal. 18+. Direkt als PWA im Browser starten.",
    images: ["/brand/nuudl/png/hero-logo.png"]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0A0A0A"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${appFont.variable} ${appFont.className}`}>
        <PwaBootstrap />
        <ConsumerAppProvider>{children}</ConsumerAppProvider>
      </body>
    </html>
  );
}

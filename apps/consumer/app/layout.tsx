import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ConsumerAppProvider } from "./_components/consumer-provider";
import { PwaBootstrap } from "./pwa-bootstrap";

const appFont = Inter({
  subsets: ["latin"],
  variable: "--font-stack",
});

export const metadata: Metadata = {
  title: "NUUDL",
  description: "Mobile-only anonymous geo-community PWA",
  applicationName: "NUUDL",
  manifest: "/manifest.webmanifest"
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

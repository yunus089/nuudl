import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NUUDL Admin",
  description: "Admin backoffice for moderation, creator review, and ledger operations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

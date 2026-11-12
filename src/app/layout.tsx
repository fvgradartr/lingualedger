import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
});

const plex = IBM_Plex_Mono({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "LinguaLedger",
  description:
    "An autonomous Turkish, English, and Spanish translation house. A guest pays on NEAR testnet, the job is recorded, the treasury settles. The owner key never sits on the host.",
  metadataBase: new URL("https://lingualedger.vercel.app"),
  openGraph: {
    title: "LinguaLedger",
    description: "Paste the text. The floor is on chain.",
    url: "https://lingualedger.vercel.app",
    siteName: "LinguaLedger",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "LinguaLedger",
    description: "Paste the text. The floor is on chain.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${plex.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Fraunces, Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["SOFT", "WONK"] });

export const metadata: Metadata = {
  title: "Stitchkeeper",
  description: "Import crochet patterns and keep your place in every project.",
};

export const viewport: Viewport = { themeColor: "#f7f1e8" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-5 pt-6 pb-2">
          <Link href="/" className="font-display text-2xl font-semibold tracking-tight">
            Stitch<span className="text-yarn">keeper</span>
          </Link>
          <Link
            href="/import"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-yarn"
          >
            + Import pattern
          </Link>
        </header>
        <main className="mx-auto max-w-5xl px-5 pb-24">{children}</main>
      </body>
    </html>
  );
}

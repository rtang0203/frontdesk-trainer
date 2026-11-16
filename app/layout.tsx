import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { HomeLink } from "@/components/HomeLink";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Front Desk Trainer",
  description: "Practice front desk calls and get a scorecard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-stone-200 bg-white">
          <nav className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-3">
            <HomeLink />
            <Link href="/calls" className="text-base text-stone-600 hover:text-stone-900">
              Call history
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:py-12">{children}</main>
      </body>
    </html>
  );
}

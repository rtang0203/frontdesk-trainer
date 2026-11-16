import type { Metadata } from "next";
import { DM_Sans, Outfit } from "next/font/google";
import { Suspense } from "react";
import { HeaderNav, HomeLink, NavLink } from "@/components/HomeLink";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Front Desk Trainer",
  description: "Practice front desk calls and get a scorecard",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${dmSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b-2 border-ink">
          <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5.5 sm:px-14">
            <HomeLink />
            {/* The link reads the pathname, which suspends on /calls/[id] during prerendering. */}
            <Suspense fallback={<NavLink onHistory={false} />}>
              <HeaderNav />
            </Suspense>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-13 pb-16 sm:px-14">{children}</main>
      </body>
    </html>
  );
}

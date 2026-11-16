"use client";

import Link from "next/link";

export const RESET_LIVE_EVENT = "frontdesk:reset-live";

/** Logo link. Always lands on a clean live page, even when already on it. */
export function HomeLink() {
  return (
    <Link
      href="/"
      onClick={() => window.dispatchEvent(new Event(RESET_LIVE_EVENT))}
      className="text-lg font-semibold tracking-tight"
    >
      Front Desk Trainer
    </Link>
  );
}

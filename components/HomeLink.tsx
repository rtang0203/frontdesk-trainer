"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const RESET_LIVE_EVENT = "frontdesk:reset-live";

const resetLive = () => window.dispatchEvent(new Event(RESET_LIVE_EVENT));

/** Logo link. Always lands on a clean live page, even when already on it. */
export function HomeLink() {
  return (
    <Link href="/" onClick={resetLive} className="font-display text-[23px] font-bold leading-tight">
      Front Desk Trainer
    </Link>
  );
}

/** Right-hand header link: "Call history", or "Practice a call" on the history page. */
export function HeaderNav() {
  return <NavLink onHistory={usePathname() === "/calls"} />;
}

export function NavLink({ onHistory }: { onHistory: boolean }) {
  const className = "shrink-0 text-base font-semibold underline underline-offset-4";
  return onHistory ? (
    <Link href="/" onClick={resetLive} className={className}>
      Practice a call
    </Link>
  ) : (
    <Link href="/calls" className={className}>
      Call history
    </Link>
  );
}

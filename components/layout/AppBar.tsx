"use client";

import Image from "next/image";

import { Icon } from "@minty/shared/ui";

import { NavMenu, ViewerBadge } from "@/components/ui/NavMenu";
import { sidebarHost } from "@/components/ui/sidebarHost";

/**
 * Part 14 "App bar" - minty-payment-request-web's `components/layout/Header.tsx`, the look this app
 * takes: the way back · the Minty mark · the company's name · the initials (My Profile) · the menu.
 * 60px on a computer, 56 on a phone; it says WHERE you are, so the module name is for screen
 * readers only and never a heading.
 *
 * The way back is Flask's dashboard chevron: to the company list.
 */
export function AppBar({ companyName, title = "Petty Cash" }: { companyName: string; title?: string }) {
  return (
    <header className="border-b border-border-subtle bg-surface-card pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-14 w-full max-w-[1920px] items-center gap-2 px-4 sm:h-15 sm:gap-3 sm:px-6 lg:px-8">
        <a
          href={sidebarHost.links.entities()}
          className="-ml-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-text-link hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          aria-label="Back to your companies"
        >
          <Icon name="chevron_left" size="lg" />
        </a>
        <Image
          src="/minty-mark.png"
          alt="Minty"
          width={40}
          height={40}
          priority
          unoptimized
          className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
        />
        <span className="sr-only">{title}</span>
        <div className="ml-auto flex min-w-0 shrink items-center gap-1 sm:gap-2">
          <span className="hidden min-w-0 items-center gap-1.5 text-body-m text-text-secondary min-[360px]:flex">
            <Icon name="corporate_fare" size="md" />
            <span className="min-w-0 max-w-[7rem] truncate sm:max-w-[12rem] lg:max-w-[20rem]">{companyName}</span>
          </span>
          <ViewerBadge />
          <NavMenu />
        </div>
      </div>
    </header>
  );
}

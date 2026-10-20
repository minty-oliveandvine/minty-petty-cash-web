"use client";

import { ProfilePanel, SubscriptionsOverviewCard } from "@minty/shared/profile";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useToast } from "@/components/flask/Toasts";
import { SidebarProvider } from "@/components/ui/Sidebar";
import { profileApi } from "@/lib/profileApi";
import { loadSubscriptions } from "@/lib/subscriptionsApi";
import { isSharePage } from "@/lib/share";

/**
 * The app's sidebar around every page but the public share page (`/share/...`, lib/share.ts): a
 * report shared with someone outside the company carries no navigation at all - not even the
 * closed drawer's links in the page. Its PhoneCard (`publicView`) draws no button that opens one.
 *
 * My Profile is the sidebar's second view - the shared panel, over the page, never minty-web's
 * page (the owner, 2026-10-20): this app hands it its Flask calls, its toast and the Subscriptions
 * Overview (subscription-api's list, every page).
 */
export function SidebarShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const toast = useToast();
  if (isSharePage(pathname)) return <>{children}</>;
  const profile = (
    <ProfilePanel
      api={profileApi}
      notify={toast}
      subscriptions={<SubscriptionsOverviewCard load={loadSubscriptions} />}
    />
  );
  // main is the original design (the owner, 2026-10-20); development draws the redesign (v2).
  return (
    <SidebarProvider look="classic" profile={profile}>
      {children}
    </SidebarProvider>
  );
}

"use client";

/**
 * The app's sidebar, with My Profile as its second view - the shared panel (`@minty/shared/profile`,
 * v0.6), over the page, never minty-web's page (the owner, 2026-10-20). This branch draws the
 * redesign (`v2`, the provider's default); `main` draws the original. This app hands the panel its
 * Flask calls and the Subscriptions Overview (lib/apiClient.ts, over `@minty/shared/portal`) and a
 * toast of its own for "Your profile is saved." - there is no app-wide toast here, each page keeps
 * its own (`ToastRegion`).
 */

import { ProfilePanel, SubscriptionsOverviewCard } from "@minty/shared/profile";
import { useCallback, useState, type ReactNode } from "react";

import { SidebarProvider } from "@/components/ui/Sidebar";
import { ToastRegion, type ToastMessage } from "@/components/ui/Toast";
import { loadSubscriptions, profileApi } from "@/lib/apiClient";

export function AppSidebar({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = useCallback(
    (message: string) => setToast({ id: Date.now(), message }),
    [],
  );
  const dismiss = useCallback(() => setToast(null), []);

  const profile = (
    <ProfilePanel
      api={profileApi}
      notify={notify}
      subscriptions={<SubscriptionsOverviewCard load={loadSubscriptions} />}
    />
  );
  return (
    <SidebarProvider profile={profile}>
      {children}
      <ToastRegion toast={toast} onDismiss={dismiss} />
    </SidebarProvider>
  );
}

"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SidebarProvider } from "@/components/ui/Sidebar";
import { isSharePage } from "@/lib/share";

/**
 * The app's sidebar around every page but the public share page (`/share/...`, lib/share.ts): a
 * report shared with someone outside the company carries no navigation at all - not even the
 * closed drawer's links in the page. Its PhoneCard (`publicView`) draws no button that opens one.
 */
export function SidebarShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isSharePage(pathname)) return <>{children}</>;
  return <SidebarProvider>{children}</SidebarProvider>;
}

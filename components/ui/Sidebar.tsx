"use client";

// The sidebar lives in @minty/shared. This file exists for its side-effect import: it registers
// THIS app's host (components/ui/sidebarHost.ts) before anything renders.

import "@/components/ui/sidebarHost";

export {
  SidebarProvider,
  SidebarDrawer,
  useSidebar,
  useMounted,
  type SidebarControls,
  type SidebarView,
} from "@minty/shared/sidebar";

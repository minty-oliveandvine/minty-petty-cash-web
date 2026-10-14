"use client";

// The sidebar lives in @minty/shared; the side-effect import registers this app's host first.

import "@/components/ui/sidebarHost";

export { NavMenu, ViewerBadge, type NavMenuProps } from "@minty/shared/sidebar";

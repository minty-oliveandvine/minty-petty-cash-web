/**
 * Where this app's links to a company's settings go. Every settings tab is minty-web's (the hub)
 * since 2026-11-10 (owner) - Petty Cash Settings and Payment Settings moved there from this app and
 * the payments app - so each link goes through accounts-api's `/handoff/minty-web`, which mints
 * the hub's token for the company. This app's old address for the page,
 * `/entity/<shortid>/<name>/settings/petty-cash`, only sends people on
 * (`app/entity/[ref]/[slug]/settings/petty-cash/page.tsx`).
 */

import { companyRef } from "@minty/shared/companyRef";

import { hubUrl } from "@/lib/handoff";

/** The hub's settings tabs (minty-web `lib/hubPaths.ts`'s `CompanySettingsTab`). */
export type SettingsTab =
  "users" | "general" | "integration" | "petty-cash" | "payment" | "modules";

/** A settings tab in the hub, through the hand-off that mints its token for the company. */
export function settingsTabUrl(entityId: string, entityName: string, tab: SettingsTab): string {
  return hubUrl(`/entity/${companyRef(entityId, entityName)}/settings/${tab}`, entityId);
}

/** Petty Cash Settings - the menu's Settings and the Setup Required gate's way to it. */
export function settingsHref(entityId: string, entityName: string): string {
  return settingsTabUrl(entityId, entityName, "petty-cash");
}

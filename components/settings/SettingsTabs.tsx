/**
 * The settings pill row, so a company's settings read as one place across the apps: the same
 * sections, order, name ("Settings sections") and look as minty-web's `components/ui/SettingsTabs.tsx`
 * (44px pills, wrapping), drawn in this app's Part 13 tokens. This page is Petty Cash Settings, the
 * current pill; every other one leaves the app through its hand-off (lib/hub.ts), so they are plain
 * links (full page loads). Payment Request Settings shows only when the company has that module, as
 * in Flask, minty-web and the payments app.
 */

import { paymentRequestSettingsUrl, settingsSectionUrl } from "@/lib/hub";

type Tab = { label: string; href?: string };

function tabs(entityId: string, entityName: string, billing: boolean): Tab[] {
  return [
    { label: "Users", href: settingsSectionUrl(entityId, entityName, "users") },
    { label: "Entity & Integration", href: settingsSectionUrl(entityId, entityName, "integration") },
    { label: "Petty Cash Settings" },
    ...(billing ? [{ label: "Payment Request Settings", href: paymentRequestSettingsUrl(entityId) }] : []),
    { label: "Modules", href: settingsSectionUrl(entityId, entityName, "modules") },
  ];
}

const pill = (current: boolean) =>
  `flex min-h-11 shrink-0 items-center justify-center rounded-lg border px-4 py-2 text-center text-body-m font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus ${
    current
      ? "border-border-selected bg-state-selected text-text-link"
      : "border-border-default bg-surface-card text-text-secondary hover:bg-state-hover"
  }`;

export function SettingsTabs({
  entityId,
  entityName,
  billing,
}: {
  entityId: string;
  entityName: string;
  billing: boolean;
}) {
  return (
    <nav aria-label="Settings sections" className="w-full min-w-0">
      <div className="flex min-w-0 flex-wrap gap-2">
        {tabs(entityId, entityName, billing).map((tab) =>
          tab.href ? (
            <a key={tab.label} href={tab.href} className={pill(false)}>
              {tab.label}
            </a>
          ) : (
            <span key={tab.label} aria-current="page" className={pill(true)}>
              {tab.label}
            </span>
          ),
        )}
      </div>
    </nav>
  );
}

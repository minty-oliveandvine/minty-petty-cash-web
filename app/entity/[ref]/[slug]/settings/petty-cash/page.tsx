import { PettyCashSettings } from "@/components/settings/PettyCashSettings";

/**
 * Petty Cash Settings: `/entity/<shortid>/<name>/settings/petty-cash` - Flask's address for the
 * same page, ported for the cards that need no Xero (components/settings/PettyCashSettings.tsx).
 */
export default function Page() {
  return <PettyCashSettings />;
}

import { PettyCashSettings } from "@/components/settings/PettyCashSettings";

/**
 * Petty Cash settings (Part 15.20 / 15.20b): `/entity/<shortid>/<name>/settings/petty-cash` -
 * Flask's address for the page. The parts that need no Xero; the Xero parts stay on Flask's page.
 */
export default function Page() {
  return <PettyCashSettings />;
}

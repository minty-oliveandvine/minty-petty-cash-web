import { Dashboard } from "@/components/dashboard/Dashboard";

/**
 * A company's Petty Cash dashboard: `/entity/<shortid>/<name>/petty-cash` - Flask's
 * `/entity/<id>/petty-cash`, ported exactly (components/dashboard/Dashboard.tsx).
 */
export default function Page() {
  return <Dashboard />;
}

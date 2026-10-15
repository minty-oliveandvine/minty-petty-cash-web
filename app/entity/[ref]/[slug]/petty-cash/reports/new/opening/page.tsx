"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { AdditionToDrawer } from "@/components/closing/AdditionToDrawer";

/**
 * The Daily Closing's first stage, "Addition to Drawer":
 * `/entity/<shortid>/<name>/petty-cash/reports/new/opening?transaction_date=` - Flask's address
 * for its Opening page (the stage's old name), kept so a link into one app works in the other.
 */
function AdditionPage() {
  const params = useSearchParams();
  return <AdditionToDrawer day={params.get("transaction_date")} />;
}

export default function Page() {
  return (
    <Suspense>
      <AdditionPage />
    </Suspense>
  );
}

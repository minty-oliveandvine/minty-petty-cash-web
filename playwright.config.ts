// Browser tests for Petty Cash. They run against a stack that is ALREADY UP (this app :3010 and
// Minty, the Flask app, on :5001 locally) -- nothing is started here, as in the sibling apps.
// See e2e/README.md. The settings every app shares (one worker, traces on failure, E2E_BASE_URL)
// are @minty/shared/playwright's; its default base is http://localhost:3010 - localhost, not
// 127.0.0.1: it is the origin Flask allows by default (PETTY_CASH_WEB_URL).
//
// Two projects: a computer ("desktop"), and the 360px phone (`phone: true`) - Petty Cash is used
// on a phone more than 95% of the time (Part 15.15), so every journey runs at the phone width too.
import { mintyPlaywright } from "@minty/shared/playwright";

export default mintyPlaywright({ port: 3010, desktopName: "desktop", phone: true });

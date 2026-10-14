import { PettyCashHome } from "./PettyCashHome";

/**
 * A company's Petty Cash: `/entity/<shortid>/<name>/petty-cash`. The scaffold's one page - it
 * proves the hand-off, the token and the Petty Cash API end to end, and sends the person to
 * Minty's Petty Cash for the work itself until the redesigned screens land on `development`.
 */
export default function Page() {
  return <PettyCashHome />;
}

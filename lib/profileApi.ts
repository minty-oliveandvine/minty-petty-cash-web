/**
 * My Profile's two calls, for the packaged panel (`@minty/shared/profile`): Flask's `GET` /
 * `PATCH /api/me/profile` over this app's bearer (`mintyFetch`, to `ACCOUNTS_API_URL`). The
 * company is the cookie's, sent as `?entity=` - Flask names it, the person's role and its modules,
 * and refuses one the person may not see. A refusal is an `ApiError` (`status` + Flask's
 * sentence), which the panel shows as it stands; a 401 has already gone back through the hand-off.
 *
 * Module-level on purpose: the panel reads the profile again whenever `api` changes identity.
 */

import type { Profile, ProfileApi, ProfileChanges } from "@minty/shared/profile";

import { mintyFetch } from "@/lib/apiClient";

const query = (entityId: string) => ({ entity: entityId || undefined });

export const profileApi: ProfileApi = {
  load: (entityId, signal) => mintyFetch<Profile>("/api/me/profile", { query: query(entityId), signal }),
  save: (changes: ProfileChanges, entityId) =>
    mintyFetch<Profile>("/api/me/profile", { method: "PATCH", json: changes, query: query(entityId) }),
};

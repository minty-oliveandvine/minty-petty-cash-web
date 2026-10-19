"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

import { useViewer } from "@minty/shared/viewer";

import { useToast } from "@/components/flask/Toasts";
import { SalesMethodsCard, type MethodActions } from "@/components/settings/SalesMethodsCard";
import { BTN_OUTLINE, BusyOverlay, Combo, ConfirmDialog, Icon, LABEL, SAVE_BTN, SettingsCard, type ComboRow } from "@/components/settings/SettingsParts";
import { AccountCodesCard, XeroMappingCard, type Call, type XeroLoad } from "@/components/settings/XeroCards";
import { useMounted, useSidebar } from "@/components/ui/Sidebar";
import { sidebarHost } from "@/components/ui/sidebarHost";
import { ApiError, pettyCashFetch, type ApiRequest } from "@/lib/apiClient";
import { moduleClaims } from "@/lib/auth";
import { pettyCashHome } from "@/lib/companyPages";
import { setFlash } from "@/lib/flash";
import {
  KIND,
  METHOD_TYPES,
  countryChange,
  movedIds,
  registryOptions,
  settingsTabUrl,
  viewOnly,
  type MethodType,
  type Option,
  type SalesMethod,
  type SettingsAnswer,
  type SettingsRead,
  type SettingsTab,
} from "@/lib/settings";
import { useAuth } from "@/lib/useAuth";
import type { XeroRead } from "@/lib/xeroSettings";

const UNREACHABLE = "We couldn't reach Petty Cash. Check your connection, then reload the page.";
const SAVING = "Saving changes…";
const NO_RIGHT_TITLE = "That task is reserved for our Accountants and Admins.";

type Load = { kind: "loading" } | { kind: "ready"; read: SettingsRead } | { kind: "refused"; message: string } | { kind: "failed"; message: string };

/** The sentence for a failed call, or null for a 401 (already on its way back through Flask). */
function refusal(err: unknown): string | null {
  if (err instanceof ApiError) return err.status === 401 ? null : err.message;
  return UNREACHABLE;
}

/**
 * Petty Cash Settings - a pixel-faithful port of Flask's ORIGINAL `entity/settings_entity.html`
 * (Minty `1c25b35^1`), at Flask's `/entity/<id>/settings/petty-cash`, for the cards that need no
 * Reads `GET /settings` and `GET /settings/xero` (Minty `petty_cash_api/routes/settings.py`).
 *
 * - Flask's chrome: Back and "Settings", the company, the person's initials and the ≡; then the
 *   settings tabs (the others are minty-web's and the payments app's, through Flask's hand-offs).
 * - Country & currency: the two pickers and their Save (`PUT /settings/country`).
 * - Xero account mapping and Petty Cash Account Code (`XeroCards.tsx`), read once per page load from
 *   `GET /settings/xero` (it asks Xero), each with its own Save; Flask's "Xero isn't connected"
 *   notice in both when the connection is not live.
 * - Electronic and Delivery: add (the catalogue or a new name), rename, Move up / down, Delete -
 *   each the API's at once, its answer drawn and its sentence shown.
 *
 * What a person may change is the API's `permissions`; a cashier sees it all read-only.
 */
export function PettyCashSettings() {
  const auth = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    pettyCashFetch<SettingsRead>("/settings").then(
      (read) => {
        if (live) setLoad({ kind: "ready", read });
      },
      (err: unknown) => {
        const message = refusal(err);
        if (!live || message === null) return;
        setLoad(err instanceof ApiError && err.status === 403 ? { kind: "refused", message } : { kind: "failed", message });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  return (
    <div className="min-h-screen bg-flask-white font-sans text-flask-ink antialiased">
      <SettingsHeader entityId={auth?.entityId ?? ""} entityName={auth?.entityName ?? ""} />
      <main className="min-w-0 pb-[env(safe-area-inset-bottom,0px)]">
        <div className="mx-auto w-full max-w-[1024px] px-4 sm:px-6">
          <SettingsTabs entityId={auth?.entityId ?? ""} entityName={auth?.entityName ?? ""} />
          <div className="w-full pb-8 pt-2 sm:pt-3">
            {load.kind === "loading" ? (
              <p className="m-0 text-sm text-flask-set-gray-500" role="status">
                Loading…
              </p>
            ) : null}
            {load.kind === "refused" ? (
              <p className="m-0 text-sm text-flask-set-red-600" role="alert">
                {load.message}
              </p>
            ) : null}
            {load.kind === "failed" ? (
              <div className="flex flex-col items-start gap-3" role="alert">
                <p className="m-0 text-sm text-flask-set-gray-700">{load.message}</p>
                <button
                  type="button"
                  className={BTN_OUTLINE}
                  onClick={() => {
                    setLoad({ kind: "loading" });
                    setAttempt((n) => n + 1);
                  }}
                >
                  Try again
                </button>
              </div>
            ) : null}
            {load.kind === "ready" && auth ? <SettingsBody initial={load.read} entityId={auth.entityId} entityName={auth.entityName} /> : null}
          </div>
        </div>
      </main>
    </div>
  );
}

/** Flask's header (minty-web's AppHeader): ‹ Back and "Settings"; the company; the initials and the ≡. */
function SettingsHeader({ entityId, entityName }: { entityId: string; entityName: string }) {
  const router = useRouter();
  const sidebar = useSidebar();
  const mounted = useMounted();
  const viewer = useViewer();
  const menu = useRef<HTMLButtonElement>(null);
  const home = entityId ? pettyCashHome(entityId, entityName) : undefined;
  return (
    <header className="sticky top-0 z-40 bg-flask-white pt-[env(safe-area-inset-top,0px)]">
      <div className="relative mx-auto flex h-16 w-full max-w-[1920px] items-center justify-between gap-2 px-4 sm:h-[4.5rem] sm:gap-3 sm:px-6">
        <div className="flex min-h-10 min-w-0 flex-1 flex-nowrap items-center gap-2 sm:min-h-0 sm:gap-3">
          <a
            href={home}
            onClick={(e: MouseEvent<HTMLAnchorElement>) => {
              if (!home || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              router.push(home);
            }}
            className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-flask-menu no-underline transition-colors hover:text-flask-teal sm:text-base"
          >
            <Icon name="chevron_left" className="text-[22px] sm:text-[24px]" />
            Back
          </a>
          <h1 className="m-0 min-w-0 cursor-default truncate text-base font-semibold text-flask-black sm:text-lg">Settings</h1>
        </div>
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-3">
          <Icon name="corporate_fare" className="text-[22px] text-flask-menu sm:text-[26px]" />
          <span className="min-w-0 max-w-[6.5rem] truncate text-sm font-medium text-flask-menu sm:max-w-[9rem] sm:text-base md:max-w-[14rem] lg:max-w-[28rem]">{entityName}</span>
          <div className="flex shrink-0 items-center gap-1.5 pl-0.5 sm:gap-2 sm:pl-2">
            <a
              href={mounted ? sidebarHost.links.profile() : undefined}
              aria-label={`${viewer?.name ?? ""}, My Profile`.replace(/^, /, "")}
              title={viewer?.name ?? ""}
              // 44px for a finger without moving Flask's 28px badge
              className="relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-flask-avatar-bg text-[12px] font-semibold text-flask-avatar-ink no-underline transition-shadow before:absolute before:-inset-2 before:content-[''] hover:ring-2 hover:ring-flask-menu/30"
            >
              <span aria-hidden="true">{viewer?.initials || "?"}</span>
            </a>
            <button
              ref={menu}
              type="button"
              onClick={() => sidebar?.openMenu(menu.current)}
              aria-label="Open navigation menu"
              aria-expanded={sidebar ? sidebar.open && sidebar.view === "menu" : false}
              aria-controls={sidebar?.panelId}
              className="m-0 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-flask-md border-0 bg-transparent p-0 transition-colors hover:bg-flask-menu/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Flask's own glyph, a small svg */}
              <img src="/menu/menu.svg" alt="" width={29} height={32} className="block h-auto w-[29px]" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Flask's settings tabs (minty-web's SettingsTabs): Petty Cash Settings is this page; the rest are
 * minty-web's and the payments app's pages, through Flask's hand-offs (`settingsTabUrl`).
 */
function SettingsTabs({ entityId, entityName }: { entityId: string; entityName: string }) {
  const mounted = useMounted();
  const billing = mounted ? moduleClaims().billing : false;
  const PILL = "flex shrink-0 items-center justify-center rounded-full px-4 py-2 text-center text-sm font-medium no-underline transition-colors";
  const link = (tab: SettingsTab, label: string) => (
    <a href={entityId ? settingsTabUrl(entityId, entityName, tab) : undefined} className={`${PILL} cursor-pointer bg-flask-gray-200 text-flask-set-gray-700 hover:bg-flask-set-gray-300`}>
      {label}
    </a>
  );
  return (
    <div className="sticky top-16 z-10 bg-flask-white py-3 sm:top-[4.5rem] sm:py-4">
      <nav className="flex flex-wrap gap-2 pb-1" aria-label="Settings sections">
        {link("users", "Users")}
        {link("integration", "Entity & Integration")}
        <span className={`${PILL} cursor-default bg-flask-teal font-semibold text-flask-white`} aria-current="page">
          Petty Cash Settings
        </span>
        {billing ? link("payment-request", "Payment Request Settings") : null}
        {link("modules", "Modules")}
      </nav>
    </div>
  );
}

function SettingsBody({ initial, entityId, entityName }: { initial: SettingsRead; entityId: string; entityName: string }) {
  const toast = useToast();
  const router = useRouter();
  const [read, setRead] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: MethodType; method: SalesMethod } | null>(null);
  // a ref, not state: a second click in the same frame must see the first one
  const acting = useRef(false);
  const perms = read.permissions;

  useEffect(() => {
    if (menu === null) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (!(e.target as Element).closest?.("[data-row-menu]")) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  /** One call: the busy overlay, and a refusal's sentence as Flask's error toast; null when it did not go through. */
  const call: Call = useCallback(
    async <T,>(path: string, init: ApiRequest, busyText = SAVING, onRefused?: (message: string) => void): Promise<T | null> => {
      if (acting.current) return null;
      acting.current = true;
      setBusy(busyText);
      try {
        return await pettyCashFetch<T>(path, init);
      } catch (err) {
        const message = refusal(err);
        if (message !== null) {
          toast(message, "error");
          onRefused?.(message);
        }
        return null;
      } finally {
        acting.current = false;
        setBusy(null);
      }
    },
    [toast],
  );

  /** One write of the cards that need no Xero: the API's answer drawn and its sentence shown; true when it went through. */
  const write = useCallback(
    async (path: string, init: ApiRequest): Promise<boolean> => {
      const answer = await call<SettingsAnswer>(path, init);
      if (!answer) return false;
      const { message, ...next } = answer;
      setRead(next);
      toast(message, "success");
      return true;
    },
    [call, toast],
  );

  // The Xero cards' read: once per page load (each read asks Xero), and again only on Try again.
  const [xero, setXero] = useState<XeroLoad>({ kind: "loading" });
  const [xeroAttempt, setXeroAttempt] = useState(0);
  // one request per attempt, even when an effect runs twice (React's dev check): each read asks Xero
  const xeroAsk = useRef<{ attempt: number; answer: Promise<XeroRead> } | null>(null);
  useEffect(() => {
    let live = true;
    if (xeroAsk.current?.attempt !== xeroAttempt) xeroAsk.current = { attempt: xeroAttempt, answer: pettyCashFetch<XeroRead>("/settings/xero") };
    xeroAsk.current.answer.then(
      (next) => {
        if (live) setXero({ kind: "ready", read: next });
      },
      (err: unknown) => {
        const message = refusal(err);
        if (!live || message === null) return;
        setXero({ kind: "failed", message, retry: !(err instanceof ApiError && err.status === 403) });
      },
    );
    return () => {
      live = false;
    };
  }, [xeroAttempt]);
  const retryXero = () => {
    setXero({ kind: "loading" });
    setXeroAttempt((n) => n + 1);
  };
  const xeroSaved = ({ message, ...next }: XeroRead & { message: string }) => {
    setXero({ kind: "ready", read: next });
    toast(message, "success");
  };
  const connectHref = settingsTabUrl(entityId, entityName, "integration");

  const actions: MethodActions = {
    add: (type, body) => write("/sales-methods", { method: "POST", json: { type, ...body } }),
    rename: (method, name) => write(`/sales-methods/${encodeURIComponent(method.id)}`, { method: "PUT", json: { name } }),
    move: (type, index, step) => {
      const ids = movedIds(
        read.sales_methods[type].map((m) => m.id),
        index,
        step,
      );
      if (ids) void write("/sales-methods/order", { method: "PUT", json: { type, method_ids: ids } });
    },
    remove: (type, method) => setConfirmDelete({ type, method }),
    say: (message) => toast(message, "error"),
  };

  return (
    <>
      {viewOnly(perms) ? (
        <div role="status" aria-live="polite" className="mb-6 flex items-center gap-2 rounded-flask-lg border border-flask-gray-200 bg-flask-gray-50 px-4 py-2.5 text-sm text-flask-gray-600">
          <Icon name="visibility" className="text-[18px] leading-none text-flask-gray-400" />
          <span>You have view-only access to these settings. Ask an Accountant or Admin to make changes.</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <CountryCard key={`${read.country.country_code}|${read.country.currency_id}`} read={read} busy={busy !== null} onSave={(body) => write("/settings/country", { method: "PUT", json: body })} />

        <XeroMappingCard
          load={xero}
          busy={busy !== null}
          call={call}
          connectHref={connectHref}
          onRetry={retryXero}
          onAdded={(message) => toast(message, "success")}
          onSaved={({ first_save, ...answer }) => {
            if (!first_save) {
              xeroSaved(answer);
              return;
            }
            // Flask's first mapping save went on to the company's dashboard, the sentence with it
            setFlash(answer.message, "success");
            router.push(pettyCashHome(entityId, entityName));
          }}
        />

        {METHOD_TYPES.map((type) => (
          <SalesMethodsCard
            key={type}
            type={type}
            methods={read.sales_methods[type]}
            available={read.available[type]}
            permissions={perms}
            busy={busy !== null}
            menuOpen={menu}
            onMenu={setMenu}
            actions={actions}
          />
        ))}

        <AccountCodesCard load={xero} busy={busy !== null} call={call} connectHref={connectHref} onRetry={retryXero} onSaved={xeroSaved} />
      </div>

      {busy ? <BusyOverlay text={busy} /> : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${KIND[confirmDelete.type].title} Method`}
          confirmLabel="Delete"
          onBack={() => setConfirmDelete(null)}
          onConfirm={() => {
            const { method } = confirmDelete;
            setConfirmDelete(null);
            void write(`/sales-methods/${encodeURIComponent(method.id)}`, { method: "DELETE" });
          }}
        >
          <p className="m-0">
            Are you sure you want to delete &quot;<strong className="font-semibold text-flask-black">{confirmDelete.method.name}</strong>&quot;? This action cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

/** Flask's first card: the country and currency pickers, and Save Changes for them. */
function CountryCard({ read, busy, onSave }: { read: SettingsRead; busy: boolean; onSave: (body: { country_code?: string; currency_id?: string }) => Promise<boolean> }) {
  const editable = read.permissions.edit_country;
  const countries: Option[] = read.country.countries.map((c) => ({ value: c.code, label: c.name }));
  const currencies: Option[] = read.country.currencies.map((c) => ({ value: c.id, label: c.name }));
  const [picked, setPicked] = useState({ country_code: read.country.country_code ?? "", currency_id: read.country.currency_id ?? "" });
  const labelOf = (all: Option[], value: string, fallback: string | null) => all.find((o) => o.value === value)?.label ?? fallback ?? "";
  const countryLabel = labelOf(countries, picked.country_code, read.country.selected_country);
  const currencyLabel = labelOf(currencies, picked.currency_id, read.country.selected_currency);
  const [countryText, setCountryText] = useState(countryLabel);
  const [currencyText, setCurrencyText] = useState(currencyLabel);
  const change = countryChange(read, picked);
  const [saving, setSaving] = useState(false);

  const rows = (all: Option[], selected: string, current: string) => (query: string): ComboRow[] => {
    const out: ComboRow[] = registryOptions(all, query, current).map((o) => ({ key: o.value, label: o.label, selected: o.value === selected }));
    const q = query.toLowerCase();
    if (q && !all.some((o) => o.label.toLowerCase().includes(q))) out.push({ key: "none", label: "No matches", info: true });
    return out;
  };

  return (
    <SettingsCard title="Country & currency" sub="Where this entity reports from, and the currency its petty cash is counted in." readOnly={!editable} testId="country">
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!editable || !change || busy) return;
          setSaving(true);
          // a save that went through draws the new read, which remounts this card
          void onSave(change).finally(() => setSaving(false));
        }}
      >
        <div className="flex flex-col gap-2">
          <label className={LABEL} htmlFor="ci_country_display">
            Select Country
          </label>
          <Combo
            id="ci_country_display"
            value={countryText}
            placeholder="Select a country"
            disabled={!editable}
            rows={rows(countries, picked.country_code, countryLabel)}
            onText={setCountryText}
            onPick={(code) => {
              setPicked((p) => ({ ...p, country_code: code }));
              setCountryText(labelOf(countries, code, null));
            }}
            onBlur={() => setCountryText(countryLabel)}
          />
        </div>
        <div className="flex flex-col gap-2 border-t border-flask-gray-100 pt-4">
          <label className={LABEL} htmlFor="ci_currency_display">
            Select Currency
          </label>
          <Combo
            id="ci_currency_display"
            value={currencyText}
            placeholder="Select a currency"
            disabled={!editable}
            rows={rows(currencies, picked.currency_id, currencyLabel)}
            onText={setCurrencyText}
            onPick={(id) => {
              setPicked((p) => ({ ...p, currency_id: id }));
              setCurrencyText(labelOf(currencies, id, null));
            }}
            onBlur={() => setCurrencyText(currencyLabel)}
          />
        </div>
        <div className="mt-3 flex flex-col gap-3">
          <button
            type="submit"
            disabled={!editable || !change || busy}
            title={editable ? undefined : NO_RIGHT_TITLE}
            className={SAVE_BTN}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </SettingsCard>
  );
}

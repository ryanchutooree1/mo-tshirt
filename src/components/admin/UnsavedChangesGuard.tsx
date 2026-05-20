"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

type PendingNavigation = {
  href: string;
};

type UnsavedChangesGuardProps = {
  active: boolean;
  title?: string;
  message?: string;
  saveLabel?: string;
  discardLabel?: string;
  stayLabel?: string;
  isSaving?: boolean;
  onSave: () => Promise<boolean | void> | boolean | void;
};

function getAnchorFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

function shouldIgnoreNavigation(event: MouseEvent, anchor: HTMLAnchorElement) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return true;
  }

  if (anchor.target && anchor.target !== "_self") return true;
  if (anchor.hasAttribute("download")) return true;
  if (anchor.dataset.unsavedGuard === "ignore") return true;

  const rawHref = anchor.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#")) return true;
  if (rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return true;

  const nextUrl = new URL(anchor.href, window.location.href);
  const currentUrl = new URL(window.location.href);
  return (
    nextUrl.origin === currentUrl.origin &&
    nextUrl.pathname === currentUrl.pathname &&
    nextUrl.search === currentUrl.search
  );
}

export default function UnsavedChangesGuard({
  active,
  title = "Save changes before leaving?",
  message = "You have unsaved changes on this page. Save them before opening another page, or leave without saving.",
  saveLabel = "Save changes",
  discardLabel = "Don't save",
  stayLabel = "Keep editing",
  isSaving = false,
  onSave,
}: UnsavedChangesGuardProps) {
  const router = useRouter();
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);
  const [savingFromDialog, setSavingFromDialog] = useState(false);
  const saving = isSaving || savingFromDialog;

  useEffect(() => {
    if (!active) {
      setPendingNavigation(null);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const handleClick = (event: MouseEvent) => {
      const anchor = getAnchorFromTarget(event.target);
      if (!anchor || shouldIgnoreNavigation(event, anchor)) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingNavigation({ href: anchor.href });
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [active]);

  const continueNavigation = (navigation: PendingNavigation) => {
    const nextUrl = new URL(navigation.href, window.location.href);
    const currentUrl = new URL(window.location.href);

    if (nextUrl.origin === currentUrl.origin) {
      router.push(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
      return;
    }

    window.location.assign(navigation.href);
  };

  const saveAndContinue = async () => {
    if (!pendingNavigation) return;
    setSavingFromDialog(true);

    try {
      const saved = await onSave();
      if (saved === false) return;
      const navigation = pendingNavigation;
      setPendingNavigation(null);
      continueNavigation(navigation);
    } catch {
      // Keep the dialog open so the page can show its existing validation or save error.
    } finally {
      setSavingFromDialog(false);
    }
  };

  const discardAndContinue = () => {
    if (!pendingNavigation) return;
    const navigation = pendingNavigation;
    setPendingNavigation(null);
    continueNavigation(navigation);
  };

  if (!pendingNavigation) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={saveAndContinue}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {saving ? "Saving..." : saveLabel}
          </button>
          <button
            type="button"
            onClick={discardAndContinue}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
          >
            {discardLabel}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setPendingNavigation(null)}
          disabled={saving}
          className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {stayLabel}
        </button>
      </div>
    </div>
  );
}

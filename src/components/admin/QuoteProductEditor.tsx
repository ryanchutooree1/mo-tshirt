"use client";
import { useCallback, useEffect, useState } from "react";
import {
  History,
  LockKeyhole,
  LockKeyholeOpen,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  EditActor,
  EditLock,
  ProductEditRow,
} from "@/lib/quote-product-edit";

type Editor = {
  rows: ProductEditRow[];
  printMethod: string;
  quoteLines: { description?: string }[];
  version: string;
  total: number;
  lock: EditLock | null;
};
type HistoryEntry = {
  id: string;
  action: string;
  reason: string;
  actor: EditActor;
  atIso: string;
  changes: { field: string; before: unknown; after: unknown }[];
};
const fieldLabels: Record<string, string> = {
  garments: "Products, sizes and quantities",
  quantity: "Total quantity",
  printMethod: "Print method",
  "quote.lines": "Quotation lines",
  "quote.total": "Quotation total",
  "quote.subtotal": "Quotation subtotal",
};
const labels: Record<string, string> = {
  "save-products": "Product details corrected",
  "save-document": "Quotation updated",
  unlock: "Unlocked for editing",
  lock: "Locked without changes",
};
function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value))
    return (
      value
        .map((item) => {
          if (!item || typeof item !== "object") return String(item);
          const row = item as Record<string, unknown>;
          return `${row.garment || row.description || row.size || "Item"}${row.color ? ` / ${row.color}` : ""}${row.garment && row.size ? ` / ${row.size}` : ""}${row.quantity !== undefined ? ` × ${row.quantity}` : ""}${row.unitPrice !== undefined ? ` @ ${row.unitPrice}` : ""}`;
        })
        .join("\n") || "None"
    );
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
export default function QuoteProductEditor({
  quoteId,
  revision,
  userId,
  blocked,
}: {
  quoteId: string;
  revision: number;
  userId?: string;
  blocked: boolean;
}) {
  const [editor, setEditor] = useState<Editor | null>(null),
    [rows, setRows] = useState<ProductEditRow[]>([]),
    [method, setMethod] = useState("");
  const [token, setToken] = useState(""),
    [version, setVersion] = useState(""),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<HistoryEntry[]>([]),
    [cursor, setCursor] = useState<number | null>(null);
  const endpoint = `/api/admin/quotes/${encodeURIComponent(quoteId)}/products`;
  const load = useCallback(
    async (before?: number) => {
      const response = await fetch(
        endpoint + (before ? `?before=${before}` : ""),
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setEditor(data.editor);
      setHistory((current) =>
        before ? [...current, ...data.history] : data.history,
      );
      setCursor(data.nextCursor);
      return data.editor as Editor;
    },
    [endpoint],
  );
  useEffect(() => {
    load().catch((cause) => setError(cause.message));
  }, [load, revision]);
  useEffect(() => {
    if (token || !editor?.lock || editor.lock.expiresAt <= Date.now()) return;
    const timer = window.setTimeout(
      () => {
        load().catch((cause) => setError(cause.message));
      },
      editor.lock.expiresAt - Date.now() + 500,
    );
    return () => window.clearTimeout(timer);
  }, [editor?.lock, load, token]);
  const action = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          operationId: crypto.randomUUID(),
          ...extra,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not save this change.");
      setEditor(data.editor);
      return data.editor as Editor;
    },
    [endpoint],
  );
  useEffect(() => {
    if (!token) return;
    const timer = window.setInterval(() => {
      action("renew", { token }).catch((cause) => {
        setError(cause.message);
        setToken("");
      });
    }, 60000);
    return () => window.clearInterval(timer);
  }, [action, token]);
  async function unlock() {
    setBusy(true);
    setError("");
    try {
      const fresh = await load();
      const next =
        fresh.lock &&
        fresh.lock.expiresAt > Date.now() &&
        fresh.lock.actor.userId === userId
          ? fresh
          : await action("unlock");
      setRows(next.rows);
      setMethod(next.printMethod);
      setVersion(next.version);
      setReason("");
      setToken(next.lock!.token);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish(save: boolean) {
    setBusy(true);
    setError("");
    try {
      await action(
        save ? "save-products" : "lock",
        save
          ? { token, version, rows, printMethod: method, reason }
          : { token },
      );
      setToken("");
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const input =
    "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800";
  const button =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-40";
  const activeLock =
    editor?.lock && editor.lock.expiresAt > Date.now() ? editor.lock : null;
  return (
    <section aria-label="Editable product details" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-widest">
          Product details
        </h3>
        {!token ? (
          <button
            type="button"
            className={button}
            onClick={unlock}
            disabled={
              busy ||
              blocked ||
              !editor ||
              (!!activeLock && activeLock.actor.userId !== userId)
            }
          >
            <LockKeyhole size={15} />
            {activeLock?.actor.userId === userId
              ? "Resume my edit"
              : "Unlock to edit"}
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-orange-600">
            <LockKeyholeOpen size={15} />
            Editing
          </span>
        )}
      </div>
      {blocked && !token ? (
        <p className="text-xs text-amber-800">
          Save or discard your unsaved quotation changes before editing
          products.
        </p>
      ) : null}
      {activeLock && !token ? (
        <p className="text-xs text-amber-800">
          {activeLock.actor.displayName} is editing. The lock expires at{" "}
          {new Date(activeLock.expiresAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          if they leave.
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-xs text-red-800"
        >
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => load().catch(() => {})}
          >
            Refresh details
          </button>
        </p>
      ) : null}
      {!editor ? (
        <p className="text-xs">Loading product details…</p>
      ) : token ? (
        <div className="space-y-4">
          <p className="text-xs leading-5 text-slate-500">
            Save & lock updates the products, quotation lines and totals
            together. Existing unit prices are kept until you change them.
          </p>
          {rows.map((row, index) => (
            <fieldset
              key={row.id}
              className="space-y-3 rounded-xl border border-slate-200 p-3"
            >
              <legend className="px-1 text-xs font-bold">
                Product {index + 1}
              </legend>
              <label className="block text-xs">
                Product
                <input
                  className={input}
                  value={row.garment}
                  onChange={(e) =>
                    setRows((items) =>
                      items.map((r, i) =>
                        i === index ? { ...r, garment: e.target.value } : r,
                      ),
                    )
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  Colour
                  <input
                    className={input}
                    value={row.color}
                    onChange={(e) =>
                      setRows((items) =>
                        items.map((r, i) =>
                          i === index ? { ...r, color: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </label>
                <label className="text-xs">
                  Size
                  <input
                    className={input}
                    value={row.size}
                    onChange={(e) =>
                      setRows((items) =>
                        items.map((r, i) =>
                          i === index ? { ...r, size: e.target.value } : r,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  Quantity
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    step={1}
                    className={input}
                    value={row.quantity || ""}
                    onChange={(e) =>
                      setRows((items) =>
                        items.map((r, i) =>
                          i === index
                            ? { ...r, quantity: Number(e.target.value) }
                            : r,
                        ),
                      )
                    }
                  />
                </label>
                <label className="text-xs">
                  Unit price
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className={input}
                    value={row.unitPrice}
                    onChange={(e) =>
                      setRows((items) =>
                        items.map((r, i) =>
                          i === index
                            ? { ...r, unitPrice: Number(e.target.value) }
                            : r,
                        ),
                      )
                    }
                  />
                </label>
              </div>
              {editor.quoteLines.length ? (
                <label className="block text-xs">
                  Quotation line
                  <select
                    className={input}
                    value={row.lineIndex ?? "new"}
                    onChange={(e) =>
                      setRows((items) =>
                        items.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                lineIndex:
                                  e.target.value === "new"
                                    ? null
                                    : Number(e.target.value),
                              }
                            : r,
                        ),
                      )
                    }
                  >
                    <option value="new">Add a new quotation line</option>
                    {editor.quoteLines.map((line, i) => (
                      <option key={i} value={i}>
                        {i + 1}. {line.description}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="flex items-center justify-between text-xs">
                <span>
                  Line total:{" "}
                  {(row.quantity * row.unitPrice).toLocaleString("en-GB", {
                    minimumFractionDigits: 2,
                  })}
                </span>
                <button
                  type="button"
                  aria-label={`Remove product ${index + 1}`}
                  className={button}
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((items) => items.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            className={button}
            disabled={rows.length >= 50}
            onClick={() =>
              setRows((items) => [
                ...items,
                {
                  id: crypto.randomUUID(),
                  garment: items[0]?.garment || "",
                  color: items[0]?.color || "",
                  size: "",
                  quantity: 1,
                  unitPrice: items[0]?.unitPrice || 0,
                  lineIndex: null,
                },
              ])
            }
          >
            <Plus size={14} />
            Add product / size
          </button>
          <label className="block text-xs">
            Print method
            <input
              className={input}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            Reason for change
            <textarea
              className={input}
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: customer requested 2 Small polos on WhatsApp"
            />
          </label>
          <p className="text-xs font-bold">
            {rows.reduce((sum, row) => sum + row.quantity, 0)} garments ·
            Product subtotal{" "}
            {rows
              .reduce((sum, row) => sum + row.quantity * row.unitPrice, 0)
              .toLocaleString("en-GB", { minimumFractionDigits: 2 })}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || !reason.trim()}
              onClick={() => finish(true)}
            >
              <LockKeyhole size={14} />
              {busy ? "Saving…" : "Save & lock"}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => finish(false)}
            >
              Cancel & lock
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm leading-6 text-slate-600">
          {editor.rows.map((row) => (
            <div key={row.id}>
              <strong className="block text-slate-900">{row.garment}</strong>
              <span>
                {row.color} / {row.size} × {row.quantity}
              </span>
            </div>
          ))}
          <p>
            <strong className="text-slate-900">Print:</strong>{" "}
            {editor.printMethod || "Not set"}
          </p>
          <p>
            <strong className="text-slate-900">Total quantity:</strong>{" "}
            {editor.rows.reduce((sum, row) => sum + row.quantity, 0)}
          </p>
        </div>
      )}
      <details className="border-t border-slate-200 pt-3">
        <summary className="flex cursor-pointer items-center gap-2 text-xs font-bold">
          <History size={15} />
          Change history
        </summary>
        {!history.length ? (
          <p className="mt-3 text-xs text-slate-500">
            No recorded edits yet. Earlier changes made before history was
            introduced are not available.
          </p>
        ) : (
          <ol className="mt-3 space-y-4">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-slate-200 p-3 text-xs"
              >
                <strong>{labels[entry.action] || entry.action}</strong>
                <p className="mt-1">
                  {entry.actor.displayName} ·{" "}
                  {new Date(entry.atIso).toLocaleString("en-GB")}
                </p>
                {entry.reason ? <p className="mt-2">{entry.reason}</p> : null}
                {entry.changes.map((change) => (
                  <details key={change.field} className="mt-2">
                    <summary className="cursor-pointer font-semibold">
                      {fieldLabels[change.field] ||
                        change.field.replace(/^quote\./, "Quotation: ")}
                    </summary>
                    <div className="mt-2 grid gap-2">
                      <div className="rounded bg-slate-50 p-2">
                        <strong>Before</strong>
                        <p className="whitespace-pre-wrap break-words">
                          {display(change.before)}
                        </p>
                      </div>
                      <div className="rounded bg-green-50 p-2">
                        <strong>After</strong>
                        <p className="whitespace-pre-wrap break-words">
                          {display(change.after)}
                        </p>
                      </div>
                    </div>
                  </details>
                ))}
              </li>
            ))}
          </ol>
        )}
        {cursor ? (
          <button
            className={`${button} mt-3`}
            type="button"
            onClick={() =>
              load(cursor).catch((cause) => setError(cause.message))
            }
          >
            Load older changes
          </button>
        ) : null}
      </details>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, FlaskConical, ReceiptText, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { useAdminTheme } from "@/admin/AdminThemeContext";
import { TEST_SCENARIOS, emptyTestState, restoreTestState, simulateTestMessage, testStorageKey, type TestScenarioId, type TestState } from "@/lib/bot-testing";

export default function BotTestingWorkspace({ accountId }: { accountId: string }) {
  const { theme } = useAdminTheme();
  const dark = theme === "dark";
  const [state, setState] = useState<TestState>(() => emptyTestState());
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const current = useRef(state);
  const operation = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const storageKey = testStorageKey(accountId);

  const cancel = useCallback(() => {
    generation.current += 1;
    operation.current?.abort();
    operation.current = null;
    setBusy(false);
  }, []);

  const lock = useCallback(() => {
    cancel();
    current.current = emptyTestState();
    setState(current.current);
    setInput("");
    setLocked(true);
    try { window.sessionStorage.removeItem(storageKey); } catch {}
    setNotice("Owner session changed or could not be verified. Reload and sign in again to continue.");
  }, [cancel, storageKey]);

  const verifyOwner = useCallback(async (signal: AbortSignal) => {
    const response = await fetch("/api/admin/session", { cache: "no-store", signal });
    const body = await response.json();
    return response.ok && body.session?.isOwner === true && body.session.userId === accountId;
  }, [accountId]);

  useEffect(() => {
    const controller = new AbortController();
    const check = async (initial = false) => {
      try {
        if (!(await verifyOwner(controller.signal))) { if (!controller.signal.aborted) lock(); return; }
        if (controller.signal.aborted) return;
        if (initial) {
          let saved = emptyTestState();
          try { saved = restoreTestState(window.sessionStorage.getItem(storageKey)); }
          catch { setNotice("Browser storage is unavailable. Tests will stay in memory until you leave this page."); }
          current.current = saved;
          setState(saved);
          setReady(true);
        }
      } catch { if (!controller.signal.aborted) lock(); }
    };
    void check(true);
    const onFocus = () => { void check(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      generation.current += 1;
      operation.current?.abort();
      operation.current = null;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [lock, storageKey, verifyOwner]);

  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [state.messages, busy]);

  const commit = (next: TestState) => {
    current.current = next;
    setState(next);
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(next)); }
    catch { setNotice("Browser storage is unavailable. Tests will stay in memory until you leave this page."); }
  };

  const run = async (message: string) => {
    if (!ready || locked || operation.current || !message.trim()) return;
    const controller = new AbortController();
    operation.current = controller;
    const runId = generation.current;
    setBusy(true);
    setNotice("");
    try {
      if (!(await verifyOwner(controller.signal))) { lock(); return; }
      if (controller.signal.aborted || runId !== generation.current) return;
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 350);
        controller.signal.addEventListener("abort", () => { window.clearTimeout(timer); resolve(); }, { once: true });
      });
      if (controller.signal.aborted || runId !== generation.current) return;
      commit(simulateTestMessage(current.current, message));
      setInput("");
    } catch { if (!controller.signal.aborted) lock(); }
    finally {
      if (operation.current === controller) { operation.current = null; setBusy(false); }
    }
  };

  const reset = (scenarioId: TestScenarioId = current.current.scenarioId) => {
    cancel();
    commit(emptyTestState(scenarioId));
    setInput("");
    setNotice("Test reset. Synthetic quote, invoice and conversation cleared.");
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void run(input); };
  const fixture = TEST_SCENARIOS.find(s => s.id === state.scenarioId)!;
  const money = (value: number) => `MUR ${value.toLocaleString("en-US")}`;
  const panel = dark ? "border-white/10 bg-white/[0.03]" : "border-slate-200 bg-white";
  const muted = dark ? "text-white/60" : "text-slate-600";
  const field = dark ? "border-white/15 bg-black/20 text-white" : "border-slate-300 bg-white text-slate-900";
  const secondary = `rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${dark ? "border-white/15 hover:bg-white/10" : "border-slate-200 hover:bg-slate-50"}`;
  const disabled = !ready || locked || busy;

  return (
    <main className={`mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 ${dark ? "text-white" : "text-slate-900"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${dark ? "bg-emerald-400/10 text-emerald-300" : "bg-emerald-50 text-emerald-800"}`}><FlaskConical className="h-4 w-4" /> Internal test area · Owner only</div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bot Testing</h1>
          <p className={`mt-2 max-w-2xl text-sm leading-6 ${muted}`}>Try a quote-to-invoice workflow with a synthetic customer. All records and prices here are examples. Use test information only.</p>
        </div>
        <button type="button" onClick={() => reset()} disabled={!ready || locked} className={`${secondary} inline-flex items-center gap-2`}><RotateCcw className="h-4 w-4" /> Reset test</button>
      </div>

      <div className={`mt-6 flex items-start gap-3 rounded-2xl border p-4 ${dark ? "border-emerald-400/20 bg-emerald-400/5" : "border-emerald-200 bg-emerald-50/60"}`}>
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="text-sm leading-6"><p className="font-semibold">Isolated from your business</p><p className={muted}>No real orders, quotes, invoices, customers, payments or emails are read or changed. Inbox intake is off on this tab. Test state stays in this browser tab, separately for each owner account.</p></div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,1fr)]">
        <section aria-label="Bot conversation" className={`min-w-0 overflow-hidden rounded-2xl border ${panel}`}>
          <div className={`flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5 ${dark ? "border-white/10" : "border-slate-200"}`}>
            <div className="flex items-center gap-3"><div className={`rounded-xl p-2.5 ${dark ? "bg-white/10" : "bg-slate-100"}`}><Bot className="h-5 w-5" /></div><div><h2 className="font-semibold">Test bot</h2><p className={`text-xs ${muted}`}>Simulation · Deterministic responses</p></div></div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${dark ? "bg-amber-400/10 text-amber-200" : "bg-amber-50 text-amber-800"}`}>AI not connected</span>
          </div>
          <div ref={log} role="log" aria-label="Simulation conversation" aria-live="polite" className="h-[360px] space-y-4 overflow-y-auto p-4 sm:p-5">
            {locked ? <p className={muted}>Sign in again to use this owner-only test area.</p> : !ready ? <p className={muted}>Verifying owner session…</p> : state.messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 break-words ${message.role === "user" ? "bg-emerald-700 text-white" : dark ? "bg-white/7" : "bg-slate-100"}`}><p className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${message.role === "user" ? "text-emerald-100" : muted}`}>{message.role === "user" ? "You" : "Simulation"}</p>{message.text}</div></div>
            ))}
            {busy && <p className={`text-sm ${muted}`}>Running simulation…</p>}
          </div>
          <div className={`border-t p-4 sm:p-5 ${dark ? "border-white/10" : "border-slate-200"}`}>
            <div className="mb-4 flex flex-wrap gap-2">{["Create quote", "Accept quote", "Reject quote", "Create invoice", "Mark invoice paid", "Status"].map(command => <button key={command} type="button" disabled={disabled} onClick={() => void run(command)} className={secondary}>{command}</button>)}</div>
            <form onSubmit={submit} aria-label="Test bot message" className="flex items-end gap-2">
              <div className="min-w-0 flex-1"><label htmlFor="bot-test-message" className={`mb-2 block text-xs font-semibold ${muted}`}>Test message</label><input id="bot-test-message" value={input} onChange={event => setInput(event.target.value)} maxLength={1000} disabled={disabled} placeholder="Try: Create quote" autoComplete="off" className={`w-full rounded-xl border px-3 py-2.5 text-sm ${field}`} /></div>
              <button type="submit" disabled={disabled || !input.trim()} className="flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">Run</span><span className="sr-only sm:hidden">Run message</span></button>
            </form>
            {busy && <button type="button" onClick={() => { cancel(); setNotice("Simulation cancelled. Test records unchanged."); }} className={`${secondary} mt-3`}>Cancel simulation</button>}
            <p className={`mt-3 text-xs leading-5 ${muted}`}>Use test information only. No model provider is configured for this deployment. Replies here are simulated; no AI inference runs.</p>
          </div>
        </section>

        <div className="min-w-0 space-y-4">
          <section className={`rounded-2xl border p-5 ${panel}`} aria-label="Synthetic scenario">
            <h2 className="font-semibold">Synthetic scenario</h2>
            <label htmlFor="bot-test-scenario" className={`mb-2 mt-4 block text-xs font-semibold ${muted}`}>Example customer workflow</label>
            <select id="bot-test-scenario" value={state.scenarioId} onChange={event => reset(event.target.value as TestScenarioId)} disabled={disabled} className={`w-full rounded-xl border px-3 py-2.5 text-sm ${field}`}>{TEST_SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <p className={`mt-2 text-xs ${muted}`}>Changing the scenario starts a fresh test.</p>
            {!locked && <><p className="mt-5 text-sm font-semibold">{fixture.customer}</p><p className={`mt-1 text-sm ${muted}`}>{fixture.quantity} × {fixture.product}</p><div className="mt-4 flex items-center justify-between gap-3 text-sm"><span className={muted}>Example unit price</span><span>{money(fixture.unitPrice)}</span></div><div className="mt-2 flex items-center justify-between gap-3 border-t border-current/10 pt-3 font-semibold"><span>Test total</span><span>{money(fixture.quantity * fixture.unitPrice)}</span></div><p className={`mt-3 text-xs ${muted}`}>Synthetic flat prices, excluding tax. These are not your live catalog prices.</p></>}
          </section>
          <section className={`rounded-2xl border p-5 ${panel}`} aria-label="Synthetic records">
            <h2 className="flex items-center gap-2 font-semibold"><ReceiptText className="h-4 w-4" /> Test records</h2>
            <div className={`mt-4 space-y-3 text-sm ${locked ? "hidden" : ""}`}>
              <div className={`rounded-xl border p-4 ${dark ? "border-white/10" : "border-slate-200"}`}><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{state.quote === "none" ? "Test quote" : "TEST-Q001"}</span><span className="capitalize">{state.quote === "none" ? "Not created" : state.quote}</span></div><p className={`mt-2 text-xs ${muted}`}>Synthetic quote · Internal test only</p></div>
              <div className={`rounded-xl border p-4 ${dark ? "border-white/10" : "border-slate-200"}`}><div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{state.invoice === "none" ? "Test invoice" : "TEST-I001"}</span><span className="capitalize">{state.invoice === "none" ? "Not created" : `${state.invoice} (simulated)`}</span></div><p className={`mt-2 text-xs ${muted}`}>Synthetic invoice · No payment collected</p></div>
            </div>
            <p className={`mt-4 text-xs leading-5 ${muted}`}>Workflow: draft quote → accept → create invoice → simulate payment. Repeated actions keep one quote and one invoice. Reset test clears both.</p>
          </section>
        </div>
      </div>
      <p role="status" className={`mt-4 text-sm ${locked ? "text-amber-600" : muted}`}>{notice}</p>
    </main>
  );
}

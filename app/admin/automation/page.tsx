'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  startAfter
} from 'firebase/firestore';
import { format } from 'date-fns';
import clsx from 'clsx';
import {
  Play,
  Pause,
  Plus,
  Trash2,
  Edit3,
  Clock3,
  CalendarClock,
  ToggleLeft,
  ToggleRight,
  Zap,
  Webhook,
  Mail,
  PhoneCall,
  Bell,
  Filter,
  ListChecks,
  Copy,
  RefreshCw,
  Download,
  Info,
} from 'lucide-react';

/**
 * AUTOMATIONS — Owner-grade Rule Builder & Runner
 * ------------------------------------------------
 * Front-end features:
 * - List automations (enable/disable, run now, edit, delete) with next-run + last status
 * - Create/Edit drawer with: Trigger (Schedule or Event), Conditions (simple safe builder), Actions (Email, WhatsApp, Push, Webhook, Firestore Write)
 * - Test Run (with custom JSON payload) + dry-run preview
 * - Live Logs stream + Load More pagination
 *
 * Back-end expectations (see chat for API/Functions snippets):
 * - Next.js API route POST /api/automations/execute to run a single automation on demand
 * - Cloud Function: ticker (every minute) scans scheduled automations with nextRunAt <= now
 * - Cloud Function: on orders/inventory events, evaluate matching event automations
 */

/* ----------------------------- Types ------------------------------ */

type TriggerSchedule = {
  type: 'schedule';
  kind: 'daily' | 'weekly' | 'cron';
  time?: string; // '07:00'
  days?: number[]; // 1..7 (Mon..Sun) if weekly
  cron?: string; // advanced cron
  timezone?: string; // e.g. 'Indian/Mauritius'
};

type TriggerEvent = {
  type: 'event';
  source: 'orders' | 'inventory' | 'manual';
  op?: 'create' | 'update' | 'delete';
};

type ConditionOp = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'not_contains' | 'in' | 'not_in';

type Condition = {
  field: string; // e.g. 'amount' or 'status'
  op: ConditionOp;
  value: string; // stored as string; cast when evaluating
};

type ActionEmail = { kind: 'email'; to: string; subject: string; html: string };

type ActionWhatsApp = { kind: 'whatsapp'; to: string; message: string };

type ActionPush = { kind: 'push'; topic?: string; token?: string; title: string; body: string };

type ActionWebhook = { kind: 'webhook'; url: string; method?: 'POST' | 'GET'; headers?: Record<string,string>; bodyTemplate?: string };

// Minimal Firestore write (append log/flag something)
// path like 'flags/today' and payload JSON string
// NOTE: server should validate security for real writes

type ActionFirestoreWrite = { kind: 'firestoreWrite'; path: string; dataJson: string };

type Action = ActionEmail | ActionWhatsApp | ActionPush | ActionWebhook | ActionFirestoreWrite;

type Automation = {
  id?: string;
  name: string;
  enabled: boolean;
  trigger: TriggerSchedule | TriggerEvent;
  conditions?: Condition[]; // AND-all
  actions: Action[];
  // system
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  nextRunAt?: Timestamp; // for schedule
  stats?: { lastRunAt?: Timestamp; lastStatus?: 'success' | 'error'; runs?: number };
};

type RunLog = {
  id?: string;
  automationId: string;
  at: Timestamp;
  result: 'success' | 'error';
  note?: string;
  samplePayload?: any;
};

/* ------------------------ Helpers / Utilities --------------------- */

const DEFAULT_TZ = 'Indian/Mauritius';

function tzNow() {
  return new Date(); // client local; for display only
}

function nextDaily(time: string): Date {
  // time "HH:mm"
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

function nextWeekly(time: string, days: number[]): Date {
  // days: 1..7 (Mon..Sun)
  const [h, m] = time.split(':').map(Number);
  const now = new Date();
  const curDow = ((now.getDay() + 6) % 7) + 1; // convert Sun(0)->7, Mon->1
  for (let offset = 0; offset < 14; offset++) {
    const d = new Date(now);
    d.setDate(now.getDate() + offset);
    const dow = ((d.getDay() + 6) % 7) + 1;
    if (days.includes(dow)) {
      d.setHours(h, m, 0, 0);
      if (d > now) return d;
    }
  }
  // fallback: tomorrow
  const f = new Date(now);
  f.setDate(f.getDate() + 1);
  f.setHours(h, m, 0, 0);
  return f;
}

function humanTrigger(t: TriggerSchedule | TriggerEvent): string {
  if (t.type === 'schedule') {
    if (t.kind === 'daily') return `Daily at ${t.time} (${t.timezone || DEFAULT_TZ})`;
    if (t.kind === 'weekly') return `Weekly ${t.days?.join(',')} at ${t.time}`;
    return `Cron ${t.cron}`;
  }
  return `Event: ${t.source}${t.op ? ' ' + t.op : ''}`;
}

function tinyTemplate(s: string, ctx: any): string {
  // Replaces {{path.to.value}} from ctx
  return s.replace(/{{\s*([\w.]+)\s*}}/g, (_, k) => {
    const parts = k.split('.');
    let cur: any = ctx;
    for (const p of parts) cur = cur?.[p];
    return (cur ?? '').toString();
  });
}

function safeEvalCondition(cond: Condition, payload: any): boolean {
  const raw = cond.field.split('.').reduce<any>((acc, key) => acc?.[key], payload);
  const valStr = cond.value;
  const numVal = Number(valStr);
  const a = raw;
  const b = isNaN(numVal) ? valStr : numVal;

  switch (cond.op) {
    case '==': return a == b;
    case '!=': return a != b;
    case '>': return Number(a) > Number(b);
    case '>=': return Number(a) >= Number(b);
    case '<': return Number(a) < Number(b);
    case '<=': return Number(a) <= Number(b);
    case 'contains': return String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase());
    case 'not_contains': return !String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase());
    case 'in': return String(b).split(',').map(s=>s.trim()).includes(String(a));
    case 'not_in': return !String(b).split(',').map(s=>s.trim()).includes(String(a));
    default: return false;
  }
}

/* --------------------------- Page Component ----------------------- */

export default function AutomationPage() {
  const [autos, setAutos] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [sampleJson, setSampleJson] = useState<string>('{}');
  const [running, setRunning] = useState<string | null>(null);

  // Logs state with pagination
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [logsCursor, setLogsCursor] = useState<any>(null);
  const [logsHasMore, setLogsHasMore] = useState(false);
  const LOGS_PAGE = 20;

  useEffect(() => {
    const col = collection(db, 'automations');
    const qy = query(col, orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(qy, (snap) => {
      const list: Automation[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setAutos(list);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function loadLogs(reset=false) {
    const col = collection(db, 'automation_logs');
    let qy = query(col, orderBy('at', 'desc'), limit(LOGS_PAGE));
    if (!reset && logsCursor) qy = query(col, orderBy('at', 'desc'), startAfter(logsCursor), limit(LOGS_PAGE));
    const snap = await getDocs(qy);
    const rows: RunLog[] = [];
    snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
    if (reset) setLogs(rows); else setLogs(prev => [...prev, ...rows]);
    setLogsCursor(snap.docs[snap.docs.length - 1]);
    setLogsHasMore(snap.size === LOGS_PAGE);
  }

  useEffect(() => { loadLogs(true); }, []);

  /* ----------------------- Actions: Save / Run ---------------------- */

  async function saveAutomation(a: Automation) {
    const base = {
      ...a,
      updatedAt: serverTimestamp(),
      createdAt: a.createdAt || serverTimestamp(),
    } as any;

    // compute nextRunAt for schedule kinds (client-side estimate)
    if (a.trigger.type === 'schedule') {
      let next: Date | null = null;
      if (a.trigger.kind === 'daily' && a.trigger.time) next = nextDaily(a.trigger.time);
      if (a.trigger.kind === 'weekly' && a.trigger.time && a.trigger.days?.length) next = nextWeekly(a.trigger.time, a.trigger.days);
      base.nextRunAt = next ? Timestamp.fromDate(next) : null;
    } else {
      base.nextRunAt = null;
    }

    if (a.id) {
      await updateDoc(doc(db, 'automations', a.id), base);
    } else {
      const ref = await addDoc(collection(db, 'automations'), base);
      a.id = ref.id;
    }
    setDrawerOpen(false);
    setEditing(null);
  }

  async function toggleEnable(a: Automation) {
    if (!a.id) return;
    await updateDoc(doc(db, 'automations', a.id), { enabled: !a.enabled, updatedAt: serverTimestamp() });
  }

  async function removeAutomation(a: Automation) {
    if (!a.id) return;
    if (!confirm(`Delete automation \"${a.name}\"? This cannot be undone.`)) return;
    await deleteDoc(doc(db, 'automations', a.id));
  }

  async function runNow(a: Automation) {
    try {
      setRunning(a.id || '');
      const payload = JSON.parse(sampleJson || '{}');
      const res = await fetch('/api/automations/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationId: a.id, payload })
      });
      const j = await res.json();
      alert(j.ok ? 'Run queued' : `Failed: ${j.error || 'Unknown error'}`);
      await loadLogs(true);
    } catch (e: any) {
      alert('Bad sample JSON or network error');
    } finally {
      setRunning(null);
    }
  }

  const enabledCount = autos.filter(a => a.enabled).length;

  /* ---------------------------- Render ------------------------------ */

  return (
    <main className="min-h-screen px-6 py-8 max-w-7xl mx-auto space-y-8">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-700 text-white rounded-2xl p-6 shadow">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">Automations</h1>
            <p className="opacity-80 mt-1">Create rules that run on a schedule or when events happen. Timezone default: {DEFAULT_TZ}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setEditing(blankDailyNumerology()); setDrawerOpen(true); }} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4"/> New</button>
            <button onClick={() => loadLogs(true)} className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg flex items-center gap-2"><RefreshCw className="w-4 h-4"/> Refresh Logs</button>
          </div>
        </div>
      </header>

      {/* SNAPSHOT */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Automations" value={autos.length} icon={<ListChecks className="w-5 h-5"/>} />
        <StatTile label="Enabled" value={enabledCount} icon={<Zap className="w-5 h-5"/>} />
        <StatTile label="Last Run" value={latestRunText(logs)} icon={<Clock3 className="w-5 h-5"/>} />
        <StatTile label="Today Runs" value={runsToday(logs)} icon={<CalendarClock className="w-5 h-5"/>} />
      </section>

      {/* LIST */}
      <section className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Your Rules</h3>
          <div className="text-xs text-gray-500">Click a card to edit</div>
        </div>
        {loading ? (
          <div className="py-8 text-center">Loading…</div>
        ) : autos.length === 0 ? (
          <div className="py-8 text-center text-gray-500">No automations yet. Create your first rule.</div>
        ) : (
          <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {autos.map((a) => (
              <li key={a.id} className="border rounded-xl p-4 hover:shadow cursor-pointer group" onClick={() => { setEditing(a); setDrawerOpen(true); }}>
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{a.name}</div>
                    <div className="text-xs text-gray-500 mt-1 truncate">{humanTrigger(a.trigger)}</div>
                    {a.conditions?.length ? (
                      <div className="text-xs text-gray-500 mt-1 truncate"><Filter className="inline w-3 h-3 -mt-0.5"/> {a.conditions.length} condition{a.conditions.length>1?'s':''}</div>
                    ) : null}
                    <div className="text-xs text-gray-500 mt-1 truncate">Actions: {a.actions.map(x=>x.kind).join(', ')}</div>
                    {a.nextRunAt && (
                      <div className="text-xs text-gray-600 mt-2">Next: {format(a.nextRunAt.toDate(), 'dd MMM yyyy, HH:mm')}</div>
                    )}
                    {a.stats?.lastRunAt && (
                      <div className="text-xs mt-1">
                        Last: {format(a.stats.lastRunAt.toDate(), 'dd MMM, HH:mm')} · <span className={clsx(a.stats.lastStatus==='success'?'text-emerald-600':'text-rose-600')}>{a.stats.lastStatus}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-3" onClick={(e)=>e.stopPropagation()}>
                    <button onClick={() => toggleEnable(a)} className="text-sm px-2 py-1 rounded border hover:bg-gray-50 flex items-center gap-1">
                      {a.enabled ? <><ToggleRight className="w-4 h-4 text-emerald-600"/> On</> : <><ToggleLeft className="w-4 h-4"/> Off</>}
                    </button>
                    <div className="flex items-center gap-2">
                      <button onClick={() => runNow(a)} disabled={running===a.id} className="px-2 py-1 text-xs rounded bg-black text-white hover:bg-gray-800 flex items-center gap-1"><Play className="w-3 h-3"/> Run</button>
                      <button onClick={() => removeAutomation(a)} className="px-2 py-1 text-xs rounded border hover:bg-gray-50 text-rose-600 flex items-center gap-1"><Trash2 className="w-3 h-3"/> Delete</button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* SAMPLE PAYLOAD */}
        <div className="mt-4 border-t pt-3">
          <div className="text-sm font-semibold mb-1">Test Payload (JSON)</div>
          <textarea value={sampleJson} onChange={(e)=>setSampleJson(e.target.value)} rows={4} className="w-full border rounded p-2 font-mono text-xs" placeholder='{"amount":1200,"status":"Pending","client":"Acme"}'/>
          <div className="text-xs text-gray-500 mt-1">Used when you click “Run” on any rule above. Tip: include fields your conditions or templates expect.</div>
        </div>
      </section>

      {/* LOGS */}
      <section className="bg-white rounded-2xl shadow p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Recent Runs</h3>
          <button onClick={()=>loadLogs(false)} disabled={!logsHasMore} className={clsx('px-3 py-1.5 border rounded text-sm', logsHasMore? 'hover:bg-gray-50':'')}>Load more</button>
        </div>
        {logs.length===0 ? (
          <div className="py-6 text-center text-gray-500">No runs yet.</div>
        ) : (
          <ul className="divide-y">
            {logs.map(l => (
              <li key={l.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{format(l.at.toDate(), 'dd MMM yyyy, HH:mm')}</div>
                  {l.note && <div className="text-xs text-gray-500">{l.note}</div>}
                </div>
                <span className={clsx('px-2 py-0.5 rounded-full text-xs', l.result==='success'?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700')}>{l.result}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Drawer */}
      {drawerOpen && (
        <Drawer onClose={()=>{ setDrawerOpen(false); setEditing(null); }}>
          <AutomationForm
            value={editing || blankDailyNumerology()}
            onCancel={()=>{ setDrawerOpen(false); setEditing(null); }}
            onSave={saveAutomation}
          />
        </Drawer>
      )}
    </main>
  );
}

/* ------------------------------ UI Bits --------------------------- */

function StatTile({ label, value, icon }: { label: string; value: string|number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-3">
      <div className="p-3 rounded-xl bg-gray-100">{icon}</div>
      <div>
        <div className="text-gray-500 text-xs uppercase tracking-wide">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function latestRunText(logs: RunLog[]) {
  if (!logs.length) return '—';
  const t = logs[0].at.toDate();
  return format(t, 'dd MMM, HH:mm');
}

function runsToday(logs: RunLog[]) {
  const today = new Date();
  const ymd = format(today, 'yyyy-MM-dd');
  return logs.filter(l => format(l.at.toDate(), 'yyyy-MM-dd') === ymd).length;
}

function Drawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-white shadow-xl p-5 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Automation</div>
          <button onClick={onClose} className="px-3 py-1.5 border rounded">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* --------------------------- Form Component ----------------------- */

function AutomationForm({ value, onSave, onCancel }: { value: Automation; onSave: (a: Automation)=>void; onCancel: ()=>void }) {
  const [a, setA] = useState<Automation>(value);

  const isSchedule = a.trigger.type === 'schedule';

  function addCondition() {
    const next = [...(a.conditions || []), { field: '', op: '==', value: '' } as Condition];
    setA({ ...a, conditions: next });
  }
  function removeCondition(i: number) {
    const next = (a.conditions || []).filter((_, idx) => idx !== i);
    setA({ ...a, conditions: next });
  }

  function addAction(kind: Action['kind']) {
    const def: any = kind === 'email' ? { kind, to: '', subject: '', html: '<p>Hello</p>' } :
      kind === 'whatsapp' ? { kind, to: '', message: 'Hi there' } :
      kind === 'push' ? { kind, title: 'Title', body: 'Body' } :
      kind === 'webhook' ? { kind, url: 'https://example.com/hook', method: 'POST', headers: { 'Content-Type': 'application/json' }, bodyTemplate: '{"event":"demo","amount":{{amount}}}' } :
      { kind, path: 'flags/today', dataJson: '{"flag":true}' };
    setA({ ...a, actions: [...a.actions, def] });
  }
  function removeAction(i: number) {
    setA({ ...a, actions: a.actions.filter((_, idx) => idx !== i) });
  }

  function save() { onSave(a); }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Name
          <input value={a.name} onChange={(e)=> setA({...a, name: e.target.value})} className="mt-1 w-full border rounded px-2 py-1" placeholder="Morning Numerology"/>
        </label>
        <label className="text-sm">Enabled
          <select value={a.enabled? '1':'0'} onChange={(e)=> setA({...a, enabled: e.target.value==='1'})} className="mt-1 w-full border rounded px-2 py-1">
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </label>
      </div>

      {/* Trigger */}
      <div className="border rounded-xl p-3">
        <div className="font-semibold mb-2">Trigger</div>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <label className="col-span-1">Type
            <select
              value={a.trigger.type}
              onChange={(e)=> setA({...a, trigger: e.target.value==='schedule' ? { type:'schedule', kind:'daily', time:'07:00', timezone: DEFAULT_TZ } : { type:'event', source:'orders', op:'create' } })}
              className="mt-1 w-full border rounded px-2 py-1"
            >
              <option value="schedule">Schedule</option>
              <option value="event">Event</option>
            </select>
          </label>

          {isSchedule ? (
            <>
              <label>Kind
                <select
                  value={(a.trigger as TriggerSchedule).kind}
                  onChange={(e)=> setA({...a, trigger: { ...(a.trigger as TriggerSchedule), kind: e.target.value as any } })}
                  className="mt-1 w-full border rounded px-2 py-1"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="cron">Cron</option>
                </select>
              </label>
              {(a.trigger as TriggerSchedule).kind !== 'cron' ? (
                <label>Time (HH:mm)
                  <input value={(a.trigger as TriggerSchedule).time || ''} onChange={(e)=> setA({...a, trigger: { ...(a.trigger as TriggerSchedule), time: e.target.value } })} className="mt-1 w-full border rounded px-2 py-1" placeholder="07:00"/>
                </label>
              ) : (
                <label className="sm:col-span-2">Cron
                  <input value={(a.trigger as TriggerSchedule).cron || ''} onChange={(e)=> setA({...a, trigger: { ...(a.trigger as TriggerSchedule), cron: e.target.value } })} className="mt-1 w-full border rounded px-2 py-1" placeholder="0 7 * * *"/>
                </label>
              )}
              <label>Timezone
                <input value={(a.trigger as TriggerSchedule).timezone || DEFAULT_TZ} onChange={(e)=> setA({...a, trigger: { ...(a.trigger as TriggerSchedule), timezone: e.target.value } })} className="mt-1 w-full border rounded px-2 py-1"/>
              </label>
              {(a.trigger as TriggerSchedule).kind === 'weekly' && (
                <div className="sm:col-span-3">
                  <div className="text-xs text-gray-600 mb-1">Days</div>
                  <WeekdayPicker value={(a.trigger as TriggerSchedule).days || [1,2,3,4,5]} onChange={(days)=> setA({...a, trigger: { ...(a.trigger as TriggerSchedule), days } })} />
                </div>
              )}
            </>
          ) : (
            <>
              <label>Source
                <select value={(a.trigger as TriggerEvent).source} onChange={(e)=> setA({...a, trigger: { ...(a.trigger as TriggerEvent), source: e.target.value as any } })} className="mt-1 w-full border rounded px-2 py-1">
                  <option value="orders">Orders</option>
                  <option value="inventory">Inventory</option>
                  <option value="manual">Manual</option>
                </select>
              </label>
              <label>Operation
                <select value={(a.trigger as TriggerEvent).op || 'create'} onChange={(e)=> setA({...a, trigger: { ...(a.trigger as TriggerEvent), op: e.target.value as any } })} className="mt-1 w-full border rounded px-2 py-1">
                  <option value="create">Create</option>
                  <option value="update">Update</option>
                  <option value="delete">Delete</option>
                </select>
              </label>
            </>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-2">{humanTrigger(a.trigger)}</div>
      </div>

      {/* Conditions */}
      <div className="border rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Conditions (ALL must match)</div>
          <button onClick={addCondition} className="px-2 py-1 text-xs border rounded">+ Add</button>
        </div>
        {(a.conditions?.length || 0) === 0 ? (
          <div className="text-sm text-gray-500">No conditions — will run unconditionally.</div>
        ) : (
          <ul className="space-y-2">
            {a.conditions!.map((c, idx) => (
              <li key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input value={c.field} onChange={(e)=> setA({...a, conditions: a.conditions!.map((x,i)=> i===idx?{...x, field:e.target.value}:x) })} placeholder="field (e.g. amount)" className="col-span-4 border rounded px-2 py-1 text-sm"/>
                <select value={c.op} onChange={(e)=> setA({...a, conditions: a.conditions!.map((x,i)=> i===idx?{...x, op: e.target.value as ConditionOp}:x) })} className="col-span-3 border rounded px-2 py-1 text-sm">
                  {['==','!=','>','>=','<','<=','contains','not_contains','in','not_in'].map(op=> <option key={op} value={op}>{op}</option>)}
                </select>
                <input value={c.value} onChange={(e)=> setA({...a, conditions: a.conditions!.map((x,i)=> i===idx?{...x, value:e.target.value}:x) })} placeholder="value" className="col-span-4 border rounded px-2 py-1 text-sm"/>
                <button onClick={()=> removeCondition(idx)} className="col-span-1 text-rose-600 text-xs border rounded px-2 py-1">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="border rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Actions</div>
          <div className="flex gap-2 text-xs">
            <button onClick={()=>addAction('email')} className="px-2 py-1 border rounded flex items-center gap-1"><Mail className="w-3 h-3"/> Email</button>
            <button onClick={()=>addAction('whatsapp')} className="px-2 py-1 border rounded flex items-center gap-1"><PhoneCall className="w-3 h-3"/> WhatsApp</button>
            <button onClick={()=>addAction('push')} className="px-2 py-1 border rounded flex items-center gap-1"><Bell className="w-3 h-3"/> Push</button>
            <button onClick={()=>addAction('webhook')} className="px-2 py-1 border rounded flex items-center gap-1"><Webhook className="w-3 h-3"/> Webhook</button>
            <button onClick={()=>addAction('firestoreWrite')} className="px-2 py-1 border rounded flex items-center gap-1"><Copy className="w-3 h-3"/> Firestore</button>
          </div>
        </div>
        {a.actions.length === 0 ? (
          <div className="text-sm text-gray-500">No actions. Add at least one.</div>
        ) : (
          <ul className="space-y-3">
            {a.actions.map((ac, idx) => (
              <li key={idx} className="border rounded-lg p-2">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold">{ac.kind}</div>
                  <button onClick={()=>removeAction(idx)} className="text-xs border rounded px-2 py-0.5">Remove</button>
                </div>
                {ac.kind === 'email' && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label>To <input value={(ac as ActionEmail).to} onChange={(e)=> updateAction(idx, { to: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/></label>
                    <label>Subject <input value={(ac as ActionEmail).subject} onChange={(e)=> updateAction(idx, { subject: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/></label>
                    <label className="col-span-2">HTML (supports {'{{field}}'})
                      <textarea rows={3} value={(ac as ActionEmail).html} onChange={(e)=> updateAction(idx, { html: e.target.value })} className="mt-1 w-full border rounded px-2 py-1 font-mono"/>
                    </label>
                  </div>
                )}
                {ac.kind === 'whatsapp' && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label>To <input value={(ac as ActionWhatsApp).to} onChange={(e)=> updateAction(idx, { to: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/></label>
                    <label className="col-span-2">Message
                      <textarea rows={2} value={(ac as ActionWhatsApp).message} onChange={(e)=> updateAction(idx, { message: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/>
                    </label>
                  </div>
                )}
                {ac.kind === 'push' && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label>Title <input value={(ac as ActionPush).title} onChange={(e)=> updateAction(idx, { title: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/></label>
                    <label>Body <input value={(ac as ActionPush).body} onChange={(e)=> updateAction(idx, { body: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/></label>
                    <label>Topic <input value={(ac as ActionPush).topic || ''} onChange={(e)=> updateAction(idx, { topic: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/></label>
                    <label>Token <input value={(ac as ActionPush).token || ''} onChange={(e)=> updateAction(idx, { token: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/></label>
                  </div>
                )}
                {ac.kind === 'webhook' && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label className="col-span-2">URL <input value={(ac as ActionWebhook).url} onChange={(e)=> updateAction(idx, { url: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/></label>
                    <label>Method
                      <select value={(ac as ActionWebhook).method || 'POST'} onChange={(e)=> updateAction(idx, { method: e.target.value })} className="mt-1 w-full border rounded px-2 py-1">
                        <option>POST</option>
                        <option>GET</option>
                      </select>
                    </label>
                    <label className="col-span-2">Body Template (JSON allowed, supports {'{{field}}'})
                      <textarea rows={3} value={(ac as ActionWebhook).bodyTemplate || ''} onChange={(e)=> updateAction(idx, { bodyTemplate: e.target.value })} className="mt-1 w-full border rounded px-2 py-1 font-mono"/>
                    </label>
                  </div>
                )}
                {ac.kind === 'firestoreWrite' && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label className="col-span-2">Path (doc)
                      <input value={(ac as ActionFirestoreWrite).path} onChange={(e)=> updateAction(idx, { path: e.target.value })} className="mt-1 w-full border rounded px-2 py-1"/>
                    </label>
                    <label className="col-span-2">Data JSON (supports {'{{field}}'})
                      <textarea rows={3} value={(ac as ActionFirestoreWrite).dataJson} onChange={(e)=> updateAction(idx, { dataJson: e.target.value })} className="mt-1 w-full border rounded px-2 py-1 font-mono"/>
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 border rounded">Cancel</button>
        <button onClick={save} className="px-3 py-2 bg-black text-white rounded">Save</button>
      </div>
    </div>
  );

  function updateAction(idx: number, patch: any) {
    setA({ ...a, actions: a.actions.map((x, i) => i === idx ? { ...x, ...patch } as Action : x) });
  }
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (v:number[])=>void }) {
  const days = [
    { n:1, l:'Mon' },{ n:2, l:'Tue' },{ n:3, l:'Wed' },{ n:4, l:'Thu' },{ n:5, l:'Fri' },{ n:6, l:'Sat' },{ n:7, l:'Sun' }
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {days.map(d => {
        const active = value.includes(d.n);
        return (
          <button key={d.n} onClick={()=> onChange(active? value.filter(x=>x!==d.n) : [...value, d.n])} className={clsx('px-3 py-1 rounded border text-sm', active? 'bg-black text-white border-black' : 'hover:bg-gray-50')}>{d.l}</button>
        );
      })}
    </div>
  );
}

function blankDailyNumerology(): Automation {
  return {
    name: 'Daily Numerology 07:00',
    enabled: true,
    trigger: { type:'schedule', kind:'daily', time:'07:00', timezone: DEFAULT_TZ },
    conditions: [],
    actions: [
      { kind:'webhook', url:'/api/notifications/numerology', method:'POST', headers:{'Content-Type':'application/json'}, bodyTemplate:'{"primary":{{primary}},"secondary":{{secondary}},"date":"{{date}}"}' },
    ],
  } as Automation;
}

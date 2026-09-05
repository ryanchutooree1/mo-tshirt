'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MauritiusLocationPicker } from '@/components/admin/MauritiusClientMap';
import {
  MAURITIUS_DISTRICTS,
  type ClientLocation,
  type MauritiusDistrict,
  normalizeClientLocation,
  resolveClientLocation,
  serializeClientLocation,
} from '@/lib/client-location';
import { db } from '@/lib/firebase';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  FiAlertTriangle,
  FiDownload,
  FiEdit2,
  FiMail,
  FiMapPin,
  FiPhone,
  FiPlus,
  FiSearch,
  FiShield,
  FiStar,
  FiTag,
  FiTrash2,
  FiUsers,
} from 'react-icons/fi';

// ---------- Types ----------
type FirestoreDateLike = { toDate?: () => Date } | Date | string | number | null;

type Client = {
  id: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  starRating?: number; // 1..5
  createdAt?: FirestoreDateLike;
  tags?: string[];
  location?: ClientLocation | null;
};

type ClientDraft = Omit<Client, 'createdAt' | 'id'> & { id?: string };
type LocationFilter = MauritiusDistrict | 'all' | 'unlocated';

const DELETE_CODE = process.env.NEXT_PUBLIC_DELETE_CODE || 'DELETE';

// ---------- Utils ----------
const cleanPhone = (p?: string) => (p || '').replace(/[^\d]/g, '');
const waLink = (p?: string, text?: string) =>
  p ? `https://wa.me/${cleanPhone(p)}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '#';
const telLink = (p?: string) => (p ? `tel:${cleanPhone(p)}` : '#');
const emailLink = (e?: string) => (e ? `mailto:${e}` : '#');
const fmtDate = (d?: Date) => (d ? d.toLocaleDateString() : '');
const toDateValue = (value?: FirestoreDateLike) => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return undefined;
};
const createEmptyClient = (): ClientDraft => ({
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  customerAddress: '',
  starRating: 3,
  tags: [],
  location: null,
});

// ---------- Page ----------
export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [minStars, setMinStars] = useState<number | 'all'>('all');
  const [hasPhoneOnly, setHasPhoneOnly] = useState(false);
  const [hasEmailOnly, setHasEmailOnly] = useState(false);
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');

  // Modal states
  const [editing, setEditing] = useState<ClientDraft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  // Live data
  useEffect(() => {
    const qy = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(qy, (snap) => {
      const list: Client[] = snap.docs.map((d) => {
        const data = d.data() as Partial<Client> & { location?: unknown };
        return {
          id: d.id,
          customerName: data.customerName || '',
          customerEmail: data.customerEmail || '',
          customerPhone: data.customerPhone || '',
          customerAddress: data.customerAddress || '',
          starRating: data.starRating || 1,
          createdAt: data.createdAt,
          tags: data.tags || [],
          location: normalizeClientLocation(data.location),
        };
      });
      setClients(list);
    });
    return () => unsub();
  }, []);

  // Duplicate detection (by phone/email)
  const dupByPhone = useMemo(() => {
    const map = new Map<string, number>();
    clients.forEach((c) => {
      const k = cleanPhone(c.customerPhone);
      if (k) map.set(k, (map.get(k) || 0) + 1);
    });
    return map;
  }, [clients]);

  const dupByEmail = useMemo(() => {
    const map = new Map<string, number>();
    clients.forEach((c) => {
      const k = (c.customerEmail || '').toLowerCase().trim();
      if (k) map.set(k, (map.get(k) || 0) + 1);
    });
    return map;
  }, [clients]);

  const resolvedById = useMemo(
    () =>
      new Map(
        clients.map((client) => [client.id, resolveClientLocation(client)] as const)
      ),
    [clients]
  );

  // Filters + search
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      const location = resolvedById.get(c.id);
      if (q) {
        const blob = [
          c.customerName,
          c.customerEmail,
          c.customerPhone,
          c.customerAddress,
          c.location?.notes,
          location?.district,
          location?.hotspotLabel,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (minStars !== 'all' && (c.starRating || 1) < minStars) return false;
      if (hasPhoneOnly && !cleanPhone(c.customerPhone)) return false;
      if (hasEmailOnly && !(c.customerEmail || '').trim()) return false;
      return true;
    });
  }, [clients, hasEmailOnly, hasPhoneOnly, minStars, resolvedById, search]);

  const filtered = useMemo(() => {
    if (locationFilter === 'all') return baseFiltered;
    return baseFiltered.filter((client) => {
      const location = resolvedById.get(client.id);
      if (locationFilter === 'unlocated') return !location;
      return location?.district === locationFilter;
    });
  }, [baseFiltered, locationFilter, resolvedById]);

  // Quick stats
  const stats = useMemo(() => {
    const total = clients.length;
    const vip = clients.filter((c) => (c.starRating || 1) >= 4).length;
    const withPhone = clients.filter((c) => cleanPhone(c.customerPhone)).length;
    const mapped = clients.filter((c) => resolvedById.get(c.id)).length;
    const last7 = clients.filter((c) => {
      const dt = toDateValue(c.createdAt);
      if (!dt) return false;
      const diff = (Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    }).length;
    return { total, vip, withPhone, mapped, last7 };
  }, [clients, resolvedById]);

  // CSV export (filtered)
  const exportCSV = () => {
    const rows: string[] = [
      ['Name', 'Email', 'Phone', 'Address', 'District', 'Hotspot', 'Pin Notes', 'Pin Source', 'Stars', 'Created At', 'Tags'].join(','),
    ];
    filtered.forEach((c) => {
      const d = toDateValue(c.createdAt);
      const location = resolvedById.get(c.id);
      rows.push(
        [
          csv(c.customerName),
          csv(c.customerEmail || ''),
          csv(c.customerPhone || ''),
          csv(c.customerAddress || ''),
          csv(location?.district || ''),
          csv(location?.hotspotLabel || ''),
          csv(c.location?.notes || ''),
          csv(location?.source || ''),
          String(c.starRating || 1),
          csv(d ? d.toISOString() : ''),
          csv((c.tags || []).join('|')),
        ].join(',')
      );
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'clients_export.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };
  const csv = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

  // Mutations
  const saveClient = async (payload: ClientDraft) => {
    const base = {
      customerName: payload.customerName.trim(),
      customerEmail: (payload.customerEmail || '').trim(),
      customerPhone: cleanPhone(payload.customerPhone),
      customerAddress: (payload.customerAddress || '').trim(),
      starRating: payload.starRating || 1,
      tags: payload.tags || [],
      location: serializeClientLocation(payload.location),
    };

    if (!payload.id) {
      const ref = await addDoc(collection(db, 'customers'), {
        ...base,
        createdAt: serverTimestamp(),
      });
      await updateDoc(ref, { id: ref.id });
    } else {
      await updateDoc(doc(db, 'customers', payload.id), base);
    }
    setEditing(null);
  };

  const doDelete = async (id: string) => {
    await deleteDoc(doc(db, 'customers', id));
    setConfirmDelete(null);
  };

  const togglePill = (active: boolean, activeClass: string) =>
    `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
      active
        ? activeClass
        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
    }`;

  return (
    <main className="relative min-h-screen bg-white">
      <div className="relative mx-auto max-w-7xl space-y-6 px-6 py-8">
        {/* Hero */}
        <section
          className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
          style={{ animation: 'fadeUp 0.6s ease-out both' }}
        >
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                Clients
              </p>
              <h1 className="mt-3 text-3xl font-semibold text-slate-900 sm:text-4xl">
                Clients (CRM)
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 sm:text-base">
                Keep your best customers close with VIP tagging, clean data, live Mauritius pinning, and a market heatmap that shows where to push harder next.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  <FiUsers className="h-4 w-4" /> Smart CRM
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  <FiShield className="h-4 w-4" /> Duplicate checks
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  <FiStar className="h-4 w-4" /> VIP prioritization
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={exportCSV}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <FiDownload className="h-4 w-4" /> Export CSV
              </button>
              <button
                onClick={() => setEditing(createEmptyClient())}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <FiPlus className="h-4 w-4" /> Add Client
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section
          className="grid grid-cols-2 gap-4 md:grid-cols-5"
          style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.08s' }}
        >
          <StatCard label="Total Clients" value={stats.total} tone="sky" icon={<FiUsers className="h-4 w-4" />} />
          <StatCard label="VIP (4+ stars)" value={stats.vip} tone="amber" icon={<FiStar className="h-4 w-4" />} />
          <StatCard label="With Phone" value={stats.withPhone} tone="emerald" icon={<FiPhone className="h-4 w-4" />} />
          <StatCard label="Pinned on Map" value={stats.mapped} tone="rose" icon={<FiMapPin className="h-4 w-4" />} />
          <StatCard label="New (7d)" value={stats.last7} tone="slate" icon={<FiTag className="h-4 w-4" />} />
        </section>

        {/* Filters */}
        <section
          className="sticky top-20 z-10 rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-sm backdrop-blur"
          style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.14s' }}
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="relative">
              <FiSearch className="absolute left-3 top-2.5 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, phone, email…"
                className="w-full rounded-full border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100 sm:w-72"
              />
            </div>
            <select
              value={minStars}
              onChange={(e) => setMinStars(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
            >
              <option value="all">All stars</option>
              <option value={1}>★ 1+</option>
              <option value={2}>★ 2+</option>
              <option value={3}>★ 3+</option>
              <option value={4}>★ 4+</option>
              <option value={5}>★ 5 only</option>
            </select>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter((e.target.value || 'all') as LocationFilter)}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
            >
              <option value="all">All Mauritius</option>
              <option value="unlocated">Unpinned only</option>
              {MAURITIUS_DISTRICTS.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={hasPhoneOnly}
              onClick={() => setHasPhoneOnly((v) => !v)}
              className={togglePill(hasPhoneOnly, 'border-slate-900 bg-slate-900 text-white')}
            >
              <FiPhone className="h-4 w-4" /> Has phone
            </button>
            <button
              type="button"
              aria-pressed={hasEmailOnly}
              onClick={() => setHasEmailOnly((v) => !v)}
              className={togglePill(hasEmailOnly, 'border-slate-900 bg-slate-900 text-white')}
            >
              <FiMail className="h-4 w-4" /> Has email
            </button>
            <div className="ml-auto text-xs font-semibold text-slate-500">
              Showing {filtered.length} of {clients.length} clients
            </div>
          </div>
        </section>

        {/* Clients grid */}
        <section
          className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
          style={{ animation: 'fadeUp 0.6s ease-out both', animationDelay: '0.2s' }}
        >
          {filtered.map((c) => {
            const phoneDup = !!cleanPhone(c.customerPhone) && (dupByPhone.get(cleanPhone(c.customerPhone)) || 0) > 1;
            const emailDup = !!(c.customerEmail || '').trim() && (dupByEmail.get((c.customerEmail || '').toLowerCase()) || 0) > 1;
            const location = resolvedById.get(c.id);

            return (
              <div key={c.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
                {/* Header */}
                <div className="border-b border-slate-100/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={c.customerName} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-base font-semibold text-slate-900">{c.customerName}</div>
                          {(c.starRating || 1) >= 4 && (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-700">
                              VIP
                            </span>
                          )}
                          {(phoneDup || emailDup) && (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-700">
                              Duplicate
                            </span>
                          )}
                          {location && (
                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-700">
                              {location.hotspotLabel}
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          <Stars
                            value={c.starRating || 1}
                            onChange={(v) => saveClient({ ...c, starRating: v })}
                          />
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Added: {fmtDate(toDateValue(c.createdAt))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                        onClick={() => setEditing(c)}
                      >
                        <FiEdit2 className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-1 text-xs font-semibold text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-50"
                        onClick={() => setConfirmDelete({ id: c.id, name: c.customerName })}
                      >
                        <FiTrash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="space-y-3 p-4 text-sm">
                  <Row label="Phone" icon={<FiPhone className="h-4 w-4 text-slate-400" />}>
                    {c.customerPhone ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <a className="text-sky-600 font-semibold hover:underline" href={telLink(c.customerPhone)}>
                          {c.customerPhone}
                        </a>
                        <a className="text-emerald-600 font-semibold hover:underline" href={waLink(c.customerPhone, `Hello ${c.customerName}!`)}>
                          WhatsApp
                        </a>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Row>
                  <Row label="Email" icon={<FiMail className="h-4 w-4 text-slate-400" />}>
                    {c.customerEmail ? (
                      <a className="text-sky-600 font-semibold hover:underline" href={emailLink(c.customerEmail)}>
                        {c.customerEmail}
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Row>
                  <Row label="Address" icon={<FiMapPin className="h-4 w-4 text-slate-400" />}>
                    {c.customerAddress ? c.customerAddress : <span className="text-slate-400">—</span>}
                  </Row>
                  <Row label="Zone" icon={<FiMapPin className="h-4 w-4 text-fuchsia-400" />}>
                    {location ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                          {location.hotspotLabel}
                        </span>
                        <span className="text-xs text-slate-500">{location.district}</span>
                        {location.inferred && (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                            Auto
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">No pin yet</span>
                    )}
                  </Row>
                  {c.location?.notes && (
                    <Row label="Pin note" icon={<FiTag className="h-4 w-4 text-slate-400" />}>
                      {c.location.notes}
                    </Row>
                  )}
                  {c.tags && c.tags.length > 0 && (
                    <Row label="Tags" icon={<FiTag className="h-4 w-4 text-slate-400" />}>
                      <div className="flex flex-wrap gap-2">
                        {c.tags.map((t, i) => (
                          <span key={i} className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-700">
                            {t}
                          </span>
                        ))}
                      </div>
                    </Row>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {filtered.length === 0 && (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 p-10 text-center text-slate-500">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <FiAlertTriangle className="h-5 w-5" />
            </div>
            <div className="mt-3 text-base font-semibold text-slate-700">No clients match your filters.</div>
            <p className="mt-1 text-sm text-slate-500">Try clearing filters or add a new client.</p>
            <button
              onClick={() => setEditing(createEmptyClient())}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <FiPlus className="h-4 w-4" /> Add Client
            </button>
          </div>
        )}

        {/* Modals */}
        {editing && (
          <ClientModal
            initial={editing}
            onCancel={() => setEditing(null)}
            onSave={saveClient}
          />
        )}

        {confirmDelete && (
          <ConfirmDeleteModal
            name={confirmDelete.name}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={(code) => {
              if (code === DELETE_CODE) {
                doDelete(confirmDelete.id);
              }
            }}
            required={DELETE_CODE}
          />
        )}
        <style jsx>{`
          @keyframes fadeUp {
            from {
              opacity: 0;
              transform: translateY(14px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </main>
  );
}

// ---------- UI Bits ----------
function StatCard({
  label,
  value,
  tone = 'slate',
  icon,
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'sky' | 'emerald' | 'amber' | 'rose';
  icon?: ReactNode;
}) {
  const tones = {
    slate: {
      border: 'border-slate-200',
      bg: 'from-white via-white to-white',
      accent: 'border border-slate-200 bg-white text-slate-700',
      glow: 'bg-transparent',
      value: 'text-slate-900',
    },
    sky: {
      border: 'border-slate-200',
      bg: 'from-white via-white to-white',
      accent: 'border border-slate-200 bg-white text-slate-700',
      glow: 'bg-transparent',
      value: 'text-slate-900',
    },
    emerald: {
      border: 'border-slate-200',
      bg: 'from-white via-white to-white',
      accent: 'border border-slate-200 bg-white text-slate-700',
      glow: 'bg-transparent',
      value: 'text-slate-900',
    },
    amber: {
      border: 'border-slate-200',
      bg: 'from-white via-white to-white',
      accent: 'border border-slate-200 bg-white text-slate-700',
      glow: 'bg-transparent',
      value: 'text-slate-900',
    },
    rose: {
      border: 'border-slate-200',
      bg: 'from-white via-white to-white',
      accent: 'border border-slate-200 bg-white text-slate-700',
      glow: 'bg-transparent',
      value: 'text-slate-900',
    },
  } as const;
  const theme = tones[tone] ?? tones.slate;

  return (
    <div className={`relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {label}
        </div>
        {icon && (
          <span className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.accent}`}>
            {icon}
          </span>
        )}
      </div>
      <div className={`mt-3 text-2xl font-semibold ${theme.value}`}>{value.toLocaleString()}</div>
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full blur-2xl ${theme.glow}`}
      />
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="h-12 w-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold shadow-sm">
      {initials || 'U'}
    </div>
  );
}

function Row({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex w-24 items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-[0.16em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex-1 text-slate-700">{children}</div>
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          onClick={() => onChange(i)}
          aria-label={`Set ${i} star${i > 1 ? 's' : ''}`}
          className={`text-lg transition ${i <= value ? 'text-slate-700' : 'text-slate-300 hover:text-slate-500'}`}
          title={`${i} star${i > 1 ? 's' : ''}`}
        >
          {i <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}

// ---------- Client Add/Edit Modal ----------
function ClientModal({
  initial,
  onCancel,
  onSave,
}: {
  initial: ClientDraft;
  onCancel: () => void;
  onSave: (payload: ClientDraft) => void;
}) {
  const [name, setName] = useState(initial.customerName || '');
  const [email, setEmail] = useState(initial.customerEmail || '');
  const [phone, setPhone] = useState(initial.customerPhone || '');
  const [address, setAddress] = useState(initial.customerAddress || '');
  const [stars, setStars] = useState(initial.starRating || 3);
  const [tags, setTags] = useState<string>((initial.tags || []).join(', '));
  const [location, setLocation] = useState<ClientLocation | null>(initial.location || null);
  const isEdit = Boolean(initial.id);

  return (
    <Modal title={isEdit ? 'Edit Client' : 'Add Client'} onClose={onCancel}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-semibold text-slate-600">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-600">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-600">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-600">Address</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </label>

        <div>
          <span className="text-sm font-semibold text-slate-600">Star rating</span>
          <div>
            <Stars value={stars} onChange={setStars} />
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-slate-600">Tags (comma separated)</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="vip, school, company"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
        </label>

        <div className="pt-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-600">Mauritius pin location</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              Dynamic map
            </span>
          </div>
          <MauritiusLocationPicker value={location} address={address} onChange={setLocation} />
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              id: initial.id || undefined,
              customerName: name,
              customerEmail: email,
              customerPhone: phone,
              customerAddress: address,
              starRating: stars,
              location,
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        >
          {isEdit ? 'Update' : 'Add'}
        </button>
      </div>
    </Modal>
  );
}

// ---------- Confirm Delete Modal ----------
function ConfirmDeleteModal({
  name,
  required,
  onCancel,
  onConfirm,
}: {
  name: string;
  required: string;
  onCancel: () => void;
  onConfirm: (code: string) => void;
}) {
  const [code, setCode] = useState('');
  return (
    <Modal title="Confirm Delete" onClose={onCancel}>
      <p className="text-sm text-slate-700">
        This will permanently delete <strong>{name}</strong>. Type <strong>{required}</strong> to confirm.
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={required}
          className="rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-100"
        />
        <button className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-60"
          disabled={code !== required}
          onClick={() => onConfirm(code)}
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}

// ---------- Base Modal ----------
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-50"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
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

// ---------- Types ----------
type Client = {
  id: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  starRating?: number; // 1..5
  createdAt?: any;
  tags?: string[];
};

const DELETE_CODE = process.env.NEXT_PUBLIC_DELETE_CODE || 'DELETE';

// ---------- Utils ----------
const cleanPhone = (p?: string) => (p || '').replace(/[^\d]/g, '');
const waLink = (p?: string, text?: string) =>
  p ? `https://wa.me/${cleanPhone(p)}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '#';
const telLink = (p?: string) => (p ? `tel:${cleanPhone(p)}` : '#');
const emailLink = (e?: string) => (e ? `mailto:${e}` : '#');

const byText = (v: string, q: string) => v.toLowerCase().includes(q.toLowerCase());
const fmtDate = (d?: Date) => (d ? d.toLocaleDateString() : '');

// ---------- Page ----------
export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [minStars, setMinStars] = useState<number | 'all'>('all');
  const [hasPhoneOnly, setHasPhoneOnly] = useState(false);
  const [hasEmailOnly, setHasEmailOnly] = useState(false);

  // Modal states
  const [editing, setEditing] = useState<Client | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  // Live data
  useEffect(() => {
    const qy = query(collection(db, 'customers'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(qy, (snap) => {
      const list: Client[] = snap.docs.map((d) => {
        const data = d.data() as Omit<Client, 'id'>;
        return {
          id: d.id,
          customerName: data.customerName || '',
          customerEmail: data.customerEmail || '',
          customerPhone: data.customerPhone || '',
          customerAddress: data.customerAddress || '',
          starRating: data.starRating || 1,
          createdAt: data.createdAt,
          tags: data.tags || [],
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

  // Filters + search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      if (q) {
        const blob = `${c.customerName} ${c.customerEmail} ${c.customerPhone} ${c.customerAddress}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      if (minStars !== 'all' && (c.starRating || 1) < minStars) return false;
      if (hasPhoneOnly && !cleanPhone(c.customerPhone)) return false;
      if (hasEmailOnly && !(c.customerEmail || '').trim()) return false;
      return true;
    });
  }, [clients, search, minStars, hasPhoneOnly, hasEmailOnly]);

  // Quick stats
  const stats = useMemo(() => {
    const total = clients.length;
    const vip = clients.filter((c) => (c.starRating || 1) >= 4).length;
    const withPhone = clients.filter((c) => cleanPhone(c.customerPhone)).length;
    const last7 = clients.filter((c) => {
      const dt: Date | null = c.createdAt?.toDate ? c.createdAt.toDate() : null;
      if (!dt) return false;
      const diff = (Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    }).length;
    return { total, vip, withPhone, last7 };
  }, [clients]);

  // CSV export (filtered)
  const exportCSV = () => {
    const rows: string[] = [
      ['Name', 'Email', 'Phone', 'Address', 'Stars', 'Created At', 'Tags'].join(','),
    ];
    filtered.forEach((c) => {
      const d = c.createdAt?.toDate ? c.createdAt.toDate() : undefined;
      rows.push(
        [
          csv(c.customerName),
          csv(c.customerEmail || ''),
          csv(c.customerPhone || ''),
          csv(c.customerAddress || ''),
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
  const saveClient = async (payload: Omit<Client, 'id' | 'createdAt'> & { id?: string }) => {
    const base = {
      customerName: payload.customerName.trim(),
      customerEmail: (payload.customerEmail || '').trim(),
      customerPhone: cleanPhone(payload.customerPhone),
      customerAddress: (payload.customerAddress || '').trim(),
      starRating: payload.starRating || 1,
      tags: payload.tags || [],
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

  return (
    <main className="min-h-screen px-6 py-10 max-w-7xl mx-auto">
      {/* Header + Actions */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">👥 Clients (CRM)</h1>
          <p className="text-gray-600">Keep your best customers close—fast actions, VIP tagging, and clean data.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email…"
            className="border rounded-lg px-3 py-2 w-72"
          />
          <select
            value={minStars}
            onChange={(e) => setMinStars(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="border rounded-lg px-3 py-2"
          >
            <option value="all">All stars</option>
            <option value={1}>★ 1+</option>
            <option value={2}>★ 2+</option>
            <option value={3}>★ 3+</option>
            <option value={4}>★ 4+</option>
            <option value={5}>★ 5 only</option>
          </select>
          <label className="flex items-center gap-2 text-sm bg-white border rounded-lg px-3 py-2">
            <input type="checkbox" checked={hasPhoneOnly} onChange={(e) => setHasPhoneOnly(e.target.checked)} />
            Has phone
          </label>
          <label className="flex items-center gap-2 text-sm bg-white border rounded-lg px-3 py-2">
            <input type="checkbox" checked={hasEmailOnly} onChange={(e) => setHasEmailOnly(e.target.checked)} />
            Has email
          </label>
          <button onClick={exportCSV} className="ml-2 bg-gray-900 text-white rounded-lg px-3 py-2">
            ⬇️ Export CSV
          </button>
          <button
            onClick={() =>
              setEditing({
                id: '',
                customerName: '',
                customerEmail: '',
                customerPhone: '',
                customerAddress: '',
                starRating: 3,
                tags: [],
              })
            }
            className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-3 py-2"
          >
            ➕ Add Client
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Clients" value={stats.total} />
        <StatCard label="VIP (★4+)" value={stats.vip} />
        <StatCard label="With Phone" value={stats.withPhone} />
        <StatCard label="New (7d)" value={stats.last7} />
      </div>

      {/* Clients grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((c) => {
          const phoneDup = c.customerPhone && dupByPhone.get(cleanPhone(c.customerPhone))! > 1;
          const emailDup = c.customerEmail && dupByEmail.get((c.customerEmail || '').toLowerCase())! > 1;

          return (
            <div key={c.id} className="bg-white border rounded-2xl shadow-sm overflow-hidden">
              {/* Header */}
              <div className="p-4 flex gap-3 items-center border-b">
                <Avatar name={c.customerName} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-lg">{c.customerName}</div>
                    {(c.starRating || 1) >= 4 && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">VIP</span>
                    )}
                    {(phoneDup || emailDup) && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Duplicate?</span>
                    )}
                  </div>
                  <Stars
                    value={c.starRating || 1}
                    onChange={(v) => saveClient({ ...c, starRating: v })}
                  />
                  <div className="text-xs text-gray-500">
                    Added: {fmtDate(c.createdAt?.toDate ? c.createdAt.toDate() : undefined)}
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    className="text-blue-600 hover:underline text-sm"
                    onClick={() => setEditing(c)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-red-600 hover:underline text-sm"
                    onClick={() => setConfirmDelete({ id: c.id, name: c.customerName })}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-4 space-y-2 text-sm">
                <Row label="Phone">
                  {c.customerPhone ? (
                    <div className="flex items-center gap-3">
                      <a className="text-blue-600 hover:underline" href={telLink(c.customerPhone)}>
                        {c.customerPhone}
                      </a>
                      <a className="text-green-600 hover:underline" href={waLink(c.customerPhone, `Hello ${c.customerName}!`)}>
                        WhatsApp
                      </a>
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Row>
                <Row label="Email">
                  {c.customerEmail ? (
                    <a className="text-blue-600 hover:underline" href={emailLink(c.customerEmail)}>
                      {c.customerEmail}
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Row>
                <Row label="Address">
                  {c.customerAddress ? c.customerAddress : <span className="text-gray-400">—</span>}
                </Row>
                {c.tags && c.tags.length > 0 && (
                  <Row label="Tags">
                    <div className="flex flex-wrap gap-2">
                      {c.tags.map((t, i) => (
                        <span key={i} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  </Row>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-gray-500 text-center mt-12">No clients match your filters.</p>
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
    </main>
  );
}

// ---------- UI Bits ----------
function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white shadow p-4 rounded-lg text-center">
      <p className="text-gray-500 text-sm">{label}</p>
      <h2 className="text-xl font-bold">{value.toLocaleString()}</h2>
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
    <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center font-bold">
      {initials || 'U'}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-24 text-gray-500">{label}</div>
      <div className="flex-1">{children}</div>
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
          className="text-yellow-500 text-lg"
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
  initial: Client;
  onCancel: () => void;
  onSave: (payload: Omit<Client, 'id' | 'createdAt'> & { id?: string }) => void;
}) {
  const [name, setName] = useState(initial.customerName || '');
  const [email, setEmail] = useState(initial.customerEmail || '');
  const [phone, setPhone] = useState(initial.customerPhone || '');
  const [address, setAddress] = useState(initial.customerAddress || '');
  const [stars, setStars] = useState(initial.starRating || 3);
  const [tags, setTags] = useState<string>((initial.tags || []).join(', '));
  const isEdit = Boolean(initial.id);

  return (
    <Modal title={isEdit ? 'Edit Client' : 'Add Client'} onClose={onCancel}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm text-gray-600">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm text-gray-600">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm text-gray-600">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm text-gray-600">Address</span>
          <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full border rounded-lg px-3 py-2" />
        </label>

        <div>
          <span className="text-sm text-gray-600">Star rating</span>
          <div>
            <Stars value={stars} onChange={setStars} />
          </div>
        </div>

        <label className="block">
          <span className="text-sm text-gray-600">Tags (comma separated)</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="vip, school, company"
            className="w-full border rounded-lg px-3 py-2"
          />
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="px-3 py-2" onClick={onCancel}>Cancel</button>
        <button
          className="bg-orange-600 text-white rounded-lg px-3 py-2 disabled:opacity-60"
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              id: initial.id || undefined,
              customerName: name,
              customerEmail: email,
              customerPhone: phone,
              customerAddress: address,
              starRating: stars,
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
      <p className="text-sm text-gray-700">
        This will permanently delete <strong>{name}</strong>. Type <strong>{required}</strong> to confirm.
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={required}
          className="border rounded-lg px-3 py-2"
        />
        <button className="px-3 py-2" onClick={onCancel}>Cancel</button>
        <button
          className="bg-red-600 text-white rounded-lg px-3 py-2 disabled:opacity-60"
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
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

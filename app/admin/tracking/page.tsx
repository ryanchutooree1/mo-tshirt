'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type TrackingEventName =
  | 'page_view'
  | 'whatsapp_click'
  | 'generate_lead'
  | 'service_page_view'
  | 'shop_order_submit';

type TrackingParamValue = string | number | boolean;

type TrackingEventDoc = {
  id: string;
  name: TrackingEventName;
  path: string;
  referrer: string;
  sessionId: string;
  createdAt: Date;
  params: Record<string, TrackingParamValue>;
};

type RangePreset = '7d' | '30d' | '90d';

const EVENT_LABELS: Record<TrackingEventName, string> = {
  page_view: 'Page View',
  whatsapp_click: 'WhatsApp Click',
  generate_lead: 'Quote Submit',
  service_page_view: 'Service View',
  shop_order_submit: 'Shop Order',
};

const EVENT_COLORS: Record<TrackingEventName, string> = {
  page_view: '#111827',
  whatsapp_click: '#16a34a',
  generate_lead: '#ea580c',
  service_page_view: '#2563eb',
  shop_order_submit: '#7c3aed',
};

function getRange(preset: RangePreset) {
  const end = new Date();
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const start = subDays(end, days - 1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function dayKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function asDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  const next = new Date(String(value || ''));
  return Number.isNaN(next.getTime()) ? new Date() : next;
}

function asName(value: unknown): TrackingEventName {
  const safe = String(value || '');
  if (
    safe === 'page_view' ||
    safe === 'whatsapp_click' ||
    safe === 'generate_lead' ||
    safe === 'service_page_view' ||
    safe === 'shop_order_submit'
  ) {
    return safe;
  }
  return 'page_view';
}

function asParams(value: unknown): Record<string, TrackingParamValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
      if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
        return [[key, raw]];
      }
      return [];
    })
  );
}

function countBy(values: string[]) {
  const buckets = new Map<string, number>();
  values.forEach((value) => {
    if (!value) return;
    buckets.set(value, (buckets.get(value) || 0) + 1);
  });
  return Array.from(buckets.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count);
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[28px] border border-[#d8cfbf] bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b6f47]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[#20160f]">{value}</p>
      <p className="mt-2 text-sm text-[#6a5848]">{helper}</p>
    </div>
  );
}

export default function TrackingPage() {
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [events, setEvents] = useState<TrackingEventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => getRange(preset), [preset]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const trackingQuery = query(
          collection(db, 'websiteTrackingEvents'),
          where('createdAt', '>=', Timestamp.fromDate(range.start)),
          where('createdAt', '<=', Timestamp.fromDate(range.end)),
          orderBy('createdAt', 'desc'),
          limit(1000)
        );
        const snapshot = await getDocs(trackingQuery);
        if (cancelled) return;

        const mapped = snapshot.docs.map((doc) => {
          const data = doc.data() as Record<string, unknown>;
          return {
            id: doc.id,
            name: asName(data.name),
            path: String(data.path || ''),
            referrer: String(data.referrer || ''),
            sessionId: String(data.sessionId || ''),
            createdAt: asDate(data.createdAt),
            params: asParams(data.params),
          } satisfies TrackingEventDoc;
        });

        setEvents(mapped);
      } catch (nextError) {
        console.error(nextError);
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load website tracking.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [range.end, range.start]);

  const metrics = useMemo(() => {
    const pageViews = events.filter((event) => event.name === 'page_view').length;
    const whatsappClicks = events.filter((event) => event.name === 'whatsapp_click').length;
    const quoteSubmits = events.filter((event) => event.name === 'generate_lead').length;
    const serviceViews = events.filter((event) => event.name === 'service_page_view').length;
    const shopOrders = events.filter((event) => event.name === 'shop_order_submit').length;
    const sessions = new Set(events.map((event) => event.sessionId).filter(Boolean)).size;

    return {
      pageViews,
      whatsappClicks,
      quoteSubmits,
      serviceViews,
      shopOrders,
      sessions,
      quoteRate: pageViews ? Math.round((quoteSubmits / pageViews) * 1000) / 10 : 0,
      whatsappRate: pageViews ? Math.round((whatsappClicks / pageViews) * 1000) / 10 : 0,
    };
  }, [events]);

  const trendData = useMemo(() => {
    const map = new Map<string, {
      label: string;
      pageViews: number;
      whatsappClicks: number;
      quoteSubmits: number;
      shopOrders: number;
    }>();

    const cursor = new Date(range.start);
    while (cursor <= range.end) {
      const key = dayKey(cursor);
      map.set(key, {
        label: format(cursor, 'd MMM'),
        pageViews: 0,
        whatsappClicks: 0,
        quoteSubmits: 0,
        shopOrders: 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    events.forEach((event) => {
      const bucket = map.get(dayKey(event.createdAt));
      if (!bucket) return;

      if (event.name === 'page_view') bucket.pageViews += 1;
      if (event.name === 'whatsapp_click') bucket.whatsappClicks += 1;
      if (event.name === 'generate_lead') bucket.quoteSubmits += 1;
      if (event.name === 'shop_order_submit') bucket.shopOrders += 1;
    });

    return Array.from(map.values());
  }, [events, range.end, range.start]);

  const eventMix = useMemo(
    () => [
      { name: 'Page Views', count: metrics.pageViews, fill: EVENT_COLORS.page_view },
      { name: 'WhatsApp', count: metrics.whatsappClicks, fill: EVENT_COLORS.whatsapp_click },
      { name: 'Quote Leads', count: metrics.quoteSubmits, fill: EVENT_COLORS.generate_lead },
      { name: 'Shop Orders', count: metrics.shopOrders, fill: EVENT_COLORS.shop_order_submit },
    ],
    [metrics.pageViews, metrics.quoteSubmits, metrics.shopOrders, metrics.whatsappClicks]
  );

  const topPages = useMemo(
    () => countBy(events.filter((event) => event.name === 'page_view').map((event) => event.path)).slice(0, 8),
    [events]
  );

  const topWhatsAppLocations = useMemo(
    () =>
      countBy(
        events
          .filter((event) => event.name === 'whatsapp_click')
          .map((event) => String(event.params.location || event.path || 'unknown'))
      ).slice(0, 8),
    [events]
  );

  const topServicePages = useMemo(
    () =>
      countBy(
        events
          .filter((event) => event.name === 'service_page_view')
          .map((event) => String(event.params.service_slug || event.path || 'unknown'))
      ).slice(0, 8),
    [events]
  );

  const recentEvents = useMemo(() => events.slice(0, 25), [events]);

  return (
    <main className="min-h-screen bg-[#f5efe4] px-6 py-8 text-[#20160f]">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-[36px] border border-[#d8cfbf] bg-white px-6 py-6 shadow-sm sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8b6f47]">Admin Tracking</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#20160f] sm:text-4xl">
                Website tracking dashboard
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-[#6a5848] sm:text-base">
                Follow public page views, WhatsApp clicks, quote submits, service-page visits, and shop-order sends in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['7d', '30d', '90d'] as RangePreset[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPreset(option)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                    preset === option
                      ? 'bg-[#20160f] text-white'
                      : 'border border-[#d8cfbf] bg-[#f8f3ea] text-[#6a5848] hover:border-[#8b6f47]'
                  }`}
                >
                  {option}
                </button>
              ))}
              <Link
                href="/admin/analytics"
                className="inline-flex items-center rounded-full border border-[#d8cfbf] bg-[#f8f3ea] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#6a5848] transition hover:border-[#8b6f47]"
              >
                Financial Analytics
              </Link>
            </div>
          </div>
          <p className="mt-4 text-xs text-[#8b6f47]">
            Range: {format(range.start, 'd MMM yyyy')} to {format(range.end, 'd MMM yyyy')} · last {events.length} tracked events loaded
          </p>
        </section>

        {error ? (
          <div className="rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Page Views" value={String(metrics.pageViews)} helper={`${metrics.sessions} tracked sessions`} />
          <MetricCard label="WhatsApp Clicks" value={String(metrics.whatsappClicks)} helper={`${metrics.whatsappRate}% of page views`} />
          <MetricCard label="Quote Leads" value={String(metrics.quoteSubmits)} helper={`${metrics.quoteRate}% of page views`} />
          <MetricCard label="Shop Orders" value={String(metrics.shopOrders)} helper={`${metrics.serviceViews} service-page visits`} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.85fr]">
          <div className="rounded-[32px] border border-[#d8cfbf] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b6f47]">Trend</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#20160f]">Daily tracking activity</h2>
              </div>
              {loading ? <span className="text-xs text-[#8b6f47]">Loading…</span> : null}
            </div>
            <div className="mt-6 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="pageViewsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#111827" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#111827" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ea580c" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#ea580c" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#efe7d7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#8b6f47', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#8b6f47', fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="pageViews"
                    stroke={EVENT_COLORS.page_view}
                    fill="url(#pageViewsFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="quoteSubmits"
                    stroke={EVENT_COLORS.generate_lead}
                    fill="url(#leadsFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[32px] border border-[#d8cfbf] bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b6f47]">Mix</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#20160f]">Tracked event types</h2>
            <div className="mt-6 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={eventMix}>
                  <CartesianGrid stroke="#efe7d7" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#8b6f47', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#8b6f47', fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                    {eventMix.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-[32px] border border-[#d8cfbf] bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b6f47]">Top Pages</p>
            <div className="mt-4 space-y-3">
              {topPages.length ? topPages.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8f3ea] px-4 py-3 text-sm">
                  <span className="truncate font-medium text-[#20160f]">{row.label}</span>
                  <span className="font-semibold text-[#8b6f47]">{row.count}</span>
                </div>
              )) : <p className="text-sm text-[#6a5848]">No page views yet.</p>}
            </div>
          </div>

          <div className="rounded-[32px] border border-[#d8cfbf] bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b6f47]">Top CTA Locations</p>
            <div className="mt-4 space-y-3">
              {topWhatsAppLocations.length ? topWhatsAppLocations.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8f3ea] px-4 py-3 text-sm">
                  <span className="truncate font-medium text-[#20160f]">{row.label}</span>
                  <span className="font-semibold text-[#8b6f47]">{row.count}</span>
                </div>
              )) : <p className="text-sm text-[#6a5848]">No WhatsApp clicks yet.</p>}
            </div>
          </div>

          <div className="rounded-[32px] border border-[#d8cfbf] bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b6f47]">Top Service Pages</p>
            <div className="mt-4 space-y-3">
              {topServicePages.length ? topServicePages.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8f3ea] px-4 py-3 text-sm">
                  <span className="truncate font-medium text-[#20160f]">{row.label}</span>
                  <span className="font-semibold text-[#8b6f47]">{row.count}</span>
                </div>
              )) : <p className="text-sm text-[#6a5848]">No service-page visits yet.</p>}
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-[#d8cfbf] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b6f47]">Recent Events</p>
              <h2 className="mt-2 text-2xl font-semibold text-[#20160f]">Latest tracking activity</h2>
            </div>
            {loading ? <span className="text-xs text-[#8b6f47]">Refreshing…</span> : null}
          </div>

          <div className="mt-6 overflow-hidden rounded-[24px] border border-[#eadfcd]">
            <div className="hidden grid-cols-[170px_170px_minmax(0,1fr)_220px] gap-4 bg-[#f8f3ea] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8b6f47] md:grid">
              <span>Time</span>
              <span>Event</span>
              <span>Path</span>
              <span>Details</span>
            </div>
            <div className="divide-y divide-[#efe7d7]">
              {recentEvents.length ? recentEvents.map((event) => {
                const detail =
                  String(event.params.location || event.params.service_slug || event.params.form_source || event.params.source || event.referrer || '');

                return (
                  <div key={event.id} className="grid gap-2 px-4 py-4 text-sm md:grid-cols-[170px_170px_minmax(0,1fr)_220px] md:gap-4">
                    <span className="text-[#6a5848]">{format(event.createdAt, 'd MMM yyyy HH:mm')}</span>
                    <span className="font-semibold text-[#20160f]">{EVENT_LABELS[event.name]}</span>
                    <span className="truncate text-[#20160f]">{event.path || 'n/a'}</span>
                    <span className="truncate text-[#6a5848]">{detail || 'n/a'}</span>
                  </div>
                );
              }) : (
                <div className="px-4 py-8 text-sm text-[#6a5848]">
                  No tracking events yet. Public visits and tracked actions will appear here automatically.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

import { NextResponse } from 'next/server';
import { collection, documentId, getDocs, limit, query, Timestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAdminRequestSession } from '@/lib/admin-request';
import { hasAdminPageAccess } from '@/lib/admin-access';
import { countInsightValues, isConvertedOrder } from '@/lib/tracking-insights';

export async function GET(request: Request) {
  const session = await getAdminRequestSession();
  if (!session) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!['/admin/tracking', '/admin/quotation-approval', '/admin/orders'].every(page => hasAdminPageAccess(session.allowedPages, page, session))) {
    return NextResponse.json({ error: 'Tracking, quotation and order access is required for conversion data.' }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const start = new Date(params.get('start') || ''); const end = new Date(params.get('end') || '');
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start || +end-+start > 93*86400000) return NextResponse.json({ error: 'Invalid date range.' }, { status: 400 });
  try {
    const snapshot = await getDocs(query(collection(db, 'quotes'), where('createdAt','>=',Timestamp.fromDate(start)), where('createdAt','<=',Timestamp.fromDate(end)), limit(501)));
    const rows = snapshot.docs.slice(0,500).map(row => ({ id: row.id, ...row.data() } as { id: string; tracking?: Record<string,string>; orderTransactionId?: string }));
    const tracked = rows.filter(row => row.tracking?.attempt_id);
    const orders = new Map<string, Record<string, unknown>>();
    const lookups: Promise<void>[] = [];
    const quoteIds = tracked.map(row=>row.id);
    const orderIds = [...new Set(tracked.flatMap(row=>row.orderTransactionId ? [row.orderTransactionId] : []))];
    for (const [field, ids] of [["quoteId",quoteIds],["__name__",orderIds]] as const) {
      for(let i=0;i<ids.length;i+=30) {
        lookups.push(getDocs(query(collection(db,'transactions'), where(field === '__name__' ? documentId() : field, 'in', ids.slice(i,i+30)))).then(snap => { snap.docs.forEach(row=>orders.set(row.id,row.data())); }));
      }
    }
    await Promise.all(lookups);
    const converted = tracked.filter(row => [...orders].some(([id,order]) => (order.quoteId===row.id || id===row.orderTransactionId) && isConvertedOrder(order)));
    return NextResponse.json({ enquiries: tracked.length, converted: converted.length, untracked: rows.length-tracked.length, truncated: snapshot.size>500,
      sources: countInsightValues(converted.map(row=>row.tracking?.traffic_source || 'Unknown')),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Conversion data could not load.' }, { status: 500 }); }
}

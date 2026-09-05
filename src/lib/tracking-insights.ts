export type InsightEvent = { name: string; sessionId: string; createdAt: Date; params: Record<string, string | number | boolean> };
export const ABANDONMENT_MS = 30 * 60 * 1000;
export function isLocalTrackingHost(host: string) {
  return /^(localhost|127(?:\.\d+){3}|\[?::1\]?|0\.0\.0\.0)$/i.test(host) || host.endsWith('.localhost');
}
export function summarizeJourney(events: InsightEvent[], flow: 'quote' | 'design', now = Date.now()) {
  const attempts = new Map<string, { started: boolean; completed: boolean; last: number; step: string }>();
  for (const e of [...events].sort((a,b) => a.createdAt.getTime()-b.createdAt.getTime())) {
    const id = String(e.params.attempt_id || '');
    if (!id || e.params.flow !== flow) continue;
    const a = attempts.get(id) || { started: false, completed: false, last: 0, step: 'Started' };
    a.started ||= e.name === `${flow}_start`;
    a.completed ||= e.name === 'generate_lead';
    a.last = Math.max(a.last, e.createdAt.getTime());
    if (e.params.step) a.step = String(e.params.step);
    attempts.set(id, a);
  }
  const started = [...attempts.values()].filter(a => a.started);
  const completed = started.filter(a => a.completed).length;
  const abandoned = started.filter(a => !a.completed && now-a.last >= ABANDONMENT_MS);
  return { started: started.length, completed, abandoned: abandoned.length, active: started.length-completed-abandoned.length,
    steps: countInsightValues(abandoned.map(a => a.step)) };
}
export function countInsightValues(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach(v => counts.set(v, (counts.get(v) || 0)+1));
  return [...counts].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);
}
export function trafficSources(events: InsightEvent[]) {
  const sessions = new Map<string,string>();
  [...events].sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime()).forEach(e => {
    if (e.sessionId && !sessions.has(e.sessionId)) sessions.set(e.sessionId, String(e.params.traffic_source || 'Unknown (older event)'));
  });
  return countInsightValues([...sessions.values()]);
}
export function isConvertedOrder(data: Record<string, unknown>) {
  const status = String(data.status || '').toLowerCase();
  return !['cancelled','canceled','rejected','draft'].includes(status);
}

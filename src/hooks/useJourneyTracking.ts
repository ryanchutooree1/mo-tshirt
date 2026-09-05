"use client";
import { useRef } from 'react';
import { getTrackingSessionId, getTrafficAttribution, trackEvent } from '@/lib/analytics';
import { isLocalTrackingHost } from '@/lib/tracking-insights';

export function useJourneyTracking(flow: 'quote' | 'design', source: string) {
  const attempt = useRef('');
  const finished = useRef(false);
  const lastProgress = useRef('');
  const lastAt = useRef(0);
  function start(step = 'Started') {
    if (!attempt.current || finished.current) {
      attempt.current = crypto.randomUUID();
      finished.current = false;
      lastProgress.current = '';
      trackEvent(`${flow}_start`, { flow, form_source: source, attempt_id: attempt.current, step });
    }
    if (flow === 'design' && (step !== lastProgress.current || Date.now()-lastAt.current > 60000)) {
      lastProgress.current = step; lastAt.current = Date.now();
      trackEvent('design_progress', { flow, form_source: source, attempt_id: attempt.current, step });
    }
  }
  function attach(payload: FormData) {
    if (!attempt.current || finished.current) start();
    if (isLocalTrackingHost(location.hostname) || location.pathname.startsWith('/admin')) return;
    payload.set('tracking', JSON.stringify({ session_id: getTrackingSessionId(), attempt_id: attempt.current, flow, ...getTrafficAttribution() }));
  }
  function complete(quoteId?: string, extra: Record<string, string | number> = {}) {
    if (finished.current) return;
    trackEvent('generate_lead', { ...extra, flow, form_source: source, attempt_id: attempt.current, quote_id: quoteId });
    finished.current = true;
  }
  return { start, attach, complete };
}

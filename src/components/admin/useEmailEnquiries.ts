"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmailIntake } from '@/lib/email-intake-model';
export function useEmailEnquiries(enabled: boolean) {
  const [enquiries, setEnquiries] = useState<EmailIntake[]>([]);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(false);
  const load = useCallback(async () => {
    if (!active.current) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    try {
      const response = await fetch('/api/admin/inbox/intake', { cache: 'no-store', signal: request.signal });
      if (response.status === 403) { setEnquiries([]); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load email enquiries.');
      if (active.current && !request.signal.aborted) { setEnquiries(data.enquiries); setLastSync(data.lastSyncAt); setError(data.error || ''); }
    } catch (e) { if (active.current && !request.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load email enquiries.'); }
  }, []);
  useEffect(() => {
    active.current = enabled;
    if (!enabled) return;
    void load();
    const tick = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(tick, 20000);
    window.addEventListener('email-intake-updated', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { active.current = false; controller.current?.abort(); window.clearInterval(timer); window.removeEventListener('email-intake-updated', tick); document.removeEventListener('visibilitychange', tick); };
  }, [enabled, load]);
  const check = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const response = await fetch('/api/admin/inbox/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not check email.');
      await load();
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : 'Could not check email.'); }
    finally { if (active.current) setChecking(false); }
  };
  return { enquiries, error, lastSync, checking, check, refresh: load };
}

"use client";
import { useEffect } from "react";
export default function EmailIntakeAutoSync() {
  useEffect(() => {
    let running = false;
    let stopped = false;
    const controller = new AbortController();
    const sync = async () => {
      if (stopped || running || document.visibilityState !== "visible") return;
      running = true;
      try { await fetch("/api/admin/inbox/intake", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync" }) }); if (!stopped) window.dispatchEvent(new Event("email-intake-updated")); }
      catch { /* The enquiry dashboard shows the last successful sync and server errors. */ }
      finally { running = false; }
    };
    void sync();
    const timer = window.setInterval(sync, 120000);
    document.addEventListener("visibilitychange", sync);
    return () => { stopped = true; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", sync); };
  }, []);
  return null;
}

"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Mail, RefreshCw, Search } from "lucide-react";
import EmailQuoteImport from "@/components/admin/EmailQuoteImport";
import type { InboxMessage } from "@/lib/gmail-inbox";

export default function InboxPage() {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<string[]>([""]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<InboxMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const page = pages[pages.length - 1];
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setMessages([]); setNextPage(null); setSelected(null);
    fetch(`/api/admin/inbox?${new URLSearchParams({ q: query, pageToken: page })}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load inbox."); return data; })
      .then(data => { setMessages(data.messages); setNextPage(data.nextPageToken); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, page, revision]);
  useEffect(() => {
    setMessage(null); setReadError("");
    if (!selected) return;
    const controller = new AbortController();
    setReading(true);
    fetch(`/api/admin/inbox?id=${encodeURIComponent(selected)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load email."); return data; })
      .then(data => setMessage(data.message))
      .catch(error => { if (!controller.signal.aborted) setReadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setReading(false); });
    return () => controller.abort();
  }, [selected, revision]);
  const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 disabled:opacity-40";
  return <main className="mx-auto max-w-7xl p-4 text-gray-900 sm:p-8">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Mail size={25} /> Inbox</h1><p className="mt-1 text-sm text-gray-500">motshirtmauritius@gmail.com</p></div><button className={button} disabled={loading} onClick={() => setRevision(r => r + 1)}><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</button></header>
    <form className="mb-5 flex gap-2" onSubmit={event => { event.preventDefault(); setQuery(draft.trim()); setPages([""]); setRevision(r => r + 1); }}><input aria-label="Search inbox" maxLength={500} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-gray-900" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Search inbox by sender, subject or words…" /><button className={button} type="submit"><Search size={16} /> Search</button></form>
    {error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6"><h2 className="font-semibold">Inbox unavailable</h2><p className="mt-2 text-sm">{error}</p><button className={`${button} mt-4`} onClick={() => setRevision(r => r + 1)}>Try again</button></div> : <div className="grid overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-[380px_minmax(0,1fr)]">
      <section aria-label="Email list" className={`${selected ? "hidden lg:block" : ""} border-r border-gray-200`}>
        {loading ? <p role="status" className="p-8 text-gray-500">Loading inbox…</p> : messages.length === 0 ? <p className="p-8 text-gray-500">{query ? "No emails match your search." : "Your inbox is empty."}</p> : messages.map(item => <button key={item.id} onClick={() => setSelected(item.id)} aria-pressed={selected === item.id} className={`block w-full border-b border-gray-100 p-4 text-left hover:bg-gray-50 ${selected === item.id ? "bg-blue-50" : ""}`}><div className="flex items-center gap-2">{item.unread && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />}<span className={`truncate text-sm ${item.unread ? "font-bold" : "font-medium"}`}>{item.from}</span></div><p className="mt-1 truncate text-sm font-medium">{item.subject}</p><p className="mt-1 line-clamp-2 text-xs text-gray-500">{item.snippet}</p><p className="mt-2 truncate text-xs text-gray-400">{item.date}</p></button>)}
        <div className="flex items-center justify-between gap-2 p-4"><button className={button} disabled={loading || pages.length === 1} onClick={() => setPages(p => p.slice(0, -1))}>Newer</button><span className="text-xs text-gray-500">Page {pages.length}</span><button className={button} disabled={loading || !nextPage} onClick={() => { if (nextPage) setPages(p => [...p, nextPage]); }}>Older</button></div>
      </section>
      <section aria-label="Email reader" className={`${selected ? "" : "hidden lg:block"} min-w-0 p-5 sm:p-8`}>
        {selected && <button className={`${button} mb-5 lg:hidden`} onClick={() => setSelected(null)}><ArrowLeft size={16} /> Back to inbox</button>}
        {reading && selected ? <p role="status">Loading email…</p> : readError ? <p role="alert">{readError}</p> : message && selected ? <article><EmailQuoteImport key={message.id} messageId={message.id} /><h2 className="break-words text-xl font-semibold">{message.subject}</h2><div className="my-5 space-y-1 break-words border-b border-gray-100 pb-5 text-sm text-gray-500"><p>From: {message.from}</p><p>To: {message.to}</p><p>{message.date}</p></div><div className="whitespace-pre-wrap break-words text-sm leading-7">{message.text}</div><p className="mt-8 text-xs text-gray-400">Text view · Attachments are not displayed · Reading here does not change Gmail’s unread status.</p></article> : <div className="py-24 text-center text-gray-400"><Mail className="mx-auto mb-4" size={36} /><p>Select an email to read it here.</p></div>}
      </section>
    </div>}
  </main>;
}

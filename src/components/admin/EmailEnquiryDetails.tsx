"use client";
import { useState } from 'react';
import { FiMail, FiSend, FiCheckCircle, FiPaperclip } from 'react-icons/fi';
import { questionEmail, type EmailIntake } from '@/lib/email-intake-model';
import EmailQuoteImport from './EmailQuoteImport';
export const ENQUIRY_LABELS: Record<string, string> = { needs_details: 'Needs details', waiting: 'Waiting for client', review: 'Review enquiry', error: 'Needs attention', ready: 'Ready for pricing' };
export default function EmailEnquiryDetails({ intake, isDark, onUpdated }: { intake: EmailIntake; isDark: boolean; onUpdated: () => Promise<void> }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const preview = questionEmail(intake);
  const muted = isDark ? 'text-white/60' : 'text-slate-500';
  const panel = isDark ? 'border-white/10 bg-white/[0.04]' : 'border-slate-200 bg-white';
  async function sendQuestions() {
    if (sending) return;
    setSending(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/admin/inbox/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ask', id: intake.id, version: intake.version }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send questions.');
      setNotice('Questions sent. This request will update here when the client replies.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send questions.'); }
    finally { await onUpdated(); setSending(false); }
  }
  return <article aria-label="Client request details" className={`rounded-3xl border p-5 sm:p-7 ${panel}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className={`flex items-center gap-2 text-xs font-semibold ${muted}`}><FiMail /> Email enquiry</p><h2 className="mt-3 text-2xl font-semibold">{intake.draft.name || intake.email}</h2><p className={`mt-2 break-words text-sm ${muted}`}>{intake.subject}</p></div>
      <span className="rounded-full border border-orange-300/40 bg-orange-400/10 px-3 py-2 text-xs font-semibold text-orange-600">{ENQUIRY_LABELS[intake.status]}</span>
    </div>
    <p className={`my-5 text-sm leading-6 ${muted}`}>{intake.summary}</p>
    <div className={`grid gap-4 rounded-2xl border p-4 text-sm sm:grid-cols-2 xl:grid-cols-3 ${panel}`}>
      {[["Email", intake.email], ["Phone / WhatsApp", intake.draft.phone], ["Company", intake.draft.company], ["Required date", intake.draft.deadline], ["Collection / delivery", intake.draft.delivery], ["Address", intake.draft.address], ["BRN", intake.draft.brn], ["VAT number", intake.draft.vat]].map(([label, value]) => <div key={label}><p className={`text-xs ${muted}`}>{label}</p><p className="mt-1 break-words font-medium">{value || 'Not provided'}</p></div>)}
    </div>
    {intake.items.length > 0 && <section className="my-6"><h3 className="text-sm font-semibold">Requested products</h3><div className="mt-3 space-y-2">{intake.items.map((item, index) => <div key={index} className={`flex gap-3 rounded-xl border p-4 ${panel}`}><span className="text-lg font-semibold">{item.quantity || '?'}×</span><div><p className="text-sm font-medium">{item.product || 'Product to confirm'}</p><p className={`mt-1 text-xs leading-5 ${muted}`}>{[item.colour, item.sizes, item.printMethod, item.placement, item.artwork].filter(Boolean).join(' · ')}</p></div></div>)}</div></section>}
    {intake.status === 'review' || intake.status === 'error' ? <section className="my-6"><p className={`mb-4 text-sm leading-6 ${muted}`}>Review the client’s request and confirm the details before preparing a quote.</p><EmailQuoteImport messageId={intake.lastMessage.id} /></section> : intake.status === 'ready' ? <p role="status" className="my-6 text-sm">The quote is ready. Loading its pricing details…</p> : <section className="my-6 overflow-hidden rounded-2xl border border-orange-300/40">
      <div className="bg-orange-400/10 p-5"><h3 className="font-semibold">{intake.status === 'waiting' ? 'Waiting for the client’s reply' : 'Here’s what to ask'}</h3><p className={`mt-2 text-sm leading-6 ${muted}`}>{intake.status === 'waiting' ? 'Replies are checked automatically. Once complete, this same request becomes ready for pricing.' : `${intake.missing.length} details are missing. Review the email below, then send it with one click.`}</p>{intake.status === 'needs_details' && <div className="mt-3 flex flex-wrap gap-2">{intake.missing.map(m => <span key={m.key} className={`rounded-lg border px-2 py-1 text-xs ${panel}`}>{m.label}</span>)}</div>}</div>
      <div className="p-5"><p className={`break-words text-xs leading-5 ${muted}`}>To: {preview.to}<br />Subject: {preview.subject}</p><pre className="my-5 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6">{preview.text}</pre>
        {intake.sendState === 'unknown' || intake.sendState === 'sending' ? <p role="status" className="text-sm">{intake.sendState === 'unknown' ? 'Delivery is unconfirmed. Check Sent before trying again; repeat sending is blocked.' : 'Sending has started. The result will update here.'}</p> : intake.status === 'waiting' ? <p className="flex items-center gap-2 text-sm"><FiCheckCircle /> Questions sent{intake.sentAtIso ? ` · ${new Date(intake.sentAtIso).toLocaleString()}` : ''}</p> : <button onClick={sendQuestions} disabled={sending || !intake.missing.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#ff6600] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><FiSend />{sending ? 'Sending questions…' : 'Send these questions to client'}</button>}
      </div>
    </section>}
    {error && <p role="alert" className="my-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}{notice && <p role="status" className="my-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {intake.attachmentNames.length > 0 && <p className={`my-4 flex gap-2 break-words text-xs ${muted}`}><FiPaperclip className="shrink-0" />Attachments: {intake.attachmentNames.join(', ')}. File contents need review.</p>}
    {intake.warnings.map(w => <p key={w} className={`my-3 text-xs ${muted}`}>{w}</p>)}
    <details className={`mt-6 border-t pt-5 ${isDark ? 'border-white/10' : 'border-slate-200'}`}><summary className="cursor-pointer text-sm font-semibold">Original client conversation</summary><pre className={`mt-4 max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 ${muted}`}>{intake.originalText}</pre></details>
  </article>;
}

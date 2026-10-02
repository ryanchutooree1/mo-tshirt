"use client";

import type { PartnerOrderView } from '@/lib/production-partner-types';
import type { ResponseDraft } from './PartnerProductionPage';
import { yanNextAction } from '@/lib/yan-production-view';

const secondary = 'rounded-xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] px-4 py-2.5 text-sm font-semibold text-[color:var(--partner-text)] hover:bg-[var(--partner-hover)] disabled:opacity-50';
const input = 'mt-2 w-full rounded-xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] p-3 text-sm text-[color:var(--partner-text)]';

export default function YanProductionActions({ order, draft, onDraft, receiptChecked, onReceipt, onStart, onSave, saving, managerName, notice }: {
  order: PartnerOrderView;
  draft: ResponseDraft;
  onDraft: (draft: Partial<ResponseDraft>) => void;
  receiptChecked: boolean;
  onReceipt: (checked: boolean) => void;
  onStart: () => void;
  onSave: (draft?: Partial<ResponseDraft>) => void;
  saving: boolean;
  managerName: string;
  notice: string | null;
}) {
  const action = yanNextAction(order, receiptChecked);
  const production = order.production;
  const blockers = production.blockers || [];
  // Acceptance itself is not the start gate. All reported blockers stay visible.
  const canRespond = production.active && blockers.every(blocker => action === 'accept' && blocker === 'Accept this released job before starting production.');
  const disabled = saving || (action === 'accept' || action === 'ready' ? !canRespond : !production.readyToStart);
  const labels = { accept: 'Accept job', receive: 'Confirm shirts received', start: 'Start printing', ready: 'Mark ready for collection', done: 'No next action', blocked: 'Waiting for release' };
  const currentStep = action === 'accept' ? 0 : action === 'receive' ? 1 : action === 'start' ? 2 : action === 'ready' ? 2 : 3;
  const finished = ['completed', 'ryan_to_collect', 'will_post_tomorrow'].includes(order.productionStatus);
  const closed = !production.active || order.decision === 'rejected';

  function next() {
    if (action === 'accept') onSave({ decision: 'accepted', missingInformation: '' });
    if (action === 'receive') onReceipt(true);
    if (action === 'start') onStart();
    if (action === 'ready') onSave({ decision: 'accepted', productionStatus: 'ryan_to_collect', missingInformation: '' });
  }

  return <section aria-label="Production next action" className="rounded-2xl border border-[color:var(--partner-border)] bg-[var(--partner-card)] p-4 shadow-[var(--partner-shadow)] sm:p-5">
    {!closed && action !== 'blocked' && <ol aria-label="Production progress" className="grid grid-cols-4 gap-2 text-center text-xs">
      {['Accept', 'Receive shirts', 'Print', 'Ready'].map((label, index) => <li key={label} aria-current={action !== 'done' && index === currentStep ? 'step' : undefined} className={`rounded-xl px-2 py-3 font-semibold ${index < currentStep || finished ? 'bg-[var(--partner-success-bg)] text-[color:var(--partner-success-text)]' : index === currentStep ? 'bg-[var(--partner-accent-soft)] text-[color:var(--partner-text)]' : 'bg-[var(--partner-soft)] text-[color:var(--partner-muted)]'}`}>{label}</li>)}
    </ol>}
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--partner-muted)]">{action === 'done' ? 'Job status' : 'Your next step'}</p>
      <h3 className="mt-1 text-xl font-semibold">{action === 'done' ? closed ? 'Job closed or declined' : 'Production ready' : labels[action]}</h3>
      <p className="mt-2 text-sm leading-6 text-[color:var(--partner-muted)]">
        {action === 'accept' && 'Check the artwork, garments and deadline, then accept this released job. Printing starts separately.'}
        {action === 'receive' && 'Check every garment, colour, size and quantity below against the shirts physically received.'}
        {action === 'start' && 'Shirts checked. Start printing to record this receipt check and begin production. Inventory stock is unchanged.'}
        {action === 'ready' && 'When all printing is finished and checked, mark this job ready for MO to collect.'}
        {action === 'done' && (closed ? `Ask ${managerName} to review this job before any production work.` : 'This job stays available in History.')}
        {action === 'blocked' && `Ask ${managerName} for a current approved production release.`}
      </p>
      {action === 'receive' && <>
        <ul className="mt-3 space-y-2 rounded-xl bg-[var(--partner-soft)] p-3 text-sm">{production.packet?.products.map((row, index) => <li key={index}>{row.product} · {row.color} · {row.size} × {row.quantity ?? 'Unknown'}</li>)}</ul>
        <p className="mt-2 text-xs leading-5 text-[color:var(--partner-muted)]">Confirm only after checking all listed shirts. The receipt is saved when you select Start printing; stock is not changed.</p>
      </>}
      {blockers.length > 0 && <div className="mt-4 rounded-xl border border-[color:var(--partner-warning-border)] bg-[var(--partner-warning-bg)] p-3 text-sm text-[color:var(--partner-warning-text)]"><p className="font-semibold">Before production can continue</p><ul className="mt-2 list-disc space-y-1 pl-4">{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
      {action !== 'done' && action !== 'blocked' && <button type="button" onClick={next} disabled={disabled} className="mt-4 min-h-12 w-full rounded-xl bg-[var(--partner-action)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{saving ? 'Saving…' : labels[action]}</button>}
      {action === 'start' && <button type="button" className={`mt-2 w-full ${secondary}`} disabled={saving} onClick={() => onReceipt(false)}>Recheck shirts</button>}
      {production.startedAtIso && <p className="mt-3 text-xs leading-5 text-[color:var(--partner-muted)]">Shirts received and checked. Production started {new Date(production.startedAtIso).toLocaleString('en-MU')}.</p>}
    </div>
    <details className="mt-5 border-t border-[color:var(--partner-border)] pt-4">
      <summary className="cursor-pointer text-sm font-semibold">Questions, notes & other updates</summary>
      <div className="mt-4 space-y-4">
        <label className="block text-sm font-semibold">Comments for {managerName}<textarea value={draft.comments} onChange={event => onDraft({ comments: event.target.value })} rows={3} className={input} /></label>
        <label className="block text-sm font-semibold">Missing information<textarea value={draft.missingInformation} onChange={event => onDraft({ missingInformation: event.target.value })} rows={3} className={input} /></label>
        <p className="text-xs leading-5 text-[color:var(--partner-muted)]">Sending a question, or saving with missing information, emails {managerName} for action.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} disabled={saving || !canRespond} onClick={() => onSave()}>Save notes</button>
          <button type="button" className={secondary} disabled={saving || !canRespond || !draft.missingInformation.trim()} onClick={() => onSave({ decision: production.startedAtIso ? 'accepted' : 'needs_info' })}>Send question</button>
          {!production.startedAtIso && <button type="button" className={secondary} disabled={saving || !canRespond} onClick={() => onSave({ decision: 'rejected' })}>Decline job</button>}
        </div>
        {production.startedAtIso && !finished && <div className="flex flex-wrap gap-2"><button type="button" className={secondary} disabled={saving || !canRespond} onClick={() => onSave({ productionStatus: 'will_post_tomorrow' })}>Will post tomorrow</button></div>}
      </div>
    </details>
    {notice && <p role="status" className="mt-4 rounded-xl border border-[color:var(--partner-border)] bg-[var(--partner-soft)] p-3 text-sm">{notice}</p>}
  </section>;
}

import type { EmailIntake } from './email-intake-model.ts';
export type RequestSource = 'form' | 'studio' | 'email' | 'whatsapp' | 'team';
export const REQUEST_SOURCE_LABELS: Record<RequestSource, string> = { form: 'Quote form', studio: 'Design studio', email: 'Email', whatsapp: 'WhatsApp', team: 'Team' };
export function requestSource(source?: string): RequestSource {
  if (/studio/i.test(source || '')) return 'studio';
  if (/gmail|email/i.test(source || '')) return 'email';
  if (/whatsapp/i.test(source || '')) return 'whatsapp';
  if (/admin|manual|team/i.test(source || '')) return 'team';
  return 'form';
}
type InboxBase = { id: string; createdAt?: Date | null; source?: string; status?: string };
export type PendingEnquiryRecord = InboxBase & { name: string; email: string; phone: string; message: string; source: 'Gmail'; status: 'review'; intake: EmailIntake };
export function mergeQuotationInbox<T extends InboxBase>(quotes: T[], enquiries: EmailIntake[]): (T | PendingEnquiryRecord)[] {
  const quoteIds = new Set(quotes.map(q => q.id));
  const pending: PendingEnquiryRecord[] = enquiries.filter(e => e.status !== 'ignored' && !quoteIds.has(e.quoteId || e.id) && !quoteIds.has(e.id)).map(e => ({
    id: e.id, name: e.draft.name || e.email, email: e.email, phone: e.draft.phone,
    message: e.subject, source: 'Gmail', status: 'review', createdAt: new Date(e.lastReplyAt), intake: e,
  }));
  return [...quotes, ...pending].sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
}
export function enquiryStage(intake: EmailIntake) {
  return intake.status === 'needs_details' || intake.status === 'waiting' ? intake.status : 'review';
}

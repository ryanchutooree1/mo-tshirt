import type { PartnerOrderView } from './production-partner-types';

export type YanQueueView = 'production' | 'offers' | 'history';
export type YanNextAction = 'accept' | 'receive' | 'start' | 'ready' | 'done' | 'blocked';

export function yanQueueView(order: PartnerOrderView): YanQueueView {
  const finished = ['completed', 'ryan_to_collect', 'will_post_tomorrow'].includes(order.productionStatus);
  if (order.production?.active === false || order.decision === 'rejected' || finished) return 'history';
  return order.production?.released ? 'production' : 'offers';
}

/** Presentation only. Server readiness and write validation remain authoritative. */
export function yanNextAction(order: PartnerOrderView, receiptChecked: boolean): YanNextAction {
  if (yanQueueView(order) === 'history') return 'done';
  if (!order.production?.released || !order.production.packet || !order.production.active) return 'blocked';
  if (order.decision !== 'accepted') return 'accept';
  if (order.production.startedAtIso) return 'ready';
  return receiptChecked ? 'start' : 'receive';
}

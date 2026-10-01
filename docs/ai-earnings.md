# Private AI Earnings ledger

Open `/admin/x5-execution/ai-earnings` from **AI Earnings** in X5 Aura Farming.
This is personal, manually recorded evidence of AI-assisted work. It is separate
from shared business accounting and does not import transactions or claim that AI
alone caused the revenue. No projects, payments, or costs are prepopulated.

## Recording work

1. Create a project with what was sold and how AI helped. Client label is optional.
2. Choose its currency before adding payments or costs. All supported currencies
   use two decimal places; currencies are never converted or summed together.
3. Optionally record a confirmed agreed total. Quotes and estimates do not belong
   in this field and the agreed total never counts as received income.
4. Add actual dated receipts, including each partial payment, once. Reference
   fields can hold an invoice or payment reference for manual reconciliation.
5. Add direct costs and explicitly mark completeness. An empty cost list does not
   mean that costs are known to be zero. Leave completeness unchecked if unsure.
6. Save. Edit to append later payments or correct records. Archive is recoverable
   and excludes the whole project from summaries; restore it from Archived.

Confirmed receipts and recorded direct costs cover 1 October 2026 through today
in `Indian/Mauritius` (UTC+04). Earlier events can be recorded for context but do
not enter period cash totals. Pending agreed balances deduct all receipts through
today, including those before the tracking period; overpayments do not create
negative pending balances. Future-dated payments and costs are rejected.

Net after recorded costs is cash received less direct costs recorded in the period.
It is explicitly provisional while costs are incomplete and is not a full-business
profit measure. Taxes, unrecorded overhead, refunds, and exchange-rate conversion
are not modeled in this first version. Amounts use integer minor units throughout.

## Privacy and storage

- Dedicated PostgreSQL table `ai_earnings_ledgers`; existing Aura documents,
  Firestore collections, and business-accounting records are unchanged.
- The server targets only the authenticated session's user ID, including owners.
  No user-selection query or payload is accepted. The existing Aura page
  permission covers this subpage and its API; no additional role grants are made.
- GET and PUT `/api/admin/ai-earnings` are private/no-store, authenticated,
  same-origin checked, and limited to 1 MB requests. The strict versioned schema
  allows at most 500 projects and 100 payments/costs per project category.
- Save requires the revision and account scope returned by GET. Atomic
  compare-and-swap prevents lost updates. Exact stable-ID retries after a lost
  response are idempotent; other stale changes receive a conflict without writing.
- Account switching is rejected before database access. The UI clears the old
  account's private data on identity change, ignores obsolete responses, and keeps
  network-failed drafts in memory. Fresh session verification precedes rendering
  private read/save responses, including when switching accounts during loading.
  Same-tab SPA Back/Forward can recover the draft from memory after fresh account
  and revision verification. Shared link navigation asks before discarding a draft.
  It does not write personal data to localStorage.
- A conflict requires explicit discard/reload of the newer saved ledger before
  editing again. No automatic force-overwrite or cross-account draft merging.
- The table is initialized lazily using the application's existing database
  connection configuration; no new credentials are introduced.

## Verification

`npm run test:ai-earnings` exercises arithmetic, date filtering, validation, API,
store and client flows using isolated in-memory doubles. No test connects to or
seeds the production database. Run `npm run lint`, `npx tsc --noEmit`, and
`npm run build` as aggregate checks. Existing `test:aura`, `test:aura-ui`,
`test:pricing`, `test:admin-workbench`, and `test:ai-assistant` cover regressions.

A production save/reload should be verified when the first genuine user-approved
entry is available, rather than fabricating income to exercise the live ledger.

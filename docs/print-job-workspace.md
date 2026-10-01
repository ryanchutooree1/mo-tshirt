# Print desk: quotes and jobs

The Quotes & invoices page is a queue-first print-shop workspace. It groups enquiries, quotations and linked production orders into one job without migrating or rewriting the source records.

## Categories

- New enquiry: review the request and prepare a quotation
- Needs details: clarify artwork, garments, sizes or requested changes
- Awaiting client: quote/questions sent; record what is awaited and a follow-up date
- Confirmed: client agreement or a production order exists; payment and readiness still need review
- In production: production is explicitly in progress
- Ready: printing complete, awaiting collection or delivery
- Completed: delivered/collected, or an explicit staff completion with acknowledgment
- Declined / cancelled: closed with the outcome and a reason; kept in history and reopenable

Payment is independent. Acceptance and automatic receipt creation never prove that money was received. Existing document payment labels are identified separately from verified evidence.

## Safe staff updates

`PATCH /api/admin/print-jobs/[id]` updates only `printJobWorkflow` and `printJobWorkflowHistory` on the named quotation or email intake. It does not change client decisions, send a message, update payment, change inventory or advance the production order. Closing a job offers a reviewable, editable reply draft with a copy action; there is no automatic send.

Updates require the existing quotation permission (plus inbox permission for email intake), same-origin JSON, validated fields, a version and an idempotency request ID. Reopening or moving backward requires a reason. Completion requires explicit handover acknowledgment. Concurrent edits return a conflict rather than replacing a newer workflow.

The server saves the current lifecycle evidence with each staff update. Newer or changed client/production evidence can supersede an open manual stage; payment changes cannot. Explicit completed/declined stages remain closed until staff reopen them. Earlier notes and history are retained. Both automatic email intake processing and manual conversion preserve workflow/history when creating the quotation.

## UI behavior

The default queue excludes closed work. Categories, source filters, search, sort and pagination keep the list navigable. Each job overview contains its next step, customer deadline, follow-up date, documents, payment evidence state, print brief, contact details, artwork and history. Existing quote and order editors open only on request. Back/Forward, Cancel and unsaved-edit protection cover focused editors and stage dialogs.

The list currently loads up to 500 quotes, 500 orders and 200 email enquiries, with visible limit/partial-load warnings. Older saved quotation links still open directly in the existing quotation editor. A manual workspace completion does not silently change an associated production order; its current source status remains visible.

## Verification

Run `npm run test:print-jobs`, `npm run lint`, `npx tsc --noEmit` and `npm run build`. Tests use synthetic records and in-memory request doubles; they never access production data. Regression coverage includes lifecycle/payment distinctions, source linking, permissions, malformed requests, conflicts, retry idempotency, email promotion, filtering, forms, modal interruption and editor navigation.

Workflow design references: [Printavo status guide](https://www.printavo.com/blog/status-guide/), [DecoNetwork quote overview](https://help.deconetwork.com/hc/en-us/articles/219792507-Quote-overview), [DecoNetwork order overview](https://help.deconetwork.com/hc/en-us/articles/219831527-Order-overview), and [reopening rejected quotes](https://help.deconetwork.com/hc/en-us/articles/26585307414043-Re-open-a-rejected-quote).

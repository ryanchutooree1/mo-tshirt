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

## Tanvi’s three-step handover

The current screen uses the familiar client list on the left and the selected design on the right, with one status dropdown. Saved finished-product front/back mockups are shown first; all image-safe print artwork remains visible beneath them. Blank garment base images never substitute for finished designs. Customer names support visual identification rather than replacing it.

1. Confirm the exact current quoted total with the client. Product/price edits use the existing versioned editing API; a changed price or newer adverse client response requires renewed agreement.
2. Check WhatsApp payment details against money actually received. Record the cumulative received total, date, reference and explicit verification. Fifty percent or full payment permits printing; the verified total and remaining balance stay visible. A screenshot, acceptance or an automatically generated legacy receipt does not count as verified money.
3. Review the production email’s exact recipient, finished mockups and print files, then explicitly send. The server rechecks price, payment, job eligibility and the reviewed payload. Closed, declined, delivered or cancelled work is blocked; reopening alone cannot reuse an old agreement.

The new screen never mounts the legacy quote editor and never auto-creates a receipt. Its PDF link is a read-only rendering of the saved quote/invoice, not a new payment receipt.

Owner-only test configuration is available at `/admin/quotation-approval?setup=handoff`. Recipients are stored privately in `adminSettings/printJobHandoff` and the existing partner registry; no personal email is embedded in application code. Test mode sends only to its reviewed test address. Expiry fails closed and never activates the real partner automatically. Global partner notification switches are unchanged.

No email is sent by opening a job, confirming price, recording payment, changing a status or saving test configuration. Preview and send are distinct explicit actions. Stable operation IDs protect retries; an unknown SMTP outcome blocks another send until it is investigated. No live test messages or synthetic production records are used in development.

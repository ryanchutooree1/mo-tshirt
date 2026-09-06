# Email enquiries

The admin enquiry queue is at `/admin/inbox/enquiries`. Client conversations from the last 90 days are checked using read-only Gmail access. Gemini extracts grounded details in English or French. Website quotation copies, automatic notifications and supplier pitches are excluded. Ambiguous buying intent stays in Review.

An enquiry requires a contact name, phone, product, quantity, colour, sizes (where applicable), personalisation, artwork/placement for personalised items, deadline and collection/delivery details. Company registration and VAT numbers are copied when supplied but are optional. Unknown facts remain blank. Attachments are named but not read; artwork needs a client brief or explicit reference to their attached design.

Complete enquiries create one `quotes/gmail-{threadId}` document, preserving the conversation and leaving prices empty for the owner. An existing quote is never overwritten. Incomplete enquiries remain in `emailIntake` until client replies provide the missing details. After a quote is created, subsequent messages remain available in Inbox; they do not change the quote automatically.

The Send questions button sends precisely the displayed English/French email to the client header address through existing SMTP settings, with replies directed to the connected Gmail account and threading headers preserved. Background checking never sends mail. A transaction claims each reviewed version before sending, preventing double-click duplicates. Ambiguous SMTP failures block repeat sending and require checking Gmail Sent.

## Scheduling

- GitHub Actions `Check client email enquiries` runs every five minutes and supports manual dispatch. Scheduled runs can be delayed; public-repository schedules may be disabled by GitHub after 60 days of repository inactivity. Check Actions if the last-sync time becomes stale.
- `EMAIL_INTAKE_CRON_SECRET` in GitHub must equal production `CRON_SECRET` in Vercel. The protected endpoint is `/api/cron/email-intake`.
- Vercel has a daily fallback at 04:00 UTC.
- Visible admin sessions with Inbox and Quotes permissions also request a sync every two minutes. A Firestore lease prevents overlapping syncs.
- Each run checks the latest six conversations plus six older conversations, analysing at most four changed conversations and advancing a persistent cursor when that batch is finished. Runs that invoke analysis are spaced at least 65 seconds apart; rate limits trigger an automatic cooldown. Initial backfill takes several runs. Errors and the last successful check appear in the queue.

## Configuration

Existing `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` must belong to `motshirtmauritius@gmail.com`. `GEMINI_API_KEY` or `GOOGLE_API_KEY` supplies Gemini access; `GMAIL_INTAKE_MODEL` optionally overrides `gemini-2.5-flash`. Sending uses existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.

Google OAuth external apps in Testing issue short-lived refresh tokens for Gmail access. Keep the mailbox authorization valid; change consent publishing status and reconnect as appropriate for the owner's Google project before that testing token expires.

## Verification

`node --test tests/email-intake*.{mjs,cjs} tests/email-quote*.{mjs,cjs} tests/gmail-inbox.test.mjs`

These cover evidence grounding, reply accumulation, missing fields, language, duplicate quote creation, stale previews, double-click sending, ambiguous SMTP delivery and website-copy exclusion. SMTP is mocked; no test messages are sent to clients.

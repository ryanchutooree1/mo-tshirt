# Admin Gmail inbox

`/admin/inbox` reads motshirtmauritius@gmail.com inside the admin. It supports Gmail search within the inbox, pages of 20 messages, unread indicators and a text reader. It does not send, delete, or mark messages as read; attachments are not displayed. Owners have access; other staff need the Inbox permission in admin settings.

## Connect the mailbox

1. In Google Cloud, enable the Gmail API and configure the OAuth consent screen and an OAuth client.
2. Authorize **motshirtmauritius@gmail.com** with `https://www.googleapis.com/auth/gmail.readonly` and offline access to obtain a refresh token. Use your own OAuth client credentials if using Google's OAuth Playground. Testing-mode consent can produce short-lived refresh tokens; configure the OAuth application appropriately for ongoing use.
3. Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` in the server environment (local `.env.local` and the deployment environment). Never put these in public environment variables or source control. Existing `GOOGLE_GMAIL_*` aliases are also supported.
4. Restart/redeploy and open Inbox. The server verifies the connected account before reading any messages. Reauthorize if the refresh token is revoked or expires.

SMTP credentials only support sending and cannot enable this inbox. No OAuth credentials were present locally when this feature was added, so live mailbox verification remains pending.

Reference: https://developers.google.com/workspace/gmail/api/auth/scopes

## Create a quote from a client email

Open an email in Inbox and choose **Create quote from email**. The server extracts explicitly labelled contact/business fields and identifiable product/quantity lines. All remaining email text is retained in the editable enquiry notes, and the original text is stored separately for reference. Review the details, then choose **Save to Quotes & invoices** and **Open quote draft**.

Imports require both Inbox and Quotation / Invoice permissions. Website quotation notification copies are blocked. One draft is created per Gmail conversation, with a transactional duplicate check; importing the same conversation again opens its existing draft without overwriting edits. New conversations from the same client can have separate quotes.

This is a selected-email workflow, not an automatic mailbox scan. Uncertain quantities and prices stay blank. Imported quotes start in review with totals hidden; nothing is sent to the client. Attachment filenames are retained for reference, but file contents are not parsed or copied. Add relevant artwork and files in the quote editor. Information in prose or attachment files may need manual correction.

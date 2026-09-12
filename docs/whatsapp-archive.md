# WhatsApp Business insights

`/admin/whatsapp` is an owner-only decision dashboard. It shows provisional enquiry counts, incoming product/topic mentions, reply timing, friction indicators, monthly activity and recommendations to test. Date and product filters apply to every metric and recommendation. Export metrics downloads the same filtered aggregates and definitions. The browser never receives chat text, names, phone numbers or source message IDs; there is no chat viewer or customer action.

## Definitions and limits

The unit is a distinct conversation with an incoming garment, printing or order request signal in the selected period. Reviewed personal/internal conversations, official automated accounts, broadcasts and supplier/recruitment pitches are excluded. Classification is rule-based and provisional: Creole, ambiguous phrases and image/audio-only enquiries can be missed or misclassified. `analysisReview.excludedConversations` can carry private, manually reviewed exclusions; keep those annotations in the encrypted archive, outside Git.

Products and topics use incoming text and captions, count each conversation once per category, and overlap. Outgoing price lists never count as demand. Monthly bars count conversations within each month, so returning conversations may count in several months. The latest month is partial; missing history prevents interpreting changes as proven business growth.

Reply time starts at the first request in the selected period and follows outgoing text/media through extraction time. Long text repeated across at least three conversations is classified as a template; that does not establish whether it was automated. The median includes only conversations with a non-template reply. The 24-hour rate includes only enquiries observed for at least 24 hours, including nights/weekends. Calls, email and phone-only messages are outside this measure. Friction/payment mentions are signals, not verified losses, payments or causes. Revenue, conversion and margin require order/payment reconciliation.

## Extract and import

Use Node 22 and Python 3. Keep exports outside the repository and outside `public/`.

```sh
python3 scripts/export-whatsapp-desktop.py --source '/path/to/WhatsApp.shared' --output '/private/export-folder' --account-name 'Verified business name' --account-phone '+230…'
node --env-file=/private/server.env scripts/import-whatsapp-archive.mjs /private/export-folder
# After the dry run validates counts, file hashes and encryption:
node --env-file=/private/server.env scripts/import-whatsapp-archive.mjs /private/export-folder --write
```

The extractor uses read-only SQLite connections and online backups to include committed WAL content. It exports content tables to JSON, spreadsheet-safe CSVs, cached message/profile files and a ZIP. Authentication/key stores, opaque BLOB internals and expiring remote media URLs are excluded. Exact text remains in JSON; leading formula characters are escaped in CSV. Raw scalar columns remain under `sourceRecords` for reproducibility. Verify the business account from its profile UI before extraction. Linked-device data is not a complete phone/account backup: labels, catalogues, quick replies and media may be missing.

`DATABASE_URL` points to the site's server PostgreSQL database. Encryption uses a 32+ character `WHATSAPP_ARCHIVE_ENCRYPTION_KEY`, or the existing `CRON_SECRET` with a dedicated HKDF context. Preserve the chosen secret: rotation requires re-encrypting the stored snapshots. AES-256-GCM authenticates ciphertext against its archive/file identity. A private PostgreSQL schema, revoked public grants and RLS prevent default public access. The server database role decrypts only after the API has verified the owner session. Source content never enters Git or the website build.

Imports are append-only, transactional and idempotent by SHA-256 of the exact JSON. Counts and file hashes are validated before writing, and failures roll back. The newest successfully imported snapshot is analysed. Refresh reloads that snapshot; it does not sync WhatsApp. There is no web import endpoint. Cached files remain encrypted for future authorised analysis but are not exposed by the dashboard API.

## Validation

```sh
node --test tests/whatsapp-archive.test.mjs tests/whatsapp-insights.test.mjs tests/admin-access.test.mjs
npx tsc --noEmit
npm run build
```

Check anonymous/staff denial, aggregate-only API responses, invalid filters, filtered downloads, period/product changes, empty/reset behaviour and responsive rendering. Tests cover authenticated encryption, owner access, incoming-only demand, overlapping categories, template exclusion, calendar timing, observation-window censoring and Mauritius date boundaries. Keep real-source reconciliation receipts in the private export directory, not Git.

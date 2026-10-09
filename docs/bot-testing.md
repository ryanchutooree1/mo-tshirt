# Bot Testing

Owner-only route: `/admin/bot-testing`, beside Quotes & Invoices in the admin sidebar.

This is an internal deterministic simulation. It uses three fixed synthetic customers and sample flat prices; it does not read the catalog or any business records. TEST-Q001 and TEST-I001 are example references, never real document IDs. No email, real payment, receipt or production job is created.

State lives in `sessionStorage` under `mo-tshirt:bot-testing:v1:<encoded owner user ID>`. It belongs to one browser tab and owner account. Closing the tab ends the test; Reset test clears the synthetic workflow and conversation. Storage failures fall back to memory with a visible notice. The owner session is checked on entry, before every run and when the tab regains focus. Failed or changed sessions clear the displayed state and lock the workspace.

The page has a server owner check in addition to the existing authentication proxy. Non-owners cannot use it even if its page path is in their assigned permissions. AdminChrome excludes this route and its descendants from EmailIntakeAutoSync and disables link prefetching while on the test route. The sync component aborts its browser request when unmounted; cancellation cannot undo intake already processed by the server on another page.

The new workspace and pure workflow module have no Firebase, quote store, live AI assistant, email or payment dependencies. Their only request is the read-only `/api/admin/session` check; the existing admin chrome also reads the profile.

## Model status

AI is not connected. Responses are canned deterministic workflow results. No provider key, paid provider fallback, model installation, tunnel or public local endpoint is added. Any future model connection requires separate authorization and configuration, with owner authentication and synthetic inputs kept isolated.

## Checks

`npm run test:bot-testing` exercises transitions, idempotency, invalid state restoration, owner access, reset, cancel/unmount, session changes and blocked browser storage using synthetic fixtures and mocked read-only session responses.

Browser QA uses a locally signed synthetic owner session, blocks external services, and inspects desktop/mobile light/dark layouts and outbound requests. No real business credentials or records are needed.

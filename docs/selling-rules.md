# Internal selling rules

The internal `/admin/quotation-approval/selling-rules` workspace supplies a read-only price reference and indicative calculator inside the existing quotation workspace. It does not replace the website pricing engine or reprice any stored quotation, invoice, payment, order, or production job.

This nested route reuses quotation access without changing the access-control registry, navigation permissions, or employee grants. The owner can open management from the quote reference.

## Runtime configuration

Application code contains only the five generic offer templates. All commercial prices and approved business rules are entered by the owner and persisted privately in PostgreSQL using the existing server connection. Unknown values stay `null` or `unknown`; no default quantity discount, tax treatment, stock promise, print dimensions or lead time is invented.

- `/api/admin/quotes/selling-rules` GET permits the owner, existing quotation/Tanvi scope
- PUT is owner-only, same-origin, bounded JSON, strict schema, with server-derived actor and viewer identity
- One fixed company document; callers cannot supply a tenant, account, user or document selector
- `selling_rules_configs` holds current configuration; `selling_rules_versions` is append-only version history
- Saving uses optimistic revision checks and one transaction for current configuration and audit snapshot
- Failed or conflicting reads/writes do not replace stored data with a blank template
- The UI keeps interrupted owner edits in tab memory only, scoped to the server-returned viewer. It offers explicit recovery after SPA navigation; a newer saved version locks a recovered draft against overwrite

## Calculation and commercial boundaries

- Unit price × whole-item quantity, using exact-cent arithmetic
- A selected, approved delivery option adds one charge per order; absent/unconfirmed delivery is not treated as free
- Deposit and remaining balance shown are on the item estimate only; final delivery/tax/extras and payment treatment need quote review
- Bulk threshold prompts owner review without inventing a discount
- All calculations remain indicative. Artwork, placement, garment availability and an achievable deadline require order-specific confirmation
- Printing-only and garment-plus-printing inclusion modes are separately labelled
- No automatic quote application is enabled while applicability is unresolved. Existing line snapshots and manual price audit behaviour remain unchanged

## Verification

`npm run test:selling-rules` covers validation, calculations, scoped access, request safety, compare-and-swap/audit rollback with a synthetic PostgreSQL double, and React interaction/recovery tests. These tests do not touch real customers or the production database. Run TypeScript, ESLint, quotation/production regressions and a production build before publishing. After deployment, load the internal page as the authenticated owner, save only approved values, and verify team read-only access and read-only quote-reference behaviour. Real database concurrency and browser layout checks are separate from synthetic tests.

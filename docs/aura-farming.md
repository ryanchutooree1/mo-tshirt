# X5 Aura Farming

The existing `/admin/x5-execution` route now opens a per-account, whole-life action workspace. Existing Execution projects and the Freedom Plan remain at `/admin/x5-execution/saved-work`, using their unchanged Firestore collections. No migration or deletion occurs.

## Working flows

- Define a vision and an outcome, observable success criteria, priority, adjustable target date, and ordered actions
- Today selects up to three next eligible actions, prioritizing overdue work, then priority and duration
- Action completion is separate from explicitly verified outcomes and recorded evidence
- Edit, archive/restore, reopen, reset action checks, and undo the most recent saved change
- Capture an experience in plain language, add a lesson and next action, and optionally review/adopt a reusable checklist
- Daily checklists use the device-local day, weekly ones use Monday, and on-demand checklists retain their current run until “Start again”
- Reflect on progress and the next adjustment; saved reflections do not automatically modify actions
- Optional examples are editable drafts. Nothing is seeded as a real incident, financial target, health target, or achieved result

Bosco and the user can manage the same ordinary labelled forms through the authenticated browser. This feature does not call or train an AI model.

## Persistence and access

`GET/PUT /api/admin/aura` use the existing admin session and `/admin/x5-execution` permission. Storage uses the existing PostgreSQL environment selection (`DATABASE_URL`, `POSTGRES_URL`, or `POSTGRES_PRISMA_URL`) and creates a separate `aura_workspaces` table on first use. No new external account or credential is required when the profile database is configured.

Records are keyed by the authenticated server-side session user. A non-secret account scope binds each client-loaded snapshot to that account and rejects stale tabs after an account switch. The caller never selects a database owner. Client state is cleared on detected account changes, including late-response guards.

Writes use atomic revision comparison. Same-account conflicts can reload the newest data while retaining a draft. Three-way merging preserves independent concurrent edits and asks before replacing overlapping fields; recorded checks on a removed step are also explicit conflicts. Creation drafts use stable IDs to avoid duplicate goals, lessons, or reflections after uncertain responses.

Save failures remain visible; there is no silent browser-storage fallback. An Undo applies only to the most recent confirmed local change and is cleared when a newer server version is loaded.

## Verification

Run `npm run test:aura`, `npm run test:aura-ui`, `npm run lint`, `npx tsc --noEmit --incremental false`, and `npm run build`.

The automated suite covers validation, account/page access, wrong-account stale writes, bounded request streams, SQL compare-and-swap behavior, data isolation, action/outcome separation, calendar behavior, and conflict-aware merging. PostgreSQL/store integration tests use isolated doubles; they do not mutate production data.

Isolated React/DOM integration tests also exercise create/save, slow-save input protection, double clicks, outcome evidence, achieve/reopen, lessons and checklists, conflict recovery, cancel, saved-data remount, archive/restore, reset/undo, failed saves, Back dismissal, and switched-account draft clearing. These tests use an in-memory API double and do not claim visual layout or live database verification.

The dot-cloud local browser could not access localhost (`ERR_BLOCKED_BY_CLIENT`), and direct Chromium launch was restricted by the execution sandbox. Local visual/browser verification is therefore not claimed. Production rendering and configured PostgreSQL connectivity must be checked after the authorized deployment. No development preview route, test-auth configuration, or synthetic data is shipped.

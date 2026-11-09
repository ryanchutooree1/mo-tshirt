# Keyless shop database access

The seven shop API routes use `src/lib/shops-server.ts`, which imports
`server-only`. The Firebase web SDK remains unchanged for unrelated collections.
The public shop response explicitly allows selling-price fields and does not
return buying prices or profit. Admin routes check the existing admin session
before accessing the server database.

## Production configuration

Follow [Vercel's GCP OIDC guide](https://vercel.com/docs/oidc/gcp).
Create a dedicated service account with no private keys and a dedicated Workload
Identity Federation pool/provider. Restrict trust to the intended Vercel team,
project and production environment (including stable owner/project IDs). Use the
team OIDC issuer and Google's default provider audience. Bind only the intended
production subject to the service account's Workload Identity User role.

Set these nonsecret **server-only, production-scoped** Vercel variables:

- `GCP_PROJECT_ID`: project containing the default Firestore database.
- `GCP_PROJECT_NUMBER`: numeric project number containing the identity pool.
- `GCP_SERVICE_ACCOUNT_EMAIL`: dedicated service account email.
- `GCP_WORKLOAD_IDENTITY_POOL_ID`: identity pool ID.
- `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`: provider ID.

The code derives the custom audience as
`https://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`
for Vercel's OIDC token provider. Google's external account client instead uses
`//iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`
as the STS request audience. These are distinct fields: STS requires the canonical
provider resource name without the `https:` scheme. Google exchanges the
short-lived token and impersonates the service account. Tokens and credentials must never be logged or saved in the repository.
No API key, private key, or Application Default Credentials fallback is used.

Restrict the service account's Firestore IAM grant to the `(default)` database.
The code also pins that database explicitly. Firestore IAM is database-wide, not
collection-scoped: this identity can access other documents within that database
if its server code is changed. It must not be granted access to other databases.

Initialization is lazy, so building does not require credentials. Preview/local
requests without valid federation fail closed with the route's generic error.
Do not broaden production trust to previews or copy credentials to make previews
work. Local data tests use the emulator instead.

## Rules and release order

`firestore.rules` blocks direct client access to top-level `shops` documents and
their descendants, including signed-in Firebase clients. Other collections retain
their existing permissive behavior; **this is not database-wide hardening**.
Server SDK requests are authorized by IAM, not these rules.

Global collection-group queries can now be denied because their results could
include shop descendants. No current `collectionGroup` usage was found in
`app/` or `src/`; future client queries must account for this restriction.

`firebase.json` explicitly targets only `(default)` and preserves Storage rules.
First configure federation and deploy the application. Verify public shop and
quote-options responses and authenticated admin routes. Only then publish the
Firestore rules to the explicitly selected project/default database. Verify that
direct client reads/writes fail and public API responses still work. Do not deploy
rules before the server release is serving traffic. Do not deploy other databases
or Storage as part of this change. Any rollback must be coordinated: rolling back
only the application to a web-SDK version while retaining these rules breaks shop
operations. Restoring the previous open rules would re-expose raw records.

## Local checks

Run `npm run test:shops`, `npm run test:pricing`, `npm run lint`,
`npx tsc --noEmit`, and `npm run build`.

The emulator integration test is skipped unless `FIRESTORE_EMULATOR_HOST` is set.
Start the official Firestore emulator on a loopback port with project
`demo-mo-tshirt`, then run:

```sh
NODE_ENV=test FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run test:shops
```

The adapter rejects emulator mode outside `NODE_ENV=test`, on Vercel, or for a
non-loopback hostname. Fixtures are synthetic and cleaned up. The integration
suite checks CRUD, active-only queries, public price filtering, admin-only costs,
timestamps, studio images, reorder batches, size normalization, unauthorized
operations, validation and missing-record failures. Production federation/IAM
still requires a read-only smoke test in the deployed environment.

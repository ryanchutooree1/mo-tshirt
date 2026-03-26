# Firebase Storage security

The bucket was previously public. This repo now includes Firebase Storage rules that close the bucket by default and only allow authenticated admin access to:

- `documents/**`
- `quotes/**`

## Required setup

Before deploying the new rules, create a Firebase Authentication email/password user for the admin and use the same password value as `ADMIN_PASSWORD`.

Set this env var in each environment:

```env
NEXT_PUBLIC_FIREBASE_ADMIN_EMAIL=admin@example.com
```

The login page will:

1. Create the existing admin session cookie.
2. Sign the same admin user into Firebase Auth.

That Firebase Auth session is what lets the admin pages access Firebase Storage after the bucket is no longer public.

## Deploy

Deploy the storage rules with the Firebase CLI:

```bash
firebase deploy --only storage
```

If Firebase CLI is not initialized for this project yet, run:

```bash
firebase use pocket-entreprise-app
```

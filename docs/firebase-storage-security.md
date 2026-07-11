# Firebase Storage security

The bucket was previously public. This repo now includes Firebase Storage rules that close the bucket by default and only allow authenticated admin access to:

- `documents/**`
- `quotes/**`

## Required setup

Before deploying the new rules, create a Firebase Authentication email/password user for the owner. Its password should be the password the owner uses on the admin login page.

The app defaults to `motshirtmauritius@gmail.com`. If the Firebase owner account uses a different email, set this public configuration value in each environment:

```env
NEXT_PUBLIC_FIREBASE_ADMIN_EMAIL=admin@example.com
```

Managed employee accounts are created in Firebase Authentication from Workspace Settings and use their own email and password. Do not store or copy their plain-text passwords into Firestore or another application database.

The login page will:

1. Create the existing admin session cookie.
2. Sign the same person into Firebase Auth using the credentials they entered.

That Firebase Auth session is what lets the admin pages access Firebase Storage after the bucket is no longer public. The server never returns a shared Firebase password to the browser.

The Storage rules allow the workspace owner's stable Firebase UID and active managed admins whose Firebase UID matches their `adminUsers` document. Changing the owner's email therefore does not remove Storage access. If the Firebase owner account itself is replaced, update the owner UID in `storage.rules` before deployment.

## Deploy

Deploy the storage rules with the Firebase CLI:

```bash
firebase deploy --only storage
```

The first deployment that uses `firestore.get()` may ask you to enable the IAM connection between Cloud Storage Rules and Cloud Firestore. Accept that prompt so managed-admin checks can run.

If Firebase CLI is not initialized for this project yet, run:

```bash
firebase use pocket-entreprise-app
```

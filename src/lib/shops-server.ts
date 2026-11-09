import "server-only";
import { Firestore, FieldValue } from "@google-cloud/firestore";
import { ExternalAccountClient, GoogleAuth } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";

let firestore: Firestore | undefined;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing shop server configuration: ${name}`);
  return value;
}

/** Lazy initialization: builds and unauthenticated admin requests never fetch credentials. */
function getShopDatabase(): Firestore {
  if (firestore) return firestore;

  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator) {
    // The only credential-free mode is an explicit local test emulator. Never
    // permit a deployment or a non-loopback host to silently bypass federation.
    if (process.env.NODE_ENV !== "test" || process.env.VERCEL ||
        !/^(localhost|127\.0\.0\.1):\d+$/.test(emulator)) {
      throw new Error("Shop emulator access is restricted to local tests.");
    }
    firestore = new Firestore({ projectId: "demo-mo-tshirt", databaseId: "(default)" });
    return firestore;
  }

  const projectId = required("GCP_PROJECT_ID");
  const projectNumber = required("GCP_PROJECT_NUMBER");
  const serviceAccount = required("GCP_SERVICE_ACCOUNT_EMAIL");
  const pool = required("GCP_WORKLOAD_IDENTITY_POOL_ID");
  const provider = required("GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID");
  if (!/^[a-z][a-z0-9-]+$/.test(projectId) || !/^\d+$/.test(projectNumber) ||
      !/^[a-z0-9-]+$/.test(pool) || !/^[a-z0-9-]+$/.test(provider) ||
      !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)) {
    throw new Error("Invalid shop server federation configuration.");
  }
  const audience = `https://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`;
  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    subject_token_supplier: {
      // Fetch a current request token when Google refreshes its short-lived
      // access token. Never persist or log the Vercel token or Google token.
      getSubjectToken: () => getVercelOidcToken({ audience }),
    },
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  if (!authClient) throw new Error("Unable to initialize shop server federation.");
  firestore = new Firestore({
    projectId,
    databaseId: "(default)",
    auth: new GoogleAuth({ authClient, projectId }),
    preferRest: true,
  });
  return firestore;
}

// Deliberately expose only the migrated collection, not a general admin database.
export function shopCollection() {
  return getShopDatabase().collection("shops");
}

export function shopDocument(id: string) {
  if (!id || id.includes("/")) throw new Error("Invalid shop document ID.");
  return shopCollection().doc(id);
}

export function shopBatch() {
  return getShopDatabase().batch();
}

export const serverTimestamp = () => FieldValue.serverTimestamp();

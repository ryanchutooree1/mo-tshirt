const FIREBASE_WEB_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ||
  "AIzaSyAhNoYB-MsYIy0Sk0sc1zUE_3ctGSvv5nY";

class FirebaseAuthAdminError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FirebaseAuthAdminError";
    this.code = code;
  }
}

type FirebaseResponse<T> = T & {
  error?: {
    message?: string;
  };
};

function getEndpoint(path: string) {
  return `https://identitytoolkit.googleapis.com/v1/${path}?key=${FIREBASE_WEB_API_KEY}`;
}

function readErrorCode(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return "";
}

function mapAuthErrorMessage(code: string) {
  switch (code) {
    case "EMAIL_EXISTS":
      return "A Firebase Auth account already exists for that email.";
    case "EMAIL_NOT_FOUND":
      return "No Firebase Auth account exists for that email.";
    case "INVALID_PASSWORD":
    case "INVALID_LOGIN_CREDENTIALS":
      return "Invalid email or password.";
    case "USER_DISABLED":
      return "This Firebase Auth account is disabled.";
    case "TOO_MANY_ATTEMPTS_TRY_LATER":
      return "Too many authentication attempts. Try again later.";
    default:
      return "Firebase Auth request failed.";
  }
}

async function postFirebaseAuth<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error("Firebase API key is not configured.");
  }

  const res = await fetch(getEndpoint(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => ({}))) as FirebaseResponse<T>;
  const code = readErrorCode(data);

  if (!res.ok || code) {
    throw new FirebaseAuthAdminError(code || "UNKNOWN", mapAuthErrorMessage(code));
  }

  return data as T;
}

export function isFirebaseAuthAdminError(error: unknown, code?: string) {
  if (!(error instanceof FirebaseAuthAdminError)) return false;
  return code ? error.code === code : true;
}

export async function createFirebaseEmailPasswordUser(input: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const created = await postFirebaseAuth<{
    localId: string;
    email: string;
    idToken: string;
  }>("accounts:signUp", {
    email: input.email,
    password: input.password,
    returnSecureToken: true,
  });

  if (input.displayName?.trim()) {
    try {
      await postFirebaseAuth("accounts:update", {
        idToken: created.idToken,
        displayName: input.displayName.trim(),
        returnSecureToken: false,
      });
    } catch {
      // Keep the created account even if the profile update fails.
    }
  }

  return {
    localId: created.localId,
    email: created.email,
  };
}

export async function verifyFirebaseEmailPassword(input: {
  email: string;
  password: string;
}) {
  const session = await postFirebaseAuth<{
    localId: string;
    email: string;
  }>("accounts:signInWithPassword", {
    email: input.email,
    password: input.password,
    returnSecureToken: true,
  });

  return {
    localId: session.localId,
    email: session.email,
  };
}

export async function sendFirebasePasswordResetEmail(email: string) {
  await postFirebaseAuth("accounts:sendOobCode", {
    requestType: "PASSWORD_RESET",
    email,
  });
}

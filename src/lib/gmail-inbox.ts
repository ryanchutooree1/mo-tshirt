// Server-side Gmail access. Never expose OAuth credentials to the browser.
export const INBOX_EMAIL = "motshirtmauritius@gmail.com";
export type InboxMessage = { id: string; threadId?: string; messageIdHeader?: string; receivedAtMs?: number; labels?: string[]; autoSubmitted?: string; listId?: string; replyTo?: string; attachmentNames?: string[]; subject: string; from: string; to: string; date: string; snippet: string; unread: boolean; text?: string };
type Part = { mimeType?: string; filename?: string; body?: { data?: string }; headers?: { name: string; value: string }[]; parts?: Part[] };
type Message = { id: string; threadId?: string; labelIds?: string[]; internalDate?: string; snippet?: string; payload?: Part };
export class InboxError extends Error {
  status: number;
  configured: boolean;
  constructor(message: string, status = 502, configured = true) { super(message); this.status = status; this.configured = configured; }
}
export async function createGmailConnection(savedRefreshToken?: string) {
  const env = (key: string) => (process.env[`GMAIL_${key}`] || process.env[`GOOGLE_GMAIL_${key}`] || "").trim();
  if (!env("CLIENT_ID") || !env("CLIENT_SECRET") || !(savedRefreshToken || env("REFRESH_TOKEN"))) {
    throw new InboxError("Gmail is not connected yet. Ask the website owner to configure read-only Gmail access for motshirtmauritius@gmail.com.", 503, false);
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("CLIENT_ID"), client_secret: env("CLIENT_SECRET"), refresh_token: savedRefreshToken || env("REFRESH_TOKEN"), grant_type: "refresh_token" }),
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw new InboxError("The Gmail connection has expired or is invalid. Ask the website owner to reconnect Gmail.");
  const get = async <T>(path: string, params: Record<string, string> = {}): Promise<T> => {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const result = await fetch(url, { headers: { authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw new InboxError(result.status === 404 ? "This email is no longer available." : "Gmail could not load messages. Check that the Gmail API is enabled and the connection has Gmail read-only permission.", result.status === 404 ? 404 : 502);
    return result.json();
  };
  const profile = await get<{ emailAddress: string }>("/profile");
  if (profile.emailAddress.toLowerCase() !== INBOX_EMAIL) throw new InboxError(`Connect ${INBOX_EMAIL} to use this inbox. The configured connection belongs to a different mailbox.`, 503);
  return get;
}
export function normalizeInboxMessage(message: Message, includeBody = false): InboxMessage {
  const header = (name: string) => message.payload?.headers?.find(h => h.name.toLowerCase() === name)?.value || "";
  const plain: string[] = [], html: string[] = [], attachmentNames: string[] = [];
  const walk = (part?: Part) => {
    if (!part) return;
    if (part.filename) { attachmentNames.push(part.filename); return; }
    if (part.body?.data) {
      const text = Buffer.from(part.body.data, "base64url").toString("utf8");
      if (part.mimeType === "text/plain") plain.push(text);
      if (part.mimeType === "text/html") html.push(text);
    }
    part.parts?.forEach(walk);
  };
  if (includeBody) walk(message.payload);
  // Always render as text: email HTML must never execute in the admin origin.
  const text = plain.length ? plain.join("\n\n") : html.join("\n").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?\s*>|<\/(p|div|tr)>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
  return { id: message.id, threadId: message.threadId || message.id, messageIdHeader: header("message-id"), receivedAtMs: Number(message.internalDate) || 0, labels: message.labelIds || [], autoSubmitted: header("auto-submitted"), listId: header("list-id"), replyTo: header("reply-to"), ...(includeBody ? { attachmentNames } : {}), subject: header("subject") || "(No subject)", from: header("from"), to: header("to"), date: header("date"), snippet: message.snippet || "", unread: Boolean(message.labelIds?.includes("UNREAD")), ...(includeBody ? { text: text || message.snippet || "This message has no text content." } : {}) };
}
export async function listInbox(search: string, pageToken: string, savedRefreshToken?: string) {
  const get = await createGmailConnection(savedRefreshToken);
  const list = await get<{ messages?: { id: string }[]; nextPageToken?: string }>("/messages", { labelIds: "INBOX", maxResults: "20", ...(search ? { q: search } : {}), ...(pageToken ? { pageToken } : {}) });
  const messages: InboxMessage[] = [];
  for (let i = 0; i < (list.messages?.length || 0); i += 5) {
    messages.push(...await Promise.all(list.messages!.slice(i, i + 5).map(async ({ id }) => normalizeInboxMessage(await get<Message>(`/messages/${encodeURIComponent(id)}`, { format: "metadata" })))));
  }
  return { configured: true, email: INBOX_EMAIL, messages, nextPageToken: list.nextPageToken || null };
}
export async function readInboxMessage(id: string, savedRefreshToken?: string) {
  const get = await createGmailConnection(savedRefreshToken);
  return normalizeInboxMessage(await get<Message>(`/messages/${encodeURIComponent(id)}`, { format: "full" }), true);
}

export async function readGmailThread(get: Awaited<ReturnType<typeof createGmailConnection>>, threadId: string) {
  const thread = await get<{ messages?: Message[] }>(`/threads/${encodeURIComponent(threadId)}`, { format: "full" });
  return (thread.messages || []).map(message => normalizeInboxMessage(message, true)).sort((a, b) => (a.receivedAtMs || 0) - (b.receivedAtMs || 0));
}

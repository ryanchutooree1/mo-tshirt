type GmailMessageListItem = {
  id: string;
  threadId?: string;
};

type GmailMessageListResponse = {
  messages?: GmailMessageListItem[];
  nextPageToken?: string;
};

type GmailTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GmailMessagePart = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
};

type GmailMessageResponse = {
  id: string;
  internalDate?: string;
  payload?: GmailMessagePart;
};

export type GmailQuotationStats = {
  configured: boolean;
  query: string;
  range: {
    start: string;
    end: string;
    totalMessages: number;
    uniqueClients: number;
    clientEmailsCounted: number;
    lastReceivedAt: string | null;
  };
  allTime: {
    totalMessages: number;
  };
  truncated: boolean;
};

const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";
const QUOTATION_QUERY =
  'from:motshirtmauritius@gmail.com subject:"New Website Quotation" -in:trash -in:spam';
const MAX_CLIENT_MESSAGES_TO_READ = 1000;
const MESSAGE_READ_BATCH_SIZE = 20;

function readEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function getConfig() {
  const clientId = readEnv("GMAIL_CLIENT_ID") || readEnv("GOOGLE_GMAIL_CLIENT_ID");
  const clientSecret = readEnv("GMAIL_CLIENT_SECRET") || readEnv("GOOGLE_GMAIL_CLIENT_SECRET");
  const refreshToken = readEnv("GMAIL_REFRESH_TOKEN") || readEnv("GOOGLE_GMAIL_REFRESH_TOKEN");
  const userId = readEnv("GMAIL_QUOTATION_USER") || readEnv("GMAIL_USER") || "me";

  return {
    clientId,
    clientSecret,
    refreshToken,
    userId,
    configured: Boolean(clientId && clientSecret && refreshToken),
  };
}

function toGmailDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function buildRangeQuery(start: Date, end: Date) {
  const exclusiveEnd = new Date(end);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
  return `${QUOTATION_QUERY} after:${toGmailDate(start)} before:${toGmailDate(exclusiveEnd)}`;
}

async function getAccessToken() {
  const config = getConfig();
  if (!config.configured) return null;

  const response = await fetch(GMAIL_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const body = (await response.json()) as GmailTokenResponse;
  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error || "Gmail token request failed.";
    throw new Error(detail);
  }

  return body.access_token;
}

async function gmailFetch<T>(accessToken: string, path: string, params: Record<string, string>) {
  const config = getConfig();
  const url = new URL(`${GMAIL_API_BASE}/users/${encodeURIComponent(config.userId)}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  const body = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(body.error?.message || "Gmail API request failed.");
  }

  return body as T;
}

async function listMatchingMessages(accessToken: string, query: string) {
  const messages: GmailMessageListItem[] = [];
  let pageToken = "";

  do {
    const response = await gmailFetch<GmailMessageListResponse>(accessToken, "/messages", {
      q: query,
      maxResults: "500",
      fields: "messages(id,threadId),nextPageToken",
      ...(pageToken ? { pageToken } : {}),
    });

    messages.push(...(response.messages || []));
    pageToken = response.nextPageToken || "";
  } while (pageToken);

  return messages;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function collectBodyText(part: GmailMessagePart | undefined, preferredMimeType: string, output: string[]) {
  if (!part) return;

  if (part.mimeType === preferredMimeType && part.body?.data) {
    output.push(decodeBase64Url(part.body.data));
  }

  part.parts?.forEach((child) => collectBodyText(child, preferredMimeType, output));
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function readMessageText(message: GmailMessageResponse) {
  const plainText: string[] = [];
  collectBodyText(message.payload, "text/plain", plainText);
  if (plainText.length) return plainText.join("\n");

  const htmlText: string[] = [];
  collectBodyText(message.payload, "text/html", htmlText);
  return stripHtml(htmlText.join("\n"));
}

function extractClientEmail(body: string) {
  const directMatch = body.match(/\bEmail\s+([^\s<>"']+@[^\s<>"']+)/i);
  if (directMatch?.[1]) return directMatch[1].toLowerCase();

  const fallbackMatch = body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return fallbackMatch?.[0]?.toLowerCase() || "";
}

async function readRangeClientStats(accessToken: string, messages: GmailMessageListItem[]) {
  const clientEmails = new Set<string>();
  let lastReceivedAt: string | null = null;

  const limitedMessages = messages.slice(0, MAX_CLIENT_MESSAGES_TO_READ);
  for (let index = 0; index < limitedMessages.length; index += MESSAGE_READ_BATCH_SIZE) {
    const batch = limitedMessages.slice(index, index + MESSAGE_READ_BATCH_SIZE);
    await Promise.all(
      batch.map(async (message) => {
        const response = await gmailFetch<GmailMessageResponse>(accessToken, `/messages/${message.id}`, {
          format: "full",
          fields: "id,internalDate,payload(mimeType,body(data),parts(mimeType,body(data),parts(mimeType,body(data),parts(mimeType,body(data)))))",
        });

        if (response.internalDate) {
          const receivedAt = new Date(Number(response.internalDate)).toISOString();
          if (!lastReceivedAt || receivedAt > lastReceivedAt) {
            lastReceivedAt = receivedAt;
          }
        }

        const email = extractClientEmail(readMessageText(response));
        if (email) clientEmails.add(email);
      })
    );
  }

  return {
    uniqueClients: clientEmails.size,
    clientEmailsCounted: limitedMessages.length,
    lastReceivedAt,
    truncated: messages.length > limitedMessages.length,
  };
}

export async function getGmailQuotationStats(start: Date, end: Date): Promise<GmailQuotationStats> {
  const config = getConfig();
  const rangeQuery = buildRangeQuery(start, end);
  const emptyStats = {
    configured: false,
    query: QUOTATION_QUERY,
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      totalMessages: 0,
      uniqueClients: 0,
      clientEmailsCounted: 0,
      lastReceivedAt: null,
    },
    allTime: {
      totalMessages: 0,
    },
    truncated: false,
  } satisfies GmailQuotationStats;

  if (!config.configured) return emptyStats;

  const accessToken = await getAccessToken();
  if (!accessToken) return emptyStats;

  const [rangeMessages, allTimeMessages] = await Promise.all([
    listMatchingMessages(accessToken, rangeQuery),
    listMatchingMessages(accessToken, QUOTATION_QUERY),
  ]);
  const clientStats = await readRangeClientStats(accessToken, rangeMessages);

  return {
    configured: true,
    query: QUOTATION_QUERY,
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      totalMessages: rangeMessages.length,
      uniqueClients: clientStats.uniqueClients,
      clientEmailsCounted: clientStats.clientEmailsCounted,
      lastReceivedAt: clientStats.lastReceivedAt,
    },
    allTime: {
      totalMessages: allTimeMessages.length,
    },
    truncated: clientStats.truncated,
  };
}

export type ArchiveChat = {
  id: string; jid: string; name: string; phone: string; contactId: string | null;
  archived: boolean; hidden: boolean; removed: boolean; typeCode: number;
  unreadCount: number; messageCount: number; firstMessageAt: string | null;
  lastMessageAt: string | null; lastText: string; draft: string | null;
};
export type ArchiveMessage = {
  id: string; sourceId: string | null; chatId: string; sentAt: string | null;
  direction: "incoming" | "outgoing"; sender: string | null; recipient: string | null;
  senderName: string | null; typeCode: number; text: string; starred: boolean;
  mediaMime: string | null; statusCode: number; replyToId: string | null; caption: string; contactCard: string | null;
  latitude: number | null; longitude: number | null; fileId: string | null;
  fileName: string | null; mediaId: string | null;
};
export type ArchiveFile = {
  id: string; name: string; path: string; storedName: string; bytes: number;
  sha256: string; mime: string; category: "profile" | "message";
};
export type ArchiveContact = {
  id: string; name: string; phone: string; whatsappId: string | null; lid: string | null;
  businessName: string | null; about: string | null; notes: string | null;
};
export type ArchiveCall = {
  id: string; at: string | null; direction: string; missed: boolean; video: boolean;
  durationSeconds: number; outcomeCode: number; participants: string[];
};
export type ArchiveManifest = {
  schemaVersion: 1; exportedAt: string; source: string; account: { name: string; phone: string };
  displayTimezone: string; firstMessageAt: string | null; lastMessageAt: string | null;
  counts: { chats: number; messages: number; contacts: number; calls: number; businessProfiles: number;
    labels: number; files: number; fileBytes: number };
  limitations: string[];
  quality: { duplicateMessageIds: number; messagesWithoutChat: number; chatsWithoutMessages: number;
    messagesWithoutTimestamp: number; messagesWithText: number; messagesWithLocalFile: number;
    photoRecordsWithoutLocalFile: number; sourceMessageTypes: Record<string, number>;
    sourceCounts: Record<string, Record<string, number>> };
};
export type WhatsAppArchive = {
  analysisReview?: { excludedConversations: { id: string; reason: string }[]; reviewedAt: string };
  manifest: ArchiveManifest; chats: ArchiveChat[]; messages: ArchiveMessage[];
  contacts: ArchiveContact[]; calls: ArchiveCall[]; businesses: Record<string, unknown>[];
  labels: Record<string, unknown>[]; files: ArchiveFile[]; sourceRecords: Record<string, unknown>;
};

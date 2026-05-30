export type SessionRecord = {
  id: string;
  inviteCodeId: string;
  tokenHash: string;
  deviceIdHash: string | null;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type ConversationRecord = {
  id: string;
  sessionId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageRecord = {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  messageType: "text" | "image";
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type InviteRecord = {
  id: string;
  codeHash: string;
  label: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  maxSessions: number;
  currentSessions: number;
  dailyMessageLimit: number;
  dailyImageLimit: number;
  deviceBindingRequired: boolean;
  expiresAt: string | null;
};

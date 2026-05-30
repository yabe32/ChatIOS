export type AuthResult = { authenticated: boolean };

export type Thread = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export type Message = {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  messageType: "text" | "image";
  metadata: Record<string, unknown>;
  createdAt: string;
};

const apiBase = "/api";
const deviceIdStorageKey = "chatios_device_id";

function getDeviceId(): string {
  if (typeof window === "undefined") {
    return "server";
  }

  const existing = window.localStorage.getItem(deviceIdStorageKey);
  if (existing) {
    return existing;
  }

  const generated = window.crypto?.randomUUID?.() ?? `device-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  window.localStorage.setItem(deviceIdStorageKey, generated);
  return generated;
}

function buildHeaders(initHeaders?: HeadersInit): Headers {
  const headers = new Headers(initHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("x-device-id", getDeviceId());
  return headers;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    headers: buildHeaders(init?.headers),
    ...init
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export function apiGetMe(): Promise<AuthResult> {
  return requestJson<AuthResult>("/auth/me");
}

export function apiLogin(code: string): Promise<{ session: { id: string; expiresAt: string } }> {
  return requestJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export function apiLogout(): Promise<{ ok: boolean }> {
  return requestJson("/auth/logout", { method: "POST" });
}

export function apiListThreads(): Promise<{ items: Thread[] }> {
  return requestJson("/chat/threads");
}

export function apiListMessages(threadId: string): Promise<{ items: Message[] }> {
  return requestJson(`/chat/threads/${threadId}/messages`);
}

export async function streamChat(
  payload: { conversationId?: string; message: string },
  handlers: {
    onConversation: (conversationId: string) => void;
    onDelta: (delta: string) => void;
    onDone: (data: { conversationId: string; messageId: string }) => void;
    onError: (message: string) => void;
  }
): Promise<void> {
  const response = await fetch(`${apiBase}/chat/stream`, {
    method: "POST",
    credentials: "include",
    headers: buildHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok || !response.body) {
    throw new Error("Streaming failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split(/\n\n/);
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const lines = chunk.split(/\n/);
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
      const dataLine = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (!event || !dataLine) continue;

      const data = JSON.parse(dataLine) as Record<string, unknown>;
      if (event === "conversation") handlers.onConversation(String(data.conversationId));
      if (event === "delta") handlers.onDelta(String(data.text ?? ""));
      if (event === "done") handlers.onDone({ conversationId: String(data.conversationId), messageId: String(data.messageId) });
      if (event === "error") handlers.onError(String(data.message ?? "Unknown error"));
    }
  }
}

export async function apiGenerateImage(payload: { conversationId?: string; prompt: string }): Promise<{ conversationId: string; imageId: string; imageUrl: string }> {
  return requestJson("/images/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

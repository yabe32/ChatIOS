import { FormEvent, useEffect, useRef, useState } from "react";
import { apiGenerateImage, apiListMessages, apiListThreads, apiLogout, streamChat, type Message, type Thread } from "../lib/api";

type ChatItem = Message & { optimistic?: boolean };

export function ChatPage({ onLogout }: { onLogout: () => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Ready");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiListThreads().then((result) => setThreads(result.items)).catch(() => setThreads([]));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function openThread(id: string) {
    setConversationId(id);
    const result = await apiListMessages(id);
    setMessages(result.items);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim() || busy) return;

    const prompt = input.trim();
    setInput("");
    setBusy(true);
    setStatus("Streaming response...");
    setMessages((current) => [...current, {
      id: `local-${Date.now()}`,
      role: "user",
      content: prompt,
      messageType: "text",
      metadata: {},
      createdAt: new Date().toISOString(),
      optimistic: true
    }, {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      messageType: "text",
      metadata: {},
      createdAt: new Date().toISOString(),
      optimistic: true
    }]);

    try {
      await streamChat(
        { conversationId: conversationId ?? undefined, message: prompt },
        {
          onConversation: (id) => {
            setConversationId(id);
            apiListThreads().then((result) => setThreads(result.items)).catch(() => undefined);
          },
          onDelta: (delta) => {
            setMessages((current) => {
              const next = [...current];
              for (let index = next.length - 1; index >= 0; index -= 1) {
                if (next[index].role === "assistant" && next[index].optimistic) {
                  next[index] = { ...next[index], content: `${next[index].content}${delta}` };
                  break;
                }
              }
              return next;
            });
          },
          onDone: () => {
            setMessages((current) => current.map((message) => ({ ...message, optimistic: false })));
            setStatus("Ready");
          },
          onError: (message) => {
            setMessages((current) => {
              const next = [...current];
              for (let index = next.length - 1; index >= 0; index -= 1) {
                if (next[index].role === "assistant" && next[index].optimistic) {
                  next[index] = {
                    ...next[index],
                    optimistic: false,
                    content: `Error: ${message}`
                  };
                  return next;
                }
              }

              return [...next, {
                id: `error-${Date.now()}`,
                role: "assistant",
                content: `Error: ${message}`,
                messageType: "text",
                metadata: {},
                createdAt: new Date().toISOString()
              }];
            });
          }
        }
      );
    } finally {
      setBusy(false);
      setStatus("Ready");
    }
  }

  async function generateImage() {
    if (!input.trim() || busy) return;

    const prompt = input.trim();
    setBusy(true);
    setStatus("Generating image...");

    try {
      const result = await apiGenerateImage({ conversationId: conversationId ?? undefined, prompt });
      setConversationId(result.conversationId);
      setMessages((current) => [...current, {
        id: result.imageId,
        role: "assistant",
        content: result.imageUrl,
        messageType: "image",
        metadata: { imageUrl: result.imageUrl },
        createdAt: new Date().toISOString()
      }]);
      setInput("");
      apiListThreads().then((result) => setThreads(result.items)).catch(() => undefined);
    } finally {
      setBusy(false);
      setStatus("Ready");
    }
  }

  async function logout() {
    await apiLogout();
    onLogout();
  }

  return (
    <div className="chat-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <div className="eyebrow">Workspace</div>
            <h2>ChatIOS</h2>
          </div>
          <button className="ghost-button" onClick={logout}>Logout</button>
        </div>
        <button className="secondary-button" onClick={() => { setConversationId(null); setMessages([]); }}>New chat</button>
        <div className="thread-list">
          {threads.map((thread) => (
            <button key={thread.id} className={`thread-item ${thread.id === conversationId ? "active" : ""}`} onClick={() => openThread(thread.id)}>
              <span>{thread.title ?? "Untitled chat"}</span>
              <small>{new Date(thread.updatedAt).toLocaleString()}</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="chat-panel">
        <div className="chat-header">
          <div>
            <div className="eyebrow">Private AI</div>
            <h1>Chat</h1>
          </div>
          <div className="status-pill">{status}</div>
        </div>

        <div className="messages" aria-live="polite">
          {messages.map((message) => (
            <div key={message.id} className={`bubble ${message.role} ${message.messageType === "image" ? "image" : "text"}`}>
              {message.messageType === "image" ? <img src={message.content} alt="Generated" /> : <p>{message.content}</p>}
            </div>
          ))}
          {busy ? <div className="typing">Assistant is typing...</div> : null}
          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={sendMessage}>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Send a message..." rows={3} />
          <div className="composer-actions">
            <button className="secondary-button" type="button" onClick={generateImage} disabled={busy}>Image</button>
            <button className="primary-button" type="submit" disabled={busy}>Send</button>
          </div>
        </form>
      </main>
    </div>
  );
}

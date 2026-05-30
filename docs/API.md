# API Contract

All browser traffic goes only to the backend origin. The frontend never sends requests to any AI provider.

## Authentication

### `POST /auth/login`
Request:
```json
{ "code": "INVITE-CODE" }
```

Response:
```json
{ "session": { "id": "uuid", "expiresAt": "2026-06-30T12:00:00.000Z" } }
```

The backend sets an HTTP-only session cookie.

### `GET /auth/me`
Response:
```json
{ "authenticated": true, "session": { "id": "uuid", "expiresAt": "..." } }
```

### `POST /auth/logout`
Response:
```json
{ "ok": true }
```

## Chat

### `GET /chat/threads`
Response:
```json
{ "items": [{ "id": "uuid", "title": "Hello", "updatedAt": "..." }] }
```

### `GET /chat/threads/:conversationId/messages`
Response:
```json
{ "items": [{ "id": "uuid", "role": "assistant", "content": "...", "messageType": "text", "metadata": {}, "createdAt": "..." }] }
```

### `POST /chat/stream`
Request:
```json
{ "conversationId": "uuid", "message": "Write a summary" }
```

Streaming SSE events:
```text
event: conversation
data: {"conversationId":"uuid"}

event: delta
data: {"text":"Hello"}

event: done
data: {"conversationId":"uuid","messageId":"uuid"}
```

## Images

### `POST /images/generate`
Request:
```json
{ "conversationId": "uuid", "prompt": "A futuristic chat interface" }
```

Response:
```json
{ "conversationId": "uuid", "imageId": "uuid", "imageUrl": "https://..." }
```

## Security guarantees

- Access codes are validated on the backend.
- Session tokens are issued by the backend and stored in HTTP-only cookies.
- The frontend never receives provider keys, model names, or hidden prompts.
- The backend enforces moderation and rate limiting before any provider call.

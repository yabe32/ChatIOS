# Architecture

## Layers

1. Frontend SPA
2. Backend API
3. PostgreSQL storage
4. AI provider adapter

## Request flow

1. User enters access code in the login screen.
2. Browser sends code only to the backend.
3. Backend validates the invite and issues an HTTP-only session cookie.
4. Chat and image requests go to the backend only.
5. Backend injects the system prompt, model choice, temperature, moderation, and provider credentials.
6. Backend streams assistant deltas to the browser through SSE.

## MVP boundaries

- Invite-only login
- Text chat with streaming
- Image generation
- History stored in Postgres
- Token auth with cookies

## Future extensions

- Voice input and output
- File uploads
- Admin panel for invites and usage
- Subscriptions and quotas
- Analytics

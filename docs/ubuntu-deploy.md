# Ubuntu Deployment

## Requirements

- Ubuntu 22.04 or later
- Docker Engine
- Docker Compose plugin
- TLS-capable reverse proxy: Nginx or Caddy

## Steps

1. Copy the repository to the server.
2. Create a production `.env` for the backend container.
3. Set `AI_PROVIDER_API_KEY`, `COOKIE_SECRET`, and `APP_ORIGIN`.
4. Run:
```bash
docker compose up -d --build
```
5. Put Nginx or Caddy in front of the frontend container.
6. Terminate TLS at the reverse proxy and forward `/api/*` to the backend or the frontend proxy.

## Nginx reverse proxy example

```nginx
server {
  listen 443 ssl http2;
  server_name chat.example.com;

  ssl_certificate /etc/letsencrypt/live/chat.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/chat.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:8081;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## Caddy example

```caddy
chat.example.com {
  reverse_proxy 127.0.0.1:8081
}
```

## Notes

- Keep the AI provider API key only on the backend.
- Ensure cookies are `HttpOnly`, `Secure`, and `SameSite=Strict`.
- Do not expose backend environment variables to the browser.

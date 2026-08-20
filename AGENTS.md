# AGENTS.md

Developer & AI agent operating manual for `fx-scrape`.

---

## Project Overview

- **Purpose**: OpenAI-compatible HTTP proxy server for Vercel AI Gateway (`zai/glm-5.2` and `zai/glm-5.2-fast`).
- **Runtime**: Bun + TypeScript + Elysia.
- **Entrypoint**: `src/index.ts`.

---

## Essential Commands

```bash
# Install dependencies
bun install

# Start server
bun run start

# Dev server with live reload
bun run dev

# Run all verification tests
bun test/test-e2e.ts
bun test/test-tools.ts
bun test/test-models.ts
```

---

## Architecture & Flow

```
Client (OpenAI format)
  │
  ▼
[src/proxy.ts] (Elysia routing & local key validation)
  ├── /health
  ├── /v1/models
  └── /v1/chat/completions
        │
        ├── [src/handlers/chat-completion.ts] (Non-streaming)
        └── [src/handlers/chat-streaming.ts]   (SSE streaming)
              │
              ▼
        [src/converter.ts] (Converts OpenAI messages & tools → Vercel Gateway V3 format)
              │
              ▼
        [src/gateway.ts]   (Executes HTTP POST to Vercel Gateway with retry & backoff)
              │
              ▼
        [src/auth/]        (OAuth device code flow, session storage, token refresh)
```

---

## Key Gotchas & Rules

1. **Authentication**:
   - Uses OAuth Device Code flow exclusively.
   - Reads `.session.json` (auto-refreshed when expired).
   - If missing, launches interactive OAuth Device Code flow on startup.
2. **Local Key Protection**:
   - `.key` is always auto-generated on startup if not present.
   - Incoming requests MUST send `Authorization: Bearer <key>`.
3. **Payload Structure**:
   - Vercel Gateway uses V3 specification (`prompt` with `{ role, content: [{ type: "text", text }] }`).
   - Do NOT send raw OpenAI payload directly to upstream; always convert via `src/converter.ts`.
4. **Supported Models**:
   - Strictly `zai/glm-5.2` and `zai/glm-5.2-fast`.
   - Configured in `src/config.ts`.
5. **Tool Calling Behavior**:
   - When AI invokes a tool, `content` is `null`/empty and arguments are in `tool_calls`.
   - Logger prints incoming request, IP, estimated in-tokens, actual tokens, and `ToolCall` payloads.

# FX Scrape / OpenAI Gateway Proxy

OpenAI-compatible proxy server for Vercel AI Gateway (`zai/glm-5.2` and `zai/glm-5.2-fast`) built with [Bun](https://bun.sh) and [Elysia](https://elysiajs.com).

Allows tools like Open WebUI, Cursor, Cline, LibreChat, and custom OpenAI SDK clients to interact seamlessly with Vercel AI Gateway.

---

## Features

- **Standard OpenAI API Endpoints**: `/v1/chat/completions`, `/v1/models`, and `/health`.
- **OAuth Device Code Flow**: Automatic browser-based authentication with Vercel + token caching (`.session.json`) & automatic refresh.
- **Local API Key Protection**: Optional `.key` file generation to protect proxy access.
- **Streaming & Non-Streaming**: Server-Sent Events (SSE) streaming and standard JSON responses.
- **Function / Tool Calling**: Full support for OpenAI function/tool definitions and structured call responses.
- **Granular Terminal Logging**: Colorized logs displaying Client IP, Latency, Prompt tokens, Completion tokens, and Tool call details.

---

## Requirements

- [Bun](https://bun.sh) (latest)
- [Vercel Account](https://vercel.com) (for OAuth device flow / AI Gateway access)

---

## Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/vanes430/fx-scrape.git
cd fx-scrape
bun install
```

### 2. Environment Setup (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Available environment variables:
| Variable | Default | Description |
|---|---|---|
| `HOST` | `127.0.0.1` | Proxy bind address |
| `PORT` | `11434` | Proxy port |
| `FX_SESSION_FILE` | `.session.json` | Path to cached OAuth session |
| `FX_KEY_FILE` | `.key` | Path to local proxy API key |
| `FX_MAX_RETRIES` | `3` | Gateway retry attempts |
| `FX_BASE_DELAY` | `800` | Exponential backoff base (ms) |
| `FX_MAX_DELAY` | `20000` | Maximum backoff delay (ms) |

### 3. Run Server
```bash
# Production mode
bun run start

# Development mode (watch)
bun run dev
```

On initial startup, the terminal displays an OAuth verification URL and OTP code. Open the link in a browser, approve access with your Vercel account, and the session will be saved locally.

---

## Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check (`{"status":"ok"}`) |
| `GET` | `/v1/models` | List available models |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completion |

---

## Supported Models

- `zai/glm-5.2` (Default)
- `zai/glm-5.2-fast`

---

## Client Integration Examples

Incoming requests require `Authorization: Bearer <key>`. Use the key found in `.key` (or printed on server startup).

### cURL
```bash
curl http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-proj-your-key-from-.key" \
  -d '{
    "model": "zai/glm-5.2",
    "messages": [{"role": "user", "content": "Halo apa kabar?"}]
  }'
```

### Python (OpenAI SDK)
```python
from openai import OpenAI

# Read key from .key or pass directly
client = OpenAI(
    base_url="http://127.0.0.1:11434/v1",
    api_key="sk-proj-your-key-from-.key"  # Key generated in .key file
)

response = client.chat.completions.create(
    model="zai/glm-5.2",
    messages=[{"role": "user", "content": "Explain quantum computing briefly."}],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### Node.js / TypeScript (OpenAI SDK)
```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://127.0.0.1:11434/v1",
  apiKey: "sk-proj-your-key-from-.key", // Key generated in .key file
});

const stream = await openai.chat.completions.create({
  model: "zai/glm-5.2",
  messages: [{ role: "user", content: "Hello!" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

---

## Running Tests

```bash
# E2E proxy test
bun run test

# Tool calling test
bun run test:tools

# Model list verification
bun run test:models
```

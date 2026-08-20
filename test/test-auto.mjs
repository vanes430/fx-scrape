import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const SESSION_FILE = path.join(process.cwd(), ".session.json");
const UPSTREAM_V3_URL = "https://ai-gateway.vercel.sh/v3/ai/language-model";

async function runTest() {
  let sessionData;
  try {
    sessionData = JSON.parse(await fs.readFile(SESSION_FILE, "utf-8"));
  } catch {
    console.error("Error: .session.json tidak ditemukan.");
    process.exit(1);
  }

  const model = "zai/glm-5.2";
  const sessionId = crypto.randomUUID();

  // Format payload V3 persis seperti fx-gateway-proxy
  const v3Payload = {
    prompt: [
      {
        role: "user",
        content: [{ type: "text", text: "Halo, jawab 'Hello World!' secara singkat." }],
      },
    ],
    maxOutputTokens: 1000,
    headers: {
      "user-agent": "fx/0.0.3",
      "x-title": "fx",
    },
  };

  const headers = {
    Authorization: `Bearer ${sessionData.access_token}`,
    "Content-Type": "application/json",
    "User-Agent": "fx/0.0.3",
    "HTTP-Referer": "https://github.com/vercel-labs/fx",
    "X-Title": "fx",
    "ai-gateway-protocol-version": "0.0.1",
    "ai-language-model-specification-version": "4",
    "ai-language-model-id": model,
    "ai-language-model-streaming": "true",
    "x-session-id": sessionId,
    "x-session-affinity": sessionId,
  };

  if (sessionData.team_id) {
    headers["x-vercel-ai-gateway-team"] = sessionData.team_id;
  }

  console.log(`Testing V3 Language Model Endpoint: ${UPSTREAM_V3_URL} (Model: ${model})...`);

  const response = await fetch(UPSTREAM_V3_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(v3Payload),
  });

  console.log(`Status HTTP: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Response Error Body:", errorBody);
    process.exit(1);
  }

  console.log("\n--- Streaming SSE Response ---");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.replace(/^data:\s*/, "");
      if (dataStr === "[DONE]" || dataStr === "DONE") continue;

      try {
        const event = JSON.parse(dataStr);
        if (event.type === "text-delta") {
          process.stdout.write(event.delta || "");
        } else if (event.type === "reasoning-delta") {
          process.stdout.write(event.delta || "");
        }
      } catch {}
    }
  }

  console.log("\n\n--- Selesai [SUCCESS] ---");
}

runTest().catch(console.error);


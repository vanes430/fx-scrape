import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { HOST, PORT, SUPPORTED_MODELS } from "../src/config";

const keyFile = join(process.cwd(), ".key");
const apiKey = existsSync(keyFile) ? readFileSync(keyFile, "utf-8").trim() : "sk-test";

async function testModel(modelId: string) {
  console.log(`\nTesting model: ${modelId}...`);
  try {
    const res = await fetch(`http://${HOST}:${PORT}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "Hi" }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[FAIL] ${modelId} - HTTP ${res.status}:`, errText);
      return;
    }

    const data = (await res.json()) as any;
    const reply = data.choices?.[0]?.message?.content ?? JSON.stringify(data);
    console.log(`[PASS] ${modelId} Response:\n${reply}`);
    console.log(`Usage:`, data.usage);
  } catch (err: any) {
    console.error(`[ERROR] ${modelId}:`, err.message || err);
  }
}

async function run() {
  console.log("=== Testing Proxy Endpoints ===");
  console.log(`Target: http://${HOST}:${PORT}`);
  console.log(`API Key: ${apiKey}`);

  for (const model of SUPPORTED_MODELS) {
    await testModel(model.id);
  }
}

run();

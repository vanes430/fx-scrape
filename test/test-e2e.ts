import { createProxyServer } from "../src/proxy";
import { resolveCredentials } from "../src/auth";
import { loadApiKeyFile } from "../src/auth";

async function runE2ETest() {
  console.log("Starting local test server...");
  const session = await resolveCredentials(false);
  const apiKey = loadApiKeyFile();

  const app = createProxyServer(() => session);
  const server = app.listen(18081);
  console.log(`Server listening on http://127.0.0.1:18081`);

  try {
    console.log("\n1. Testing non-streaming tool calling...");
    const res1 = await fetch("http://127.0.0.1:18081/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "zai/glm-5.2",
        messages: [{ role: "user", content: "What is the weather in Tokyo?" }],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather for a city",
              parameters: {
                type: "object",
                properties: { city: { type: "string" } },
                required: ["city"],
              },
            },
          },
        ],
      }),
    });

    const data1 = await res1.json();
    console.log("Status:", res1.status);
    console.log("Non-stream result:", JSON.stringify(data1, null, 2));

    console.log("\n2. Testing streaming chat completion...");
    const res2 = await fetch("http://127.0.0.1:18081/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "zai/glm-5.2-fast",
        messages: [{ role: "user", content: "Say hello in 3 words." }],
        stream: true,
      }),
    });

    console.log("Status:", res2.status);
    const text2 = await res2.text();
    console.log("Stream raw chunks snippet:\n", text2.slice(0, 300));
  } finally {
    server.stop();
    console.log("\nTest server stopped.");
  }
}

runE2ETest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

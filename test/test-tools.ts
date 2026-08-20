import { resolveCredentials } from "../src/auth";
import { completeGateway } from "../src/gateway";

async function testTools() {
  console.log("Testing tool calls with Vercel AI Gateway...");
  const session = await resolveCredentials(false);
  const res = await completeGateway(
    session,
    [{ role: "user", content: "What is the weather in Tokyo?" }],
    "zai/glm-5.2",
    {
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get weather for a specific city",
            parameters: {
              type: "object",
              properties: {
                city: { type: "string" },
              },
              required: ["city"],
            },
          },
        },
      ],
    },
  );

  console.log("Response:", JSON.stringify(res, null, 2));
}

testTools().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

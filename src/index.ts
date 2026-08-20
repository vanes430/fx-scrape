import { resolveCredentials, loadApiKeyFile, type Session } from "./auth";
import { createProxyServer } from "./proxy";
import { HOST, PORT, SUPPORTED_MODELS } from "./config";

let activeSession: Session | null = null;

async function getSession(): Promise<Session> {
  activeSession = await resolveCredentials(false);
  return activeSession;
}

async function main() {
  console.log("=========================================");
  console.log("     FX AI Gateway OpenAI Proxy          ");
  console.log("=========================================");

  try {
    activeSession = await resolveCredentials(true);
    console.log("Authentication successful.");
  } catch (err: any) {
    console.error("Authentication failed:", err?.message || err);
    process.exit(1);
  }

  const localKey = loadApiKeyFile();

  const app = createProxyServer(getSession);

  app.listen({ hostname: HOST, port: PORT }, () => {
    console.log(`\nProxy server running on http://${HOST}:${PORT}`);
    console.log(`- OpenAI Endpoint: http://${HOST}:${PORT}/v1/chat/completions`);
    console.log(`- Models Endpoint: http://${HOST}:${PORT}/v1/models`);
    console.log(`- Health Check:    http://${HOST}:${PORT}/health`);
    console.log(`- API Key (Local): ${localKey}`);

    console.log("\nAvailable Models:");
    for (const m of SUPPORTED_MODELS) {
      console.log(`  * ${m.id}`);
    }
    console.log("");
  });
}

main().catch(console.error);

import { join } from "path";

export const ISSUER = "https://vercel.com";
export const CLIENT_ID = "cl_zzh5hiOZbwJ9bfqEcYqPIJv3TaPaEYL0";
export const GATEWAY_URL = "https://ai-gateway.vercel.sh/v3/ai/language-model";
export const USER_AGENT = "fx/0.0.3";

export const SESSION_FILE = process.env.FX_SESSION_FILE ?? join(process.cwd(), ".session.json");
export const FX_KEY_FILE = process.env.FX_KEY_FILE ?? join(process.cwd(), ".key");

// Proxy server
export const HOST = process.env.HOST ?? "127.0.0.1";
export const PORT = parseInt(process.env.PORT ?? "11434", 10);

// Models exposed via /v1/models
export const SUPPORTED_MODELS = [
  { id: "zai/glm-5.2", object: "model", owned_by: "zai" },
  { id: "zai/glm-5.2-fast", object: "model", owned_by: "zai" },
];

export const DEFAULT_MODEL = "zai/glm-5.2";

export const MAX_RETRIES = parseInt(process.env.FX_MAX_RETRIES ?? "3", 10);
export const BASE_DELAY_MS = parseFloat(process.env.FX_BASE_DELAY ?? "800");
export const MAX_DELAY_MS = parseFloat(process.env.FX_MAX_DELAY ?? "20000");

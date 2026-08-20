import { Elysia, t } from "elysia";
import pc from "picocolors";
import { SUPPORTED_MODELS } from "./config";
import type { Session } from "./types";
import { loadApiKeyFile } from "./auth";
import { formatStatus, logIncomingRequest, logRequest } from "./logger";
import { handleNonStreamingChat } from "./handlers/chat-completion";
import { handleStreamingChat } from "./handlers/chat-streaming";

function getClientIp(headers: Record<string, string | undefined>, serverIp?: string): string {
  const xForwardedFor = headers["x-forwarded-for"];
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  const xRealIp = headers["x-real-ip"];
  if (xRealIp) return xRealIp.trim();
  return serverIp || "127.0.0.1";
}

export function createProxyServer(getSession: () => Promise<Session> | Session) {
  return new Elysia()
    .get("/health", () => ({ status: "ok" }))
    .get("/v1/models", () => ({
      object: "list",
      data: SUPPORTED_MODELS,
    }))
    .post(
      "/v1/chat/completions",
      async ({ body, headers, set }) => {
        const startTime = Date.now();
        const clientIp = getClientIp(headers);
        const authHeader = headers.authorization;
        const validKey = loadApiKeyFile();

        if (validKey) {
          const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7).trim()
            : authHeader?.trim();

          if (!token || token !== validKey) {
            set.status = 401;
            console.log(
              `\n${pc.dim("──────────────────────────────────────────────────")}\n` +
                `${pc.cyan(pc.bold("[POST /v1/chat/completions]"))} ${formatStatus(401)}\n` +
                `  ${pc.bold("Client IP:")} ${pc.gray(clientIp)}\n` +
                `  ${pc.bold("Error    :")} ${pc.red("Incorrect API key provided.")}\n` +
                `${pc.dim("──────────────────────────────────────────────────")}\n`,
            );
            return {
              error: {
                message: "Incorrect API key provided.",
                type: "invalid_request_error",
                code: "invalid_api_key",
              },
            };
          }
        }

        const providedToolCount = Array.isArray(body.tools) ? body.tools.length : 0;
        const stream = Boolean(body.stream);

        logIncomingRequest({
          endpoint: "POST /v1/chat/completions",
          ip: clientIp,
          model: body.model || "default",
          isStream: stream,
          toolCount: providedToolCount,
          tools: body.tools,
          prompt: body.messages,
        });

        const session = await getSession();

        if (!stream) {
          try {
            return await handleNonStreamingChat(body, session, startTime, providedToolCount, clientIp);
          } catch (err: any) {
            set.status = 500;
            const duration = Date.now() - startTime;
            logRequest({
              endpoint: "POST /v1/chat/completions",
              ip: clientIp,
              status: 500,
              model: body.model || "default",
              durationMs: duration,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              toolCount: providedToolCount,
              response: "",
              isStream: false,
              error: err?.message || String(err),
            });
            return {
              error: {
                message: err?.message || String(err),
                type: "gateway_error",
              },
            };
          }
        }

        set.headers["content-type"] = "text/event-stream";
        set.headers["cache-control"] = "no-cache";
        set.headers["connection"] = "keep-alive";

        return handleStreamingChat(body, session, startTime, providedToolCount, clientIp);
      },
      {
        body: t.Object({
          model: t.Optional(t.String()),
          messages: t.Array(t.Any()),
          stream: t.Optional(t.Boolean()),
          max_tokens: t.Optional(t.Number()),
          temperature: t.Optional(t.Number()),
          tools: t.Optional(t.Array(t.Any())),
          tool_choice: t.Optional(t.Any()),
        }),
      },
    );
}

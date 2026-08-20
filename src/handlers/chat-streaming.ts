import { randomUUID } from "crypto";
import type { ChatMessage, Session, ToolCall } from "../types";
import { streamGateway, resolveModel } from "../gateway";
import { logRequest } from "../logger";

export function handleStreamingChat(
  body: any,
  session: Session,
  startTime: number,
  providedToolCount: number,
  clientIp?: string,
): Response {
  const model = resolveModel(body.model);
  const messages = body.messages as ChatMessage[];
  const created = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-${randomUUID()}`;

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let streamContent = "";
        let promptTokens = 0;
        let completionTokens = 0;
        const streamedToolCalls = new Map<string, ToolCall>();
        const toolCallIndices = new Map<string, number>();
        let currentToolIdx = 0;

        const send = (data: Record<string, unknown> | string) => {
          if (data === "[DONE]") {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          }
        };

        try {
          for await (const chunk of streamGateway(session, messages, model, {
            maxTokens: body.max_tokens,
            temperature: body.temperature,
            tools: body.tools,
            tool_choice: body.tool_choice,
          })) {
            if (chunk.type === "text-delta" && chunk.delta) {
              streamContent += chunk.delta;
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: { content: chunk.delta },
                    finish_reason: null,
                  },
                ],
              });
            } else if (chunk.type === "reasoning-delta" && chunk.delta) {
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: { reasoning_content: chunk.delta },
                    finish_reason: null,
                  },
                ],
              });
            } else if (chunk.type === "tool-input-start") {
              const tcId = chunk.id || randomUUID();
              const toolName = chunk.toolName || "";
              toolCallIndices.set(tcId, currentToolIdx);
              streamedToolCalls.set(tcId, {
                id: tcId,
                type: "function",
                function: { name: toolName, arguments: "" },
              });
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: currentToolIdx,
                          id: tcId,
                          type: "function",
                          function: {
                            name: toolName,
                            arguments: "",
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              });
              currentToolIdx++;
            } else if (chunk.type === "tool-input-delta") {
              const tcId = chunk.id || "";
              const idx = toolCallIndices.get(tcId) ?? 0;
              const deltaArgs = chunk.delta || "";
              const tc = streamedToolCalls.get(tcId);
              if (tc) tc.function.arguments += deltaArgs;
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: idx,
                          function: {
                            arguments: deltaArgs,
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              });
            } else if (chunk.type === "tool-call") {
              const tcId = chunk.toolCallId || chunk.id || randomUUID();
              const idx = currentToolIdx++;
              const argsStr =
                typeof chunk.input === "string"
                  ? chunk.input
                  : JSON.stringify(chunk.input ?? {});
              streamedToolCalls.set(tcId, {
                id: tcId,
                type: "function",
                function: { name: chunk.toolName || "", arguments: argsStr },
              });
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: idx,
                          id: tcId,
                          type: "function",
                          function: {
                            name: chunk.toolName,
                            arguments:
                              typeof chunk.input === "string"
                                ? chunk.input
                                : JSON.stringify(chunk.input ?? {}),
                          },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              });
            } else if (chunk.type === "finish") {
              const rawReason =
                typeof chunk.finishReason === "object"
                  ? chunk.finishReason?.unified ?? chunk.finishReason?.raw ?? "stop"
                  : chunk.finishReason || "stop";
              let finishReason = "stop";
              if (rawReason === "tool-calls" || rawReason === "tool_calls") finishReason = "tool_calls";
              else if (rawReason === "length") finishReason = "length";

              if (chunk.usage) {
                const u = chunk.usage;
                promptTokens = u.inputTokens?.total ?? u.raw?.prompt_tokens ?? u.promptTokens ?? 0;
                completionTokens = u.outputTokens?.total ?? u.raw?.completion_tokens ?? u.completionTokens ?? 0;
              }

              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: finishReason,
                  },
                ],
                ...(promptTokens + completionTokens > 0
                  ? {
                      usage: {
                        prompt_tokens: promptTokens,
                        completion_tokens: completionTokens,
                        total_tokens: promptTokens + completionTokens,
                      },
                    }
                  : {}),
              });
            } else if (chunk.type === "error") {
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model,
                error: chunk.error,
              });
            }
          }
          send("[DONE]");

          const duration = Date.now() - startTime;
          const totalTokens = promptTokens + completionTokens;
          logRequest({
            endpoint: "POST /v1/chat/completions",
            ip: clientIp,
            status: 200,
            model,
            durationMs: duration,
            promptTokens,
            completionTokens,
            totalTokens,
            toolCount: providedToolCount,
            prompt: messages,
            response: streamContent,
            toolCalls: [...streamedToolCalls.values()],
            isStream: true,
          });
        } catch (err: any) {
          const duration = Date.now() - startTime;
          logRequest({
            endpoint: "POST /v1/chat/completions",
            status: 500,
            model,
            durationMs: duration,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            toolCount: providedToolCount,
            response: streamContent,
            isStream: true,
            error: err?.message || String(err),
          });
          send({
            id,
            object: "chat.completion.chunk",
            created,
            model,
            error: err?.message || String(err),
          });
          send("[DONE]");
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
}

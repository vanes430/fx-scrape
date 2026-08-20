import { randomUUID } from "crypto";
import type { ChatMessage, CompletionResult, Session } from "../types";
import { completeGateway, resolveModel } from "../gateway";
import { logRequest } from "../logger";

export async function handleNonStreamingChat(
  body: any,
  session: Session,
  startTime: number,
  providedToolCount: number,
  clientIp?: string,
) {
  const model = resolveModel(body.model);
  const messages = body.messages as ChatMessage[];
  const created = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-${randomUUID()}`;

  const res: CompletionResult = await completeGateway(session, messages, model, {
    maxTokens: body.max_tokens,
    temperature: body.temperature,
    tools: body.tools,
    tool_choice: body.tool_choice,
  });

  const duration = Date.now() - startTime;
  const promptTokens = res.usage.promptTokens;
  const completionTokens = res.usage.completionTokens;
  const totalTokens = res.usage.totalTokens;

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
    response: res.content,
    toolCalls: res.toolCalls,
    isStream: false,
  });

  return {
    id,
    object: "chat.completion",
    created,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: res.content || null,
          ...(res.reasoning ? { reasoning_content: res.reasoning } : {}),
          ...(res.toolCalls.length > 0 ? { tool_calls: res.toolCalls } : {}),
        },
        finish_reason: res.finishReason || "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  };
}

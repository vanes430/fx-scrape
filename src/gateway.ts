import { randomUUID } from "crypto";
import {
  GATEWAY_URL,
  USER_AGENT,
  DEFAULT_MODEL,
  MAX_RETRIES,
  BASE_DELAY_MS,
  MAX_DELAY_MS,
} from "./config";
import type { Session, ChatMessage, StreamChunk, CompletionResult, ToolCall } from "./types";
import { convertMessagesToV3, convertToolsToV3, convertToolChoiceToV3 } from "./converter";

export type { ChatMessage, StreamChunk, CompletionResult, ToolCall };

export function resolveModel(requested: string): string {
  return requested || DEFAULT_MODEL;
}

function backoffDelay(attempt: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
}

function buildHeaders(session: Session, model: string, sessionId: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
    "User-Agent": USER_AGENT,
    "HTTP-Referer": "https://github.com/vercel-labs/fx",
    "X-Title": "fx",
    "ai-gateway-protocol-version": "0.0.1",
    "ai-language-model-specification-version": "4",
    "ai-language-model-id": model,
    "ai-language-model-streaming": "true",
    "x-session-id": sessionId,
    "x-session-affinity": sessionId,
  };
  if (session.team_id) h["x-vercel-ai-gateway-team"] = session.team_id;
  return h;
}

export async function* streamGateway(
  session: Session,
  messages: ChatMessage[],
  model: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    tools?: unknown[];
    tool_choice?: unknown;
    toolChoice?: unknown;
    sessionId?: string;
  } = {},
): AsyncGenerator<StreamChunk> {
  const resolvedModel = resolveModel(model);
  const sessionId = options.sessionId ?? randomUUID();

  const v3Payload: Record<string, unknown> = {
    prompt: convertMessagesToV3(messages),
    maxOutputTokens: options.maxTokens ?? 4096,
    headers: { "user-agent": USER_AGENT, "x-title": "fx" },
  };
  if (options.temperature !== undefined) v3Payload.temperature = options.temperature;
  const convertedTools = convertToolsToV3(options.tools);
  if (convertedTools && convertedTools.length > 0) {
    v3Payload.tools = convertedTools;
    v3Payload.toolChoice = convertToolChoiceToV3(options.toolChoice ?? options.tool_choice);
  }

  const RETRYABLE = new Set([429, 500, 502, 503, 504]);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: buildHeaders(session, resolvedModel, sessionId),
        body: JSON.stringify(v3Payload),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
        continue;
      }
      yield { type: "error", error: String(err) };
      return;
    }

    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      await res.body?.cancel();
      await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      yield { type: "error", error: `HTTP ${res.status}: ${body}` };
      return;
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop()!;
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        if (raw === "[DONE]" || raw === "DONE") break;
        try {
          const event = JSON.parse(raw) as StreamChunk;
          yield event;
        } catch {}
      }
    }
    return;
  }
}

export async function completeGateway(
  session: Session,
  messages: ChatMessage[],
  model: string,
  options: {
    maxTokens?: number;
    temperature?: number;
    tools?: unknown[];
    tool_choice?: unknown;
    toolChoice?: unknown;
    sessionId?: string;
  } = {},
): Promise<CompletionResult> {
  const content: string[] = [];
  const reasoning: string[] = [];
  const toolCalls: Map<string, ToolCall> = new Map();
  let finishReason = "stop";
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  for await (const event of streamGateway(session, messages, model, options)) {
    if (event.type === "text-delta") content.push(event.delta ?? "");
    else if (event.type === "reasoning-delta") reasoning.push(event.delta ?? "");
    else if (event.type === "tool-input-start") {
      toolCalls.set(event.id!, {
        id: event.id!,
        type: "function",
        function: { name: event.toolName ?? "", arguments: "" },
      });
    } else if (event.type === "tool-input-delta") {
      const tc = toolCalls.get(event.id!);
      if (tc) tc.function.arguments += event.delta ?? "";
    } else if (event.type === "tool-call") {
      const id = event.toolCallId ?? event.id ?? randomUUID();
      const args = event.input;
      toolCalls.set(id, {
        id,
        type: "function",
        function: {
          name: event.toolName ?? "",
          arguments: typeof args === "string" ? args : JSON.stringify(args ?? {}),
        },
      });
    } else if (event.type === "finish") {
      const fr = event.finishReason;
      if (fr && typeof fr === "object") finishReason = fr.unified ?? fr.raw ?? "stop";
      else if (typeof fr === "string") finishReason = fr;
      if (event.usage) {
        const u = event.usage;
        const promptTokens = u.inputTokens?.total ?? u.raw?.prompt_tokens ?? u.promptTokens ?? 0;
        const completionTokens = u.outputTokens?.total ?? u.raw?.completion_tokens ?? u.completionTokens ?? 0;
        const totalTokens = u.raw?.total_tokens ?? u.totalTokens ?? promptTokens + completionTokens;
        usage = {
          promptTokens,
          completionTokens,
          totalTokens,
        };
      }
    } else if (event.type === "error") {
      throw new Error(event.error);
    }
  }

  return {
    content: content.join(""),
    reasoning: reasoning.join(""),
    toolCalls: [...toolCalls.values()],
    finishReason,
    usage,
  };
}

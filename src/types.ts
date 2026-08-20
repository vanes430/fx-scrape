export interface Session {
  access_token: string;
  refresh_token?: string;
  team_id?: string | null;
  expires_at?: number; // ms epoch
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface StreamChunk {
  type: "text-delta" | "reasoning-delta" | "tool-input-start" | "tool-input-delta" | "tool-call" | "finish" | "error";
  delta?: string;
  id?: string;
  toolName?: string;
  toolCallId?: string;
  input?: unknown;
  finishReason?: { unified?: string; raw?: string } | string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    inputTokens?: { total?: number };
    outputTokens?: { total?: number };
    raw?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  error?: string;
}

export interface CompletionResult {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

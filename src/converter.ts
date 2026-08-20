import { randomUUID } from "crypto";
import { USER_AGENT } from "./config";
import type { ChatMessage, ContentPart } from "./types";

export function extractText(content: string | ContentPart[] | null | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return content.map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("");
}

export function convertToolsToV3(tools: unknown[] | undefined): unknown[] | undefined {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((t: any) => {
    if (t?.type === "function") {
      const fn = t.function ?? {};
      return {
        type: "function",
        name: fn.name ?? t.name ?? "",
        description: fn.description ?? t.description ?? "",
        inputSchema: fn.parameters ?? t.inputSchema ?? t.parameters ?? { type: "object", properties: {} },
      };
    }
    return t;
  });
}

export function convertToolChoiceToV3(tc: unknown): Record<string, unknown> | undefined {
  if (!tc) return { type: "auto" };
  if (typeof tc === "string") {
    if (tc === "auto" || tc === "none" || tc === "required") {
      return { type: tc };
    }
    return { type: "tool", toolName: tc };
  }
  if (typeof tc === "object" && tc !== null) {
    const obj = tc as any;
    if (obj.type === "function" && obj.function?.name) {
      return { type: "tool", toolName: obj.function.name };
    }
    if (obj.type) return obj;
  }
  return { type: "auto" };
}

export function convertMessagesToV3(messages: ChatMessage[]): unknown[] {
  return messages.map((msg) => {
    if (msg.role === "system") return { role: "system", content: extractText(msg.content as string | ContentPart[]) };

    if (msg.role === "tool") {
      const outStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? {});
      return {
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId: msg.tool_call_id ?? "",
          toolName: msg.name ?? "tool",
          output: { type: "text", value: outStr || "{}" },
        }],
      };
    }

    if (msg.role === "assistant") {
      const parts: unknown[] = [];
      const text = extractText(msg.content as string | ContentPart[]);
      if (text && text.trim()) parts.push({ type: "text", text });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          const fn = tc.function ?? {};
          let args: unknown = {};
          try {
            args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments;
          } catch {
            args = fn.arguments ?? {};
          }
          parts.push({
            type: "tool-call",
            toolCallId: tc.id || randomUUID(),
            toolName: fn.name ?? "",
            input: typeof args === "object" && args !== null ? args : {},
          });
        }
      }
      if (parts.length === 0) parts.push({ type: "text", text: " " });
      return { role: "assistant", content: parts };
    }

    // user
    const raw = msg.content;
    if (typeof raw === "string") {
      return { role: "user", content: [{ type: "text", text: raw.trim() ? raw : " " }] };
    }
    const parts = (raw as ContentPart[]).map((p) => {
      if (p.type === "image_url" && p.image_url?.url) {
        const url = p.image_url.url;
        if (url.startsWith("data:")) {
          const [header, b64] = url.split(",");
          const media = header.split(";")[0].split(":")[1] ?? "image/png";
          return { type: "file", mediaType: media, data: b64 };
        }
        const ext = url.split(".").pop()?.toLowerCase() ?? "png";
        const media: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };
        return { type: "file", mediaType: media[ext] ?? "image/png", data: url };
      }
      return { type: "text", text: p.text && p.text.trim() ? p.text : " " };
    });
    if (parts.length === 0) parts.push({ type: "text", text: " " });
    return { role: "user", content: parts };
  });
}

import pc from "picocolors";
import type { ChatMessage, ToolCall } from "./types";

export interface LogRequestStartInfo {
  endpoint: string;
  ip?: string;
  model: string;
  isStream?: boolean;
  toolCount: number;
  prompt?: string | ChatMessage[];
}

export interface LogRequestInfo {
  endpoint: string;
  ip?: string;
  status: number;
  model: string;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  toolCount: number;
  prompt?: string | ChatMessage[];
  response: string;
  toolCalls?: ToolCall[];
  isStream?: boolean;
  error?: string;
}

export function formatStatus(status: number): string {
  if (status >= 200 && status < 300) return pc.green(`${status}`);
  if (status >= 400 && status < 500) return pc.yellow(`${status}`);
  return pc.red(`${status}`);
}

export function truncateText(text: string, maxLen = 80): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen)}...`;
}

function extractLastUserPrompt(prompt?: string | ChatMessage[]): string {
  if (!prompt) return "";
  if (typeof prompt === "string") return prompt;
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i];
    if (msg.role === "user") {
      if (typeof msg.content === "string") return msg.content;
      if (Array.isArray(msg.content)) {
        return msg.content
          .map((c) => (c.type === "text" ? c.text || "" : `[${c.type}]`))
          .join(" ");
      }
    }
  }
  const last = prompt[prompt.length - 1];
  if (!last) return "";
  return typeof last.content === "string" ? last.content : JSON.stringify(last.content);
}

function estimateTokens(prompt?: string | ChatMessage[], tools?: unknown[]): number {
  let charCount = 0;
  if (prompt) {
    if (typeof prompt === "string") {
      charCount += prompt.length;
    } else if (Array.isArray(prompt)) {
      for (const msg of prompt) {
        if (typeof msg.content === "string") {
          charCount += msg.content.length;
        } else if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c.type === "text" && c.text) charCount += c.text.length;
          }
        }
      }
    }
  }
  if (tools && Array.isArray(tools)) {
    charCount += JSON.stringify(tools).length;
  }
  return Math.ceil(charCount / 4);
}

export function logIncomingRequest(info: LogRequestStartInfo & { tools?: unknown[] }): void {
  const border = pc.dim("──────────────────────────────────────────────────");
  const typeTag = info.isStream ? pc.dim("(stream)") : "";
  const inputSummary = extractLastUserPrompt(info.prompt);
  const estimatedIn = estimateTokens(info.prompt, info.tools);

  console.log(`\n${border}`);
  console.log(`${pc.blue(pc.bold(`--> [INCOMING ${info.endpoint} ${typeTag}]`))}`);
  if (info.ip) {
    console.log(`  ${pc.bold("Client IP:")} ${pc.gray(info.ip)}`);
  }
  console.log(`  ${pc.bold("Model    :")} ${pc.magenta(info.model)}`);
  console.log(`  ${pc.bold("In Tokens:")} ${pc.blue(`~${estimatedIn}`)} ${pc.dim("(est)")}`);
  console.log(
    `  ${pc.bold("Tools    :")} ${
      info.toolCount > 0 ? pc.green(`${info.toolCount}`) : pc.dim("0")
    }`,
  );
  if (inputSummary) {
    console.log(`  ${pc.bold("Prompt   :")} ${pc.white(`"${truncateText(inputSummary, 120)}"`)}`);
  }
  console.log(`${border}`);
}

export function logRequest(info: LogRequestInfo): void {
  const border = pc.dim("──────────────────────────────────────────────────");
  const typeTag = info.isStream ? pc.dim("(stream)") : "";
  console.log(`\n${border}`);
  console.log(`${pc.cyan(pc.bold(`<-- [RESPONSE ${info.endpoint} ${typeTag}]`))} ${formatStatus(info.status)}`);
  if (info.ip) {
    console.log(`  ${pc.bold("Client IP:")} ${pc.gray(info.ip)}`);
  }
  console.log(`  ${pc.bold("Model    :")} ${pc.magenta(info.model)}`);
  console.log(`  ${pc.bold("Latency  :")} ${pc.yellow(`${info.durationMs}ms`)}`);
  console.log(`  ${pc.bold("In Tokens:")} ${pc.blue(String(info.promptTokens))} ${pc.dim("(actual)")}`);
  console.log(`  ${pc.bold("OutTokens:")} ${pc.blue(String(info.completionTokens))}`);
  console.log(`  ${pc.bold("TotTokens:")} ${pc.bold(String(info.totalTokens))}`);
  if (info.error) {
    console.log(`  ${pc.bold("Error    :")} ${pc.red(info.error)}`);
  } else {
    if (info.response) {
      console.log(`  ${pc.bold("Output   :")} ${pc.dim(`"${truncateText(info.response, 120)}"`)}`);
    }
    if (info.toolCalls && info.toolCalls.length > 0) {
      for (const tc of info.toolCalls) {
        const fnName = pc.cyan(tc.function.name);
        const fnArgs = pc.dim(truncateText(tc.function.arguments || "{}", 100));
        console.log(`  ${pc.bold("ToolCall :")} ${fnName}(${fnArgs})`);
      }
    }
    if (!info.response && (!info.toolCalls || info.toolCalls.length === 0)) {
      console.log(`  ${pc.bold("Output   :")} ${pc.dim('""')}`);
    }
  }
  console.log(`${border}\n`);
}

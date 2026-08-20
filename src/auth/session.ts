import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { SESSION_FILE } from "../config";
import type { Session } from "../types";

export function loadSession(): Session | null {
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf-8")) as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  const dir = dirname(SESSION_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
}

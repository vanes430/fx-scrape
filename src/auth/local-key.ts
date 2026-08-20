import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { randomBytes } from "crypto";
import { FX_KEY_FILE } from "../config";

export function generateRandomKey(): string {
  return `sk-proj-${randomBytes(32).toString("hex")}`;
}

export function loadApiKeyFile(): string {
  try {
    if (existsSync(FX_KEY_FILE)) {
      const raw = readFileSync(FX_KEY_FILE, "utf-8").trim();
      const keys = raw.split(/[\n,]+/).map((k) => k.trim()).filter(Boolean);
      if (keys.length > 0 && keys[0]) {
        return keys[0];
      }
    }
  } catch {}

  const key = generateRandomKey();
  const dir = dirname(FX_KEY_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(FX_KEY_FILE, key, "utf-8");
  console.log(`Generated new API key saved to ${FX_KEY_FILE}: ${key}`);
  return key;
}

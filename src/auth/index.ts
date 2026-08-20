import type { Session } from "../types";
import { loadSession } from "./session";
import { refreshToken, loginOAuth } from "./oauth";

export type { Session } from "../types";
export { loadSession, saveSession } from "./session";
export { loadApiKeyFile, generateRandomKey } from "./local-key";
export { loginOAuth, refreshToken } from "./oauth";

export async function ensureValidSession(session: Session): Promise<Session> {
  const SKEW_MS = 60_000;
  if (session.expires_at && Date.now() > session.expires_at - SKEW_MS) {
    const refreshed = await refreshToken(session);
    if (refreshed) return refreshed;
  }
  return session;
}

export async function resolveCredentials(interactive = true): Promise<Session> {
  const session = loadSession();
  if (session) return ensureValidSession(session);

  if (!interactive) throw new Error("No session found. Run proxy to authenticate via OAuth Device Flow.");
  return loginOAuth();
}

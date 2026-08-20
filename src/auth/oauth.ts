import { ISSUER, CLIENT_ID } from "../config";
import type { Session } from "../types";
import { saveSession } from "./session";

interface OidcMeta {
  device_authorization_endpoint: string;
  token_endpoint: string;
}

export async function fetchOidc(): Promise<OidcMeta> {
  const res = await fetch(`${ISSUER}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error("Failed to fetch OIDC metadata");
  return res.json() as Promise<OidcMeta>;
}

export async function refreshToken(session: Session): Promise<Session | null> {
  if (!session.refresh_token) return null;
  try {
    const oidc = await fetchOidc();
    const res = await fetch(oidc.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: session.refresh_token,
      }).toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, string | number>;
    if (!data.access_token) return null;
    const updated: Session = {
      access_token: data.access_token as string,
      refresh_token: (data.refresh_token as string) ?? session.refresh_token,
      team_id: session.team_id,
      expires_at: data.expires_in ? Date.now() + (data.expires_in as number) * 1000 : undefined,
    };
    saveSession(updated);
    return updated;
  } catch {
    return null;
  }
}

export async function loginOAuth(): Promise<Session> {
  const oidc = await fetchOidc();

  const devRes = await fetch(oidc.device_authorization_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: "openid offline_access" }).toString(),
  });
  if (!devRes.ok) throw new Error("Failed to start device authorization");
  const devAuth = (await devRes.json()) as Record<string, string | number>;

  const authUrl = (devAuth.verification_uri_complete ?? devAuth.verification_uri) as string;
  console.log("\n=======================================================");
  console.log(`Open URL : ${authUrl}`);
  console.log(`Code     : ${devAuth.user_code}`);
  console.log("=======================================================");
  console.log("Waiting for browser authorization...\n");

  const interval = ((devAuth.interval as number) || 5) * 1000;
  const expiresAt = Date.now() + (devAuth.expires_in as number) * 1000;
  let tokenData: Record<string, string> | null = null;

  while (Date.now() < expiresAt) {
    await new Promise((r) => setTimeout(r, interval));
    const tokenRes = await fetch(oidc.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: devAuth.device_code as string,
      }).toString(),
    });
    const data = (await tokenRes.json()) as Record<string, string>;
    if (tokenRes.ok && data.access_token) {
      tokenData = data;
      break;
    }
    if (data.error === "authorization_pending" || data.error === "slow_down") continue;
    if (data.error) throw new Error(`OAuth failed: ${data.error_description ?? data.error}`);
  }
  if (!tokenData) throw new Error("OAuth timeout");

  let teamId: string | null = null;
  try {
    const teamRes = await fetch("https://api.vercel.com/v2/teams", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (teamRes.ok) {
      const { teams } = (await teamRes.json()) as { teams?: { id: string; name: string }[] };
      if (teams && teams.length > 0) {
        teamId = teams[0].id;
        console.log(`Using team: ${teams[0].name} (${teamId})`);
      }
    }
  } catch {}

  const session: Session = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    team_id: teamId,
    expires_at: tokenData.expires_in ? Date.now() + parseInt(tokenData.expires_in) * 1000 : undefined,
  };
  saveSession(session);
  console.log("Session saved.\n");
  return session;
}

import { randomUUID } from "node:crypto";
import type { RuntimeMessage, SessionGrant } from "./types.ts";
import { normalizeAgentId } from "./built-in-agents.ts";

const CANONICAL = /^usa también agente: ([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/u;

export function parseConsent(text: string, knownAgents: string[] = []): string[] {
  return parseCanonicalConsent(text, knownAgents);
}

export function parseCanonicalConsent(text: string, knownAgents: string[] = []): string[] {
  const canonical = CANONICAL.exec(text.trim());
  const target = canonical ? normalizeAgentId(canonical[1]) : "";
  return target && knownAgents.map(normalizeAgentId).includes(target) ? [target] : [];
}

export function messageText(message: RuntimeMessage): string {
  if (typeof message.text === "string") return message.text;
  return (message.parts ?? []).flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const value = part as Record<string, unknown>;
    return value.type === "text" && typeof value.text === "string" ? [value.text] : [];
  }).join("\n");
}

function nativeAgentNames(message: RuntimeMessage, knownAgents: string[]): string[] {
  return (message.parts ?? []).flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const value = part as Record<string, unknown>;
    if (value.type !== "agent" || typeof value.name !== "string") return [];
    const target = normalizeAgentId(value.name);
    return knownAgents.map(normalizeAgentId).includes(target) ? [target] : [];
  });
}

export class ConsentLedger {
  private readonly grants = new Map<string, Map<string, SessionGrant>>();
  grant(input: Omit<SessionGrant, "id" | "duration">): SessionGrant {
    const grant: SessionGrant = { ...input, target: normalizeAgentId(input.target), id: randomUUID(), duration: "current-session" };
    let session = this.grants.get(grant.sessionID);
    if (!session) { session = new Map(); this.grants.set(grant.sessionID, session); }
    session.set(grant.id, grant);
    return grant;
  }
  has(sessionID: string, requester: string, target: string): boolean {
    return [...(this.grants.get(sessionID)?.values() ?? [])].some((grant) => grant.requester === requester && grant.target === normalizeAgentId(target));
  }
  list(sessionID?: string): SessionGrant[] {
    const sessions = sessionID === undefined ? this.grants.values() : [this.grants.get(sessionID)];
    return [...sessions].flatMap((session) => session ? [...session.values()] : []);
  }
  revoke(id: string): boolean {
    for (const [sessionID, session] of this.grants) {
      if (!session.delete(id)) continue;
      if (session.size === 0) this.grants.delete(sessionID);
      return true;
    }
    return false;
  }
  revokeTarget(sessionID: string, target: string): boolean {
    const grant = this.list(sessionID).find((item) => item.target === normalizeAgentId(target));
    return grant ? this.revoke(grant.id) : false;
  }
  clearSession(sessionID: string): void { this.grants.delete(sessionID); }
}

export function registerMessageGrant(ledger: ConsentLedger, message: RuntimeMessage, knownAgents: string[], requester = ""): string[] {
  const agents = [...new Set([...parseConsent(messageText(message), knownAgents), ...nativeAgentNames(message, knownAgents)])];
  for (const target of agents) {
    ledger.grant({ sessionID: message.sessionID, requester: requester || message.messageID, target, purpose: "user-confirmed dispatch", operation: "task" });
  }
  return agents;
}

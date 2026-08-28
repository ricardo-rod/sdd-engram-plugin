import { describe, expect, it } from "vitest";
import {
  ConsentLedger,
  decideTaskGate,
  INTERNAL_AGENT_ALLOWLIST,
  isAuthorizedInternalAgent,
  SDD_AGENT_ALLOWLIST,
  createInternalMemoryAudit,
  decideInternalCommand,
  internalAgentPermissions,
  transformTaskPermission,
} from "../src/core/policy.ts";
import { CANONICAL_BUILT_IN_AGENTS } from "../src/core/built-in-agents.ts";

const CONFIGURED_INTERNAL_AGENTS = [
  "sdd-init", "sdd-explore", "sdd-onboard", "sdd-propose", "sdd-spec",
  "sdd-design", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive",
  "sdd-init-fallback", "sdd-explore-fallback", "sdd-onboard-fallback", "sdd-propose-fallback", "sdd-spec-fallback",
  "sdd-design-fallback", "sdd-tasks-fallback", "sdd-apply-fallback", "sdd-verify-fallback", "sdd-archive-fallback",
  "review-readability", "review-readability-fallback",
  "review-refuter", "review-refuter-fallback",
  "review-reliability", "review-reliability-fallback",
  "review-resilience", "review-resilience-fallback",
  "review-risk", "review-risk-fallback",
  "jd-fix-agent", "jd-fix-agent-fallback",
  "jd-judge-a", "jd-judge-a-fallback",
  "jd-judge-b", "jd-judge-b-fallback",
] as const;

describe("task policy", () => {
  it("allows every configured internal agent without a ledger grant", () => {
    expect([...INTERNAL_AGENT_ALLOWLIST]).toEqual(CONFIGURED_INTERNAL_AGENTS);
    for (const target of CONFIGURED_INTERNAL_AGENTS) {
      expect(isAuthorizedInternalAgent(target), target).toBe(true);
      expect(decideTaskGate({ sessionAgent: "gentle-orchestrator", target, sessionID: "s", messageID: "m" })).toMatchObject({
        allowed: true,
        reason: "exact internal allowlist",
      });
    }
  });

  it("fails closed for unknown, disabled, and lookalike automatic dispatches", () => {
    for (const target of ["sdd-evil", "custom-agent-unregistered"]) {
      expect(isAuthorizedInternalAgent(target), target).toBe(false);
      expect(decideTaskGate({ sessionAgent: "gentle-orchestrator", target, sessionID: "s", messageID: "m", knownAgents: ["general", "explore"] })).toMatchObject({
        allowed: false,
      });
    }
  });

  it("allows direct dispatch for registered suite agents and blocks unregistered ones", () => {
    expect(decideTaskGate({ sessionAgent: "gentle-orchestrator", target: "general", sessionID: "s", messageID: "m", knownAgents: ["general", "explore"] })).toMatchObject({
      allowed: true,
      reason: "registered suite agent direct dispatch",
    });
    expect(decideTaskGate({ sessionAgent: "gentle-orchestrator", target: "explore", sessionID: "s", messageID: "m", knownAgents: ["general", "explore"] })).toMatchObject({
      allowed: true,
      reason: "registered suite agent direct dispatch",
    });
    expect(decideTaskGate({ sessionAgent: "gentle-orchestrator", target: "unknown-agent", sessionID: "s", messageID: "m", knownAgents: ["general", "explore"] })).toMatchObject({
      allowed: false,
    });
  });

  it("blocks dispatch of disabled agents even when registered", () => {
    expect(decideTaskGate({ sessionAgent: "gentle-orchestrator", target: "general", sessionID: "s", messageID: "m", knownAgents: ["general", "explore"], disabledAgents: ["general"] })).toMatchObject({
      allowed: false,
    });
  });

  it("allows only the requester-target pair recorded in an active session grant", () => {
    const ledger = new ConsentLedger();
    ledger.grant({ sessionID: "s", requester: "general", target: "explore", purpose: "search", operation: "task" });
    expect(decideTaskGate({ sessionAgent: "general", target: "explore", sessionID: "s", messageID: "m", ledger, knownAgents: ["general", "explore"] }).allowed).toBe(true);
    expect(decideTaskGate({ sessionAgent: "unknown", target: "explore", sessionID: "s", messageID: "m", ledger, knownAgents: ["general", "explore"] }).allowed).toBe(true);
  });

  it("shares one session grant between an alias and canonical identity", () => {
    const ledger = new ConsentLedger();
    ledger.grant({ sessionID: "s", requester: "general", target: "general", purpose: "review", operation: "task" });
    expect(decideTaskGate({ sessionAgent: "general", target: "general", sessionID: "s", messageID: "m", ledger, knownAgents: ["general"] })).toMatchObject({ allowed: true });
    expect(ledger.list("s")).toHaveLength(1);
  });

  it("lists visible grant details and denies grants after revocation or session expiry", () => {
    const ledger = new ConsentLedger();
    const grant = ledger.grant({ sessionID: "s", requester: "general", target: "unregistered-target", purpose: "codebase search", operation: "task" });
    expect(ledger.list("s")).toEqual([expect.objectContaining({ requester: "general", target: "unregistered-target", purpose: "codebase search", operation: "task", duration: "current-session" })]);
    ledger.revoke(grant.id);
    expect(decideTaskGate({ sessionAgent: "gentle-orchestrator", target: "unregistered-target", sessionID: "s", messageID: "m", ledger, knownAgents: ["general"] }).allowed).toBe(false);
    ledger.grant({ sessionID: "s", requester: "general", target: "unregistered-target", purpose: "codebase search", operation: "task" });
    ledger.clearSession("s");
    expect(ledger.list("s")).toEqual([]);
  });

  it("contains the complete exact SDD allowlist", () => {
    expect([...SDD_AGENT_ALLOWLIST]).toEqual([
      "sdd-init", "sdd-explore", "sdd-onboard", "sdd-propose", "sdd-spec",
      "sdd-design", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive",
    ]);
  });

  it("emits a deny-by-default task configuration with SDD exact allows", () => {
    const result = transformTaskPermission();
    expect(result["*"]).toBe("deny");
    for (const agent of CONFIGURED_INTERNAL_AGENTS) expect(result[agent]).toBe(agent.endsWith("-fallback") ? "ask" : "allow");
    expect(result["sdd-evil"]).toBeUndefined();
    expect(result.general).toBe("deny");
  });

  it("removes disabled internal targets from the task permission allowlist", () => {
    const result = transformTaskPermission(["sdd-apply"]);
    expect(result["*"]).toBe("deny");
    expect(result["sdd-apply"]).toBeUndefined();
    expect(result["sdd-apply-fallback"]).toBe("ask");
  });

  it("retains the primary SDD list as an exact compatibility subset", () => {
    expect([...SDD_AGENT_ALLOWLIST]).toEqual([
      "sdd-init", "sdd-explore", "sdd-onboard", "sdd-propose", "sdd-spec",
      "sdd-design", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive",
    ]);
  });

  it("curates seven distinct agents with distinct Spanish descriptions and no personal agent seeds", () => {
    expect(CANONICAL_BUILT_IN_AGENTS).toHaveLength(7);
    expect(CANONICAL_BUILT_IN_AGENTS.map((agent) => agent.id)).toEqual([
      "general",
      "build",
      "plan",
      "explore",
      "compaction",
      "title",
      "summary",
    ]);
    expect(new Set(CANONICAL_BUILT_IN_AGENTS.map((agent) => agent.baseline.description)).size).toBe(7);
  });

  it("allows internal memory/read-only work while denying edits, delegation, and unsafe command shapes", async () => {
    expect(internalAgentPermissions("compaction")).toMatchObject({ read: "allow", edit: "deny", task: "deny", bash: "deny" });
    for (const command of ["git status", "git diff --cached", "git log -1", "git show HEAD", "git branch --show-current"]) {
      expect(decideInternalCommand("title", command)).toMatchObject({ allowed: true });
    }
    for (const command of ["git -C other status", "git commit -a", "git commit --allow-empty -m x", "git push", "git push -u origin main", "git push origin HEAD:main", "gh pr create --head branch", "TOKEN=x gh pr list", "git status && git log", "git status > out"]) {
      expect(decideInternalCommand("summary", command)).toMatchObject({ allowed: false });
    }

    const captured: string[] = [];
    const audit = createInternalMemoryAudit(async (entry) => { captured.push(entry.content); });
    await expect(audit.capture("session", "compaction", "same content")).resolves.toEqual({ status: "captured" });
    await expect(audit.capture("session", "compaction", "same content")).resolves.toEqual({ status: "duplicate" });
    const unavailable = createInternalMemoryAudit(async () => { throw new Error("offline"); });
    await expect(unavailable.capture("session", "summary", "new content")).resolves.toEqual({ status: "unavailable" });
    expect(captured).toEqual(["same content"]);
  });
});

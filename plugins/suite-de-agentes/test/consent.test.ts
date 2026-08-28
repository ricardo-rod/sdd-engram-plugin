import { describe, expect, it } from "vitest";
import { ConsentLedger, parseConsent, registerMessageGrant } from "../src/core/grants.ts";

describe("per-turn consent", () => {
  it("parses only the canonical exact consent and unambiguous @ alias", () => {
    expect(parseConsent("usa también agente: github-specialist", ["github-specialist"])).toEqual(["github-specialist"]);
    expect(parseConsent("usa también agente: github-specialist")).toEqual([]);
    expect(parseConsent("usa también agente: github-specialist extra")).toEqual([]);
    expect(parseConsent("@github-specialist", ["github-specialist"])).toEqual([]);
    expect(parseConsent("@git", ["github-specialist", "git-reviewer"])).toEqual([]);
    expect(parseConsent("no uses también agente: github-specialist")).toEqual([]);
  });

  it("expires grants by message and never leaks to another turn", () => {
    const ledger = new ConsentLedger();
    registerMessageGrant(ledger, { sessionID: "s1", messageID: "m1", text: "usa también agente: analyst" }, ["analyst"]);
    expect(ledger.has("s1", "m1", "analyst")).toBe(true);
    expect(ledger.has("s1", "m2", "analyst")).toBe(false);
    expect(ledger.has("s2", "m1", "analyst")).toBe(false);
  });

  it("accepts only the exact native AgentPart name", () => {
    const ledger = new ConsentLedger();
    registerMessageGrant(ledger, {
      sessionID: "s1", messageID: "m1", parts: [
        { type: "agent", name: "analyst", id: "p1", sessionID: "s1", messageID: "m1" },
      ],
    }, ["analyst", "github-specialist"]);
    expect(ledger.has("s1", "m1", "analyst")).toBe(true);
    expect(ledger.has("s1", "m1", "github-specialist")).toBe(false);
  });
});

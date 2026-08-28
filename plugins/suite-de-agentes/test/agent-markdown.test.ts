import { describe, expect, it } from "vitest";
import { generateAgentMarkdown } from "../src/core/agent-markdown.ts";

describe("custom agent markdown", () => {
  it("materializes skill permission and explicit instructions in prompt", () => {
    const markdown = generateAgentMarkdown({ id: "researcher", description: "Research", model: "openai/x", prompt: "Be precise.", skills: ["web-search", "code-review"], permissions: { read: "allow", edit: "deny" } });
    expect(markdown).toContain("name: researcher");
    expect(markdown).toContain("permission:");
    expect(markdown).toContain("skill: allow");
    expect(markdown).toContain("Use the associated skills: web-search, code-review.");
    expect(markdown).not.toMatch(/skills:\s*\[/);
  });

  it("emits a selected native variant and omits it for default behavior", () => {
    const selected = generateAgentMarkdown({ id: "researcher", description: "Research", model: "openai/x", variant: "high", prompt: "Be precise.", skills: [], permissions: {} });
    const defaultVariant = generateAgentMarkdown({ id: "researcher", description: "Research", model: "openai/x", prompt: "Be precise.", skills: [], permissions: {} });

    expect(selected).toContain("variant: high");
    expect(defaultVariant).not.toContain("variant:");
  });
});

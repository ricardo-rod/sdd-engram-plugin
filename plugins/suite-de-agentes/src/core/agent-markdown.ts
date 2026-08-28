import type { CustomAgent } from "./types.ts";
import { validateAgentId, validateVariantId } from "./config.ts";

export function generateAgentMarkdown(agent: CustomAgent): string {
  validateAgentId(agent.id);
  if (!agent.model.includes("/") || !agent.prompt.trim()) throw new Error("Custom agent requires model and prompt");
  const variant = agent.variant === undefined ? "" : `variant: ${validateVariantId(agent.variant)}\n`;
  const permission = { ...agent.permissions, ...(agent.skills.length ? { skill: "allow" } : {}) };
  const permissionYaml = Object.entries(permission).map(([key, value]) => `  ${key}: ${value}`).join("\n");
  const skillInstruction = agent.skills.length ? `\n\nUse the associated skills: ${agent.skills.join(", ")}. Follow their instructions explicitly.` : "";
  return `---\nname: ${agent.id}\ndescription: ${JSON.stringify(agent.description)}\nmodel: ${agent.model}\n${variant}permission:\n${permissionYaml || "  read: allow"}\n---\n\n${agent.prompt.trim()}${skillInstruction}\n`;
}

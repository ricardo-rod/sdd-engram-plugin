import { describe, expect, it, vi } from "vitest";
import { buildAuthoringPreview, confirmAuthoringProposal, validateAuthoringProposal } from "./agent-authoring";

const proposal = {
  name: "review-ux",
  mission: "Revisa la experiencia de usuario con evidencia acotada.",
  model: "openai/gpt-5",
  permissions: ["read:bounded-evidence"],
  skills: ["impeccable"],
  operations: "Analiza y devuelve una propuesta; no escribe archivos.",
};

describe("AI agent authoring", () => {
  it("builds an exact six-field preview before any materialization", () => {
    const preview = buildAuthoringPreview(proposal);

    expect(preview).toEqual([
      "Nombre: review-ux",
      "Misión: Revisa la experiencia de usuario con evidencia acotada.",
      "Modelo: openai/gpt-5",
      "Permisos: read:bounded-evidence",
      "Skills: impeccable",
      "Operaciones: Analiza y devuelve una propuesta; no escribe archivos.",
    ]);
  });

  it("rejects duplicate names before preview and requires one idempotent explicit confirmation", () => {
    expect(validateAuthoringProposal(proposal, new Set(["review-ux"]), new Set(["openai/gpt-5"]))).toEqual({ valid: false, message: "Ya existe un agente con ese nombre." });

    const materialized = new Set<string>();
    expect(confirmAuthoringProposal(proposal, false, materialized)).toEqual({ status: "cancelled", message: "No se creó ningún agente." });
    expect(materialized.size).toBe(0);
    expect(confirmAuthoringProposal(proposal, true, materialized)).toEqual({ status: "materialized", message: "Agente aprobado para materialización global." });
    expect(confirmAuthoringProposal(proposal, true, materialized)).toEqual({ status: "already-materialized", message: "El agente ya fue materializado." });
  });
});

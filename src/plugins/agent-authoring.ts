export type AuthoringProposal = {
  name: string;
  mission: string;
  model: string;
  permissions: readonly string[];
  skills: readonly string[];
  operations: string;
};

export type AuthoringValidation = { valid: true } | { valid: false; message: string };
export type AuthoringConfirmation = { status: "cancelled" | "materialized" | "already-materialized"; message: string };

export function validateAuthoringProposal(proposal: AuthoringProposal, existingNames: ReadonlySet<string>, availableModels: ReadonlySet<string>): AuthoringValidation {
  if (!proposal.name.trim() || existingNames.has(proposal.name)) return { valid: false, message: "Ya existe un agente con ese nombre." };
  if (!availableModels.has(proposal.model)) return { valid: false, message: "El modelo solicitado no está disponible." };
  if (proposal.permissions.some((permission) => !permission.startsWith("read:"))) return { valid: false, message: "Los permisos solicitados exceden el alcance permitido." };
  return { valid: true };
}

export function buildAuthoringPreview(proposal: AuthoringProposal): string[] {
  return [
    `Nombre: ${proposal.name}`,
    `Misión: ${proposal.mission}`,
    `Modelo: ${proposal.model}`,
    `Permisos: ${proposal.permissions.join(", ") || "ninguno"}`,
    `Skills: ${proposal.skills.join(", ") || "ninguna"}`,
    `Operaciones: ${proposal.operations}`,
  ];
}

export function confirmAuthoringProposal(proposal: AuthoringProposal, confirmed: boolean, materialized: Set<string>): AuthoringConfirmation {
  if (!confirmed) return { status: "cancelled", message: "No se creó ningún agente." };
  if (materialized.has(proposal.name)) return { status: "already-materialized", message: "El agente ya fue materializado." };
  materialized.add(proposal.name);
  return { status: "materialized", message: "Agente aprobado para materialización global." };
}

export function buildAuthoringConfirmationDialogProps(proposal: AuthoringProposal, onConfirm: () => void, onCancel: () => void): {
  title: string;
  message: string;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onCancel: () => void;
} {
  return {
    title: "Confirmar agente propuesto",
    message: `${buildAuthoringPreview(proposal).join("\n")}\n\nConfirma para materializar este agente globalmente.`,
    confirm: "Confirmar agente",
    cancel: "Cancelar",
    onConfirm,
    onCancel,
  };
}

/**
 * Compatibility type for integrations that create agents outside the catalog-only TUI.
 * The catalog UI itself never imports or presents this workflow.
 */
export type CreateDraft = {
  id: string;
  description: string;
  skills: string[];
  operations: string;
  model: string;
  effort: string;
};

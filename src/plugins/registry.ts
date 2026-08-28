export type PluginHubOption = {
  title: string;
  value: "suite" | "task-manager" | "help" | "__back__";
  description: string;
};

const DOCUMENTATION_LIKE_NAMES = new Set(["requirements.txt", "cmakelists.txt"]);
const DOCUMENTATION_LIKE_EXTENSIONS = new Set([".md", ".mdx", ".sh"]);

export function buildPluginHubOptions(): PluginHubOption[] {
  return [
    { title: "Suite de Agentes", value: "suite", description: "Estado: disponible. Abrir catálogo y acciones." },
    { title: "Task Manager", value: "task-manager", description: "Estado: disponible. Abrir el gestor portátil." },
    { title: "Ayuda", value: "help", description: "Consulta la ayuda incluida sin conexión." },
    { title: "← Volver", value: "__back__", description: "Volver a la gestión de perfiles." },
  ];
}

export function inspectPluginPath(candidate: string): { safe: boolean; reason?: string } {
  const normalized = candidate.replaceAll("\\", "/");
  const basename = normalized.split("/").at(-1)?.toLowerCase() ?? "";
  if (DOCUMENTATION_LIKE_NAMES.has(basename) || DOCUMENTATION_LIKE_EXTENSIONS.has(`.${basename.split(".").at(-1)}`)) {
    return normalized.startsWith("plugins/") && (basename === "readme.md" || basename === "readme.mdx")
      ? { safe: true }
      : { safe: false, reason: "documentation-like path" };
  }
  return { safe: true };
}

export function isConfirmedGitRoot(root: string, selected: string): boolean {
  return /^[A-Za-z]:\/[\w./-]+$/.test(root) && root === selected;
}

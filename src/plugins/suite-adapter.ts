import { safeHostAction } from "../host-compat";
import { openAgentSuite } from "../../plugins/suite-de-agentes/src/tui/index";

export const SUITE_COMMAND = ":agent-suite";
export const SUITE_SHORTCUT = "alt+s";

export type SuiteCatalogEntry = {
  id: string;
  membership: "internal" | "custom";
  disabled: boolean;
  model?: string;
};

type SuiteRegistrationApi = {
  keymap?: { registerLayer(layer: { priority: number; commands: Array<{ name: string; title: string; desc: string; category: string; nargs: "0"; run(): boolean }>; bindings: Array<{ key: string; cmd: string }> }): unknown };
};

export function preserveSuiteCatalogParity(entries: readonly SuiteCatalogEntry[]): SuiteCatalogEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

export function createSuiteAdapter(openSuite: () => void): { register(api: SuiteRegistrationApi): boolean } {
  return {
    register(api) {
      return safeHostAction("register Suite de Agentes", () => {
        if (!api.keymap) return false;
        api.keymap.registerLayer({
          priority: 110,
          commands: [{
            name: SUITE_COMMAND,
            title: "Suite de Agentes",
            desc: "Abre el catálogo de agentes",
            category: "Plugins",
            nargs: "0",
            run: () => { openSuite(); return true; },
          }],
          bindings: [{ key: SUITE_SHORTCUT, cmd: SUITE_COMMAND }],
        });
        return true;
      }, false);
    },
  };
}

export function openVendoredSuite(api: Parameters<typeof openAgentSuite>[0]): void {
  safeHostAction("open vendored Suite de Agentes", () => openAgentSuite(api), undefined);
}

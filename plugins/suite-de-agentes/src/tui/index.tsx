/** @jsxImportSource @opentui/solid */
import type { TuiDialogSelectOption, TuiPlugin, TuiPluginApi, TuiSlotContext } from "@opencode-ai/plugin/tui";
import type { AgentCatalogRow, CustomAgent } from "../core/types.ts";
import type { RuntimeModelProvider } from "./screens/model-select.tsx";
import { normalizeEffortOptions } from "../core/effort.ts";
import { defaultSuitePath } from "../core/persistence.ts";
import { validateVariantId } from "../core/config.ts";
import { PLUGIN_VERSION } from "../version.ts";
import { safeHostAction, safeSlotRender } from "./host-compat.ts";
import { createAgentSuiteController, type AgentSuiteController } from "./agent-suite-controller.ts";
import { handleAgentSuiteEscape, mountAgentSuite } from "./agent-suite-mount.tsx";
import { formatCatalogName } from "./visual-tokens.ts";

export const AGENT_SUITE_COMMAND = ":agent-suite";
export const AGENT_SUITE_ESCAPE_COMMAND = "agent-suite.escape";
export const AGENT_SUITE_KEY = "alt+s";

export function suiteTitle(): string {
  return `Suite de Agentes · v${PLUGIN_VERSION}`;
}

export function suiteSidebarLabel(): string {
  return `Suite de Agentes · Alt+S · v${PLUGIN_VERSION}`;
}

export function buildSuiteRootOptions(): Array<{ title: string; value: "catalog" }> {
  return [{ title: "Catálogo de agentes", value: "catalog" }];
}

function catalogState(row: AgentCatalogRow): string {
  return row.enabled ? "Disponible" : row.membership === "custom" ? "Creado · no materializado" : "No materializado";
}

export function buildCatalogOptions(rows: readonly AgentCatalogRow[]): TuiDialogSelectOption<string>[] {
  return rows.map((row) => ({ title: formatCatalogName(row.id), value: row.id }));
}

export function catalogDetailMessage(row: AgentCatalogRow, customAgent?: CustomAgent): string {
  return [`Nombre: ${row.id}`, `Descripción: ${row.description ?? "ninguna"}`, `Modelo: ${row.model ?? "modelo pendiente"}`, `Esfuerzo: ${row.variant ?? "default"}`, `Skills: ${row.skills.join(", ") || "ninguna"}`, `Operaciones: ${customAgent?.prompt ?? row.description ?? "ninguna"}`, `Estado: ${catalogState(row)}`].join("\\n");
}

export function buildCatalogActionOptions(row: AgentCatalogRow): TuiDialogSelectOption<string>[] {
  return [
    { title: "Cambiar modelo y esfuerzo", value: "assign-model" },
    { title: "Volver", value: "back" },
  ];
}

export function buildAgentModelOptions(row: AgentCatalogRow, options: readonly { title: string; value: string; description?: string }[]): TuiDialogSelectOption<string>[] {
  return options.map((option) => ({ ...option }));
}

export function buildRuntimeModelOptions(api: TuiPluginApi): TuiDialogSelectOption<string>[] {
  return api.state.provider.flatMap((provider) => Object.entries(provider.models).flatMap(([key, model]) => {
    const modelId = stableRuntimeModelId(provider.id, key, model);
    return modelId ? [{ title: model.name, value: `${provider.id}/${modelId}`, description: provider.name }] : [];
  }));
}

export function buildAgentVariantOptions(row: AgentCatalogRow, selectedModel: string, variants: readonly string[]): TuiDialogSelectOption<string>[] {
  return normalizeEffortOptions(variants).map((variant) => ({ title: row.model === selectedModel && (variant === "default" ? !row.variant : row.variant === variant) ? `✓ ${variant}` : variant, value: variant === "default" ? "" : variant }));
}

export function getAvailableModelVariants(api: TuiPluginApi, modelID: string): string[] {
  const separator = modelID.indexOf("/");
  if (separator <= 0) return [];
  const provider = api.state.provider.find((item) => item.id === modelID.slice(0, separator));
  const requestedModelId = modelID.slice(separator + 1);
  const model = Object.entries(provider?.models ?? {}).find(([key, candidate]) => stableRuntimeModelId(provider!.id, key, candidate) === requestedModelId)?.[1] as { variants?: Record<string, unknown> } | undefined;
  return Object.entries(model?.variants ?? {}).flatMap(([id, metadata]) => {
    try { validateVariantId(id); } catch { return []; }
    return metadata && typeof metadata === "object" && (metadata as { disabled?: boolean }).disabled ? [] : [id];
  });
}

export function buildRuntimeModelProviders(api: TuiPluginApi): RuntimeModelProvider[] {
  return api.state.provider.map((provider) => ({
    id: provider.id,
    name: provider.name,
    models: Object.fromEntries(Object.entries(provider.models).flatMap(([key, model]) => {
      const modelId = stableRuntimeModelId(provider.id, key, model);
      return modelId ? [[modelId, { id: modelId, name: model.name, variants: (model as { variants?: Record<string, unknown> }).variants }]] : [];
    })),
  }));
}

function stableRuntimeModelId(providerId: string, key: string, model: { id?: string }): string | undefined {
  for (const candidate of [model.id, key]) {
    if (typeof candidate !== "string" || !candidate.trim() || /\s/.test(candidate)) continue;
    const normalized = candidate.startsWith(`${providerId}/`) ? candidate.slice(providerId.length + 1) : candidate;
    if (normalized.split("/").every((segment) => segment && segment !== "." && segment !== ".." && !/\s/.test(segment))) return normalized;
  }
  return undefined;
}

export type SuiteOpenFallback = () => void;

type RegistrationApi = Pick<TuiPluginApi, "keymap">;
type SlashRegistrationApi = Pick<TuiPluginApi, "command">;

type DialogControllerFactory = (api: TuiPluginApi) => AgentSuiteController;

let controllerFactory: DialogControllerFactory = (api) => createAgentSuiteController([], PLUGIN_VERSION, {
  path: defaultSuitePath(),
  runtime: Object.fromEntries(Object.entries(api.state?.config?.agent ?? {}).map(([id, agent]) => [id, { model: agent?.model, variant: agent?.variant, description: agent?.description }])),
});

export function setAgentSuiteControllerFactoryForTests(factory: DialogControllerFactory): void {
  controllerFactory = factory;
}

function openNativeFallback(api: Pick<TuiPluginApi, "ui">): void {
  api.ui.dialog.replace(() => api.ui.DialogAlert({
    title: suiteTitle(),
    message: "La interfaz gráfica no está disponible en este host.",
  }));
}

export function openAgentSuite(api: TuiPluginApi, fallback: SuiteOpenFallback = () => openNativeFallback(api)): void {
  const opened = safeHostAction("open Agent Suite", () => {
    const controller = controllerFactory(api);
    mountAgentSuite({ theme: api.theme, ui: api.ui, providers: buildRuntimeModelProviders(api), variantOptions: (model) => getAvailableModelVariants(api, model) }, controller);
    return true;
  }, false);
  if (!opened) fallback();
}

/** Compatibility fallback entry point for hosts that cannot mount the custom app. */
export function openSuite(api: TuiPluginApi): void {
  openNativeFallback(api);
}

function registerKeymapLayer(api: RegistrationApi, open: () => void): (() => void) | false {
  return safeHostAction<(() => void) | false>("register keymap", () => api.keymap.registerLayer({
    priority: 110,
    commands: [{
      name: AGENT_SUITE_COMMAND,
      title: "Suite de Agentes",
      desc: "Abre el catálogo de agentes",
      category: "Agentes",
      nargs: "0",
      run: () => { open(); return true; },
    }, {
      name: AGENT_SUITE_ESCAPE_COMMAND,
      title: "Suite de Agentes Back",
      desc: "Vuelve dentro de Suite de Agentes",
      category: "Agentes",
      run: ({ event }: { event: { preventDefault(): void; stopPropagation(): void } }) => {
        if (!handleAgentSuiteEscape()) return false;
        event.preventDefault();
        event.stopPropagation();
        return true;
      },
    }],
    bindings: [
      { key: AGENT_SUITE_KEY, cmd: AGENT_SUITE_COMMAND },
      { key: "escape", cmd: AGENT_SUITE_ESCAPE_COMMAND },
    ],
  }), false);
}

export function registerSuiteKeymap(api: RegistrationApi, open: () => void): boolean {
  return registerKeymapLayer(api, open) !== false;
}

function registerSlashCommand(api: SlashRegistrationApi, open: () => void): (() => void) | false {
  if (!api.command?.register) return false;
  return safeHostAction<(() => void) | false>("register slash command", () => api.command!.register(() => [{
    title: "Suite de Agentes",
    value: "agent-suite",
    description: "Abre el catálogo de agentes",
    category: "Agentes",
    slash: { name: "agent-suite" },
    onSelect: () => open(),
  }]), false);

}

export function registerSuiteSlashCommand(api: SlashRegistrationApi, open: () => void): boolean {
  return registerSlashCommand(api, open) !== false;
}

export const tui: TuiPlugin = async (api) => {
  const open = () => openAgentSuite(api);
  const keymapDisposer = registerKeymapLayer(api, open);
  if (keymapDisposer && api.lifecycle) api.lifecycle.onDispose(keymapDisposer);

  const slashDisposer = registerSlashCommand(api, open);
  if (slashDisposer && api.lifecycle) api.lifecycle.onDispose(slashDisposer);

  safeHostAction("register sidebar slot", () => {
    api.slots.register({
      slots: {
        sidebar_content: (ctx: TuiSlotContext) => safeSlotRender("sidebar_content", () => (
          <box paddingLeft={1}>
            <text fg={ctx.theme.current.textMuted}>{suiteSidebarLabel()}</text>
          </box>
        )),
      },
    });
    return true;
  }, false);
};

const plugin = { id: "agent-suite", tui };
export default plugin;

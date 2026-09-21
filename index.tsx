/** @jsxImportSource @opentui/solid */
/**
 * SDD Model Select — OpenCode V2 native `./tui` entry.
 *
 * Total V2 cutover: `./tui` IS V2 (no parallel `./tui-v2`). This file is
 * built as `dist/tui.js` via `Plugin.define` from `@opencode/plugin/tui`.
 *
 * V1 -> V2 mapping applied here:
 * - `api.kv` -> `context.storage.store("sdd-prefs", ...)` (durable JSON).
 *   One-time copy-on-first-run from V1 keys is best-effort: the V2 TUI
 *   context exposes no reader for the V1 host kv store, so a guarded probe
 *   applies legacy values when present and fresh defaults otherwise.
 * - slots `home_bottom`/`sidebar_content` -> `home.footer.status` /
 *   `sidebar.content` via `context.ui.slot`.
 * - `api.keymap.registerLayer` -> `context.keymap.layer` inside the mounted
 *   `SddBadge` component body (mode `global`, one palette command + slash).
 *   The layer is owned by badge slots that definitely mount
 *   (`sidebar.content`, `home.footer.status`); a previous `app`-slot owner
 *   never surfaced in the live TUI, so the palette is never owned solely by
 *   the unproven `app` slot.
 * - `api.ui.dialog` JSX components -> promise-based
 *   `context.ui.dialog.select/confirm/prompt` + `context.ui.toast.show`.
 * - `api.state.provider/config` -> `context.data.location.*.sync()` +
 *   `.list()` snapshots (`loadRuntimeSnapshot`), adapted to the V1 shape by
 *   `buildV1Shim` so the tested pure helpers in `src/dialogs.tsx`,
 *   `src/profiles.ts`, and `src/profile-reasoning.ts` are reused unchanged.
 *   `src/dialogs.tsx` itself is untouched (server/tests import it).
 *
 * Ported from V1 `src/dialogs.tsx`: showCreateProfile, showProfileList,
 * showProfileDetail (hub + primary/reasoning/fallback submenus, provider and
 * model pickers, bulk actions, versions, delete), handleActivateProfile,
 * showRenameProfile, and showProjectMemoriesMenu (browser + detail + delete).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { Plugin } from "@opencode/plugin/tui";
import type { Context } from "@opencode/plugin/tui/context";
import { Show } from "solid-js";
import type { Store } from "solid-js/store";
import { formatActiveModelBadgeText } from "./components";
import { createLogger } from "./src/logger";
import { ensureProfilesDir, readPluginShortcutBindings, resolveEngramProjectName, resolvePaths, resolveProjectName as resolveConfigProjectName } from "./src/config";
import {
	activateProfileFile,
	deleteProfileFile,
	detectActiveProfileFile,
	listProfileFiles,
	listProfileVersions,
	readProfileData,
	readProfileVersion,
	renameProfileFile,
	restoreProfileVersion,
	sanitizeProfileName,
	updateProfilePhaseModel,
	updateProfileWithBulkPhaseAssignment,
	writeProfileData,
	writeProfileModels,
} from "./src/profiles";
import { buildReasoningEditState, updateProfileReasoningEffort } from "./src/profile-reasoning";
import {
	ACTIVE_PROFILE_NAME_KV_KEY,
	BADGE_DISPLAY_MODE_KV_KEY,
	BADGE_VISIBLE_KV_KEY,
	buildBulkProfileActionOptions,
	buildFallbackSubmenuOptions,
	buildPrimaryModelSubmenuOptions,
	buildProfileDetailAgentSections,
	buildProfileDetailHubOptions,
	buildReasoningBlockedMessage,
	buildReasoningSubmenuOptions,
	buildProfileVersionListOption,
	formatProfileVersionPreviewLines,
	resolveProfileDetailNavigationAction,
	resolveProfileDetailSelectionAction,
	resolveRuntimeOrchestratorPolicy,
} from "./src/dialogs";
import { deleteProjectMemory, listProjectMemories } from "./src/memories";
import { setActiveProfile } from "./src/state";
import { NAV_CATEGORY } from "./src/types";
import type { ActiveProfileState, EngramObservation } from "./src/types";
import { formatContext, formatMemoryDate, isPrimarySddAgent, parseActiveProfileFromRaw, truncateText } from "./src/utils";

const log = createLogger("tui");

type SddPrefs = {
	badgeVisible: boolean;
	displayMode: "model" | "profile";
	activeProfileName: string;
	/** Set once the best-effort V1 kv copy has run (fresh or migrated). */
	migrated: boolean;
};

type UpdatePrefs = (mutation: (draft: SddPrefs) => void) => Promise<void>;

const initialPrefs: SddPrefs = {
	badgeVisible: true,
	displayMode: "model",
	activeProfileName: "",
	migrated: false,
};

/**
 * Converts a V2 theme token to a `#rrggbb` string for `fg` props.
 * V2 tokens are `RGBA` class instances (see `@opencode/theme`); plain CSS
 * strings pass through and anything else falls back.
 */
export function rgbaToHex(color: unknown, fallback = "#888888"): string {
	if (typeof color === "string" && color.length > 0) return color;
	try {
		const candidate = color as {
			toInts?: () => [number, number, number, number];
			r?: unknown;
			g?: unknown;
			b?: unknown;
		};
		if (typeof candidate?.toInts === "function") {
			const [r, g, b] = candidate.toInts();
			return intsToHex(r, g, b);
		}
		if (
			typeof candidate?.r === "number" &&
			typeof candidate?.g === "number" &&
			typeof candidate?.b === "number"
		) {
			// Accept 0-1 floats or 0-255 ints.
			const scale = candidate.r <= 1 && candidate.g <= 1 && candidate.b <= 1 ? 255 : 1;
			return intsToHex(candidate.r * scale, candidate.g * scale, candidate.b * scale);
		}
	} catch (error) {
		log.warn("rgbaToHex: failed to convert theme token", error);
	}
	return fallback;
}

function intsToHex(r: number, g: number, b: number): string {
	const channel = (value: number): string =>
		Math.max(0, Math.min(255, Math.round(value)))
			.toString(16)
			.padStart(2, "0");
	return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function resolveSessionAgentName(context: Context, sessionID?: string): string | undefined {
	if (!sessionID) return undefined;
	try {
		const messages = context.data.session.message.list(sessionID) ?? [];
		for (let index = messages.length - 1; index >= 0; index -= 1) {
			const agent = (messages[index] as unknown as { agent?: unknown })?.agent;
			if (typeof agent === "string" && agent.length > 0) return agent;
		}
	} catch (error) {
		log.warn("resolveSessionAgentName: failed to read session messages", error);
	}
	return undefined;
}

/** Ports the V1 badge/profile read to `data.location.agent.list`. */
function resolveBadgeProfile(context: Context, sessionID?: string): ActiveProfileState | null {
	try {
		const agents = context.data.location.agent.list(context.location) ?? [];
		const sddAgents = agents.filter((agent) => isPrimarySddAgent(agent.name));
		if (sddAgents.length === 0) return null;

		const sessionAgent = resolveSessionAgentName(context, sessionID);
		const selected =
			sddAgents.find((agent) => agent.name === sessionAgent) ?? sddAgents[0];
		if (!selected) return null;

		const model = selected.model;
		if (!model) return null;
		const models = context.data.location.model.list(context.location) ?? [];
		const info = models.find(
			(entry) => entry.providerID === model.providerID && entry.modelID === model.id,
		);
		return {
			modelId: `${model.providerID}/${model.id}`,
			modelName: info?.name ?? model.id,
			providerName: model.providerID,
			contextLimit: info?.limit?.context ?? null,
		};
	} catch (error) {
		log.warn("resolveBadgeProfile: failed to resolve badge profile", error);
		return null;
	}
}

function toast(context: Context, options: { title?: string; message: string; variant?: "info" | "success" | "warning" | "error" }): void {
	try {
		context.ui.toast.show(options);
	} catch (error) {
		log.warn("toast: failed to show toast", error);
	}
}

// ---------------------------------------------------------------------------
// V2 runtime snapshot (replaces V1 `api.state.*` reads)
// ---------------------------------------------------------------------------

/** V1-shaped provider (with embedded models) rebuilt from V2 location data. */
type V1ProviderShape = {
	id: string;
	name: string;
	models: Record<string, { name?: string; limit?: { context?: number }; capabilities?: unknown; variants?: unknown }>;
};

type RuntimeSnapshot = {
	providers: V1ProviderShape[];
	agentMap: Record<string, { model?: string }>;
	defaultAgent?: string;
};

function readGlobalConfigFile(configPath: string): any {
	try {
		if (!fs.existsSync(configPath)) return {};
		return JSON.parse(fs.readFileSync(configPath, "utf-8"));
	} catch (error) {
		log.warn(`readGlobalConfigFile: failed to parse ${configPath}`, error);
		return {};
	}
}

async function resolveDefaultAgent(context: Context): Promise<string | undefined> {
	try {
		const entries = await context.client.config.get();
		for (const entry of entries ?? []) {
			const defaultAgent = (entry as unknown as { info?: { default_agent?: unknown } })?.info?.default_agent;
			if (typeof defaultAgent === "string" && defaultAgent.trim()) return defaultAgent.trim();
		}
	} catch (error) {
		log.warn("resolveDefaultAgent: config.get failed", error);
	}
	return undefined;
}

/**
 * Syncs and lists V2 location data (providers, models, agents) in one place.
 * Every dialog flow reads providers/config through the returned snapshot
 * instead of V1 `api.state.*`.
 */
async function loadRuntimeSnapshot(context: Context): Promise<RuntimeSnapshot> {
	const location = context.location;
	const labels = ["provider", "model", "agent"] as const;
	const settled = await Promise.allSettled([
		context.data.location.provider.sync(location),
		context.data.location.model.sync(location),
		context.data.location.agent.sync(location),
	]);
	settled.forEach((result, index) => {
		if (result.status === "rejected") {
			log.warn(`loadRuntimeSnapshot: ${labels[index]}.sync failed`, result.reason);
		}
	});

	let providerInfos: Array<{ id: string; name?: string }> = [];
	let modelInfos: Array<{
		providerID: string;
		modelID: string;
		name?: string;
		limit?: { context?: number };
		capabilities?: unknown;
		variants?: unknown;
	}> = [];
	let agentInfos: Array<{ name: string; model?: { providerID: string; id: string } }> = [];
	try {
		providerInfos = context.data.location.provider.list(location) ?? [];
	} catch (error) {
		log.warn("loadRuntimeSnapshot: provider.list failed", error);
	}
	try {
		modelInfos = context.data.location.model.list(location) ?? [];
	} catch (error) {
		log.warn("loadRuntimeSnapshot: model.list failed", error);
	}
	try {
		agentInfos = context.data.location.agent.list(location) ?? [];
	} catch (error) {
		log.warn("loadRuntimeSnapshot: agent.list failed", error);
	}

	const providersById = new Map<string, V1ProviderShape>();
	for (const provider of providerInfos) {
		providersById.set(provider.id, { id: provider.id, name: provider.name || provider.id, models: {} });
	}
	for (const model of modelInfos) {
		let entry = providersById.get(model.providerID);
		if (!entry) {
			entry = { id: model.providerID, name: model.providerID, models: {} };
			providersById.set(model.providerID, entry);
		}
		entry.models[model.modelID] = {
			name: model.name || model.modelID,
			...(model.limit?.context ? { limit: { context: model.limit.context } } : {}),
			...(model.capabilities !== undefined ? { capabilities: model.capabilities } : {}),
			...(model.variants !== undefined ? { variants: model.variants } : {}),
		};
	}
	// Match V1 pickers: only providers that can offer a model.
	const providers = [...providersById.values()].filter(
		(provider) => Object.keys(provider.models).length > 0,
	);

	const agentMap: Record<string, { model?: string }> = {};
	for (const agent of agentInfos) {
		agentMap[agent.name] = {
			...(agent.model ? { model: `${agent.model.providerID}/${agent.model.id}` } : {}),
		};
	}

	const defaultAgent = await resolveDefaultAgent(context);
	return { providers, agentMap, ...(defaultAgent ? { defaultAgent } : {}) };
}

/**
 * Adapts the V2 context plus a runtime snapshot to the V1 `api` shape
 * consumed by the untouched helpers in `src/dialogs.tsx`/`src/profiles.ts`.
 *
 * Differences bridged here:
 * - `state.provider/config` come from the snapshot (synced V2 location data).
 * - `client.global.config.update` has no V2 equivalent (V2 `config.update`
 *   only manages shell settings), so activation persists the merged config
 *   file directly — the same file V1 used as source-of-truth — then nudges
 *   the server with a best-effort `location.reload()`.
 * - `ui.toast` forwards to `context.ui.toast.show`.
 */
function buildV1Shim(context: Context, snapshot: RuntimeSnapshot): any {
	const { configPath } = resolvePaths();
	return {
		state: {
			provider: snapshot.providers,
			config: {
				agent: snapshot.agentMap,
				...(snapshot.defaultAgent ? { default_agent: snapshot.defaultAgent } : {}),
			},
		},
		client: {
			global: {
				config: {
					get: async () => ({ data: readGlobalConfigFile(configPath) }),
					update: async ({ config }: any) => {
						fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
						try {
							await context.client.location.reload();
						} catch (error) {
							log.warn("v1shim: location.reload after config update failed", error);
						}
						return {};
					},
				},
			},
		},
		ui: {
			toast: (options: any) => {
				toast(context, options);
			},
		},
	};
}

// ---------------------------------------------------------------------------
// Storage migration (V1 `api.kv` -> V2 `context.storage.store`)
// ---------------------------------------------------------------------------

/**
 * Best-effort read of a V1 kv key. The V2 TUI context exposes no reader for
 * the V1 host kv store, so this probes a compat channel when one is present
 * and yields undefined otherwise (V2 defaults stand).
 */
async function readLegacyV1Pref(context: Context, key: string): Promise<unknown> {
	try {
		const kv = (context as unknown as { kv?: { get?: (key: string) => Promise<unknown> } })?.kv;
		if (kv && typeof kv.get === "function") return await kv.get(key);
	} catch (error) {
		log.warn(`readLegacyV1Pref: failed to read V1 key '${key}'`, error);
	}
	return undefined;
}

/**
 * One-time copy-on-first-run from the V1 kv keys
 * (`sdd-show-model-badge`, `sdd-badge-display-mode`,
 * `sdd-active-profile-name`) into the V2 `sdd-prefs` store. Guarded by
 * `migrated`; absent legacy values keep the V2 defaults.
 */
async function migrateV1PrefsOnce(context: Context, prefs: SddPrefs, updatePrefs: UpdatePrefs): Promise<void> {
	if (prefs.migrated) return;
	const [legacyVisible, legacyMode, legacyActive] = await Promise.all([
		readLegacyV1Pref(context, BADGE_VISIBLE_KV_KEY),
		readLegacyV1Pref(context, BADGE_DISPLAY_MODE_KV_KEY),
		readLegacyV1Pref(context, ACTIVE_PROFILE_NAME_KV_KEY),
	]);
	const nextVisible = typeof legacyVisible === "boolean" ? legacyVisible : prefs.badgeVisible;
	const nextMode = legacyMode === "model" || legacyMode === "profile" ? legacyMode : prefs.displayMode;
	const nextActive =
		typeof legacyActive === "string" && legacyActive.trim() ? legacyActive.trim() : prefs.activeProfileName;
	try {
		await updatePrefs((draft) => {
			draft.badgeVisible = nextVisible;
			draft.displayMode = nextMode;
			draft.activeProfileName = nextActive;
			draft.migrated = true;
		});
	} catch (error) {
		log.warn("migrateV1PrefsOnce: failed to persist migrated prefs", error);
	}
}

// ---------------------------------------------------------------------------
// Profile flows (V2 promise-chain ports of V1 `src/dialogs.tsx`)
// ---------------------------------------------------------------------------

type ProfileOpt = { title: string; value: string };

/** Ports V1 `handleActivateProfile` (~line 856). */
async function activateProfileFlow(
	context: Context,
	snapshot: RuntimeSnapshot,
	profilePath: string,
	profileName: string,
	updatePrefs: UpdatePrefs,
): Promise<void> {
	const api = buildV1Shim(context, snapshot);
	const updatedConfig = await activateProfileFile(api, profilePath, profileName);
	if (!updatedConfig) return;

	try {
		await updatePrefs((draft) => {
			draft.activeProfileName = profileName;
		});
	} catch (error) {
		log.warn("activateProfileFlow: failed to persist active profile name", error);
	}

	// Sync badge state after activation; attach profileName so it can render.
	const next = parseActiveProfileFromRaw(JSON.stringify(updatedConfig), api);
	setActiveProfile(next ? { ...next, profileName } : next);

	await context.ui.dialog.confirm({
		title: "Profile Activated",
		message: `Profile '${profileName}' successfully applied to global configuration.`,
	});
}

/** Ports V1 `showDeleteProfile` (called from the detail hub). Returns true when the detail loop should exit. */
async function deleteProfileFlow(context: Context, profileOpt: ProfileOpt): Promise<boolean> {
	const confirmed = await context.ui.dialog.confirm({
		title: "Delete Profile",
		message: `Permanently delete '${profileOpt.title}'?`,
	});
	if (!confirmed) return false;
	try {
		deleteProfileFile(profileOpt.value);
		toast(context, { title: "Deleted", message: `Profile '${profileOpt.title}' deleted` });
		return true;
	} catch (error: any) {
		log.warn(`deleteProfileFlow: failed to delete profile '${profileOpt.value}'`, error);
		toast(context, { title: "Error", message: `Failed to delete: ${error?.message || error}`, variant: "error" });
		return false;
	}
}

/** Ports V1 `showRenameProfile` (~line 907). Returns the renamed opt, or null when the detail loop should exit. */
async function renameProfileFlow(context: Context, profileOpt: ProfileOpt): Promise<ProfileOpt | null> {
	const next = await context.ui.dialog.prompt({ title: "Rename Profile", value: profileOpt.title });
	const trimmed = next?.trim();
	if (!trimmed || trimmed === profileOpt.title) return profileOpt;

	try {
		const finalName = sanitizeProfileName(trimmed);
		const newFileName = `${finalName}.json`;
		const { profilesDir } = resolvePaths();
		if (fs.existsSync(path.join(profilesDir, newFileName))) {
			toast(context, { title: "Error", message: "A profile with this name already exists", variant: "error" });
			return profileOpt;
		}
		renameProfileFile(profileOpt.value, newFileName);
		toast(context, { title: "Renamed", message: `Profile renamed to '${finalName}'` });
		return null;
	} catch (error: any) {
		log.warn(`renameProfileFlow: failed to rename profile '${profileOpt.value}' to '${next}'`, error);
		toast(context, { title: "Error", message: `Failed to rename: ${error?.message || error}`, variant: "error" });
		return profileOpt;
	}
}

/** Ports the V1 provider picker + model picker for one agent (`mode` primary or fallback). */
async function agentModelFlow(
	context: Context,
	snapshot: RuntimeSnapshot,
	profileOpt: ProfileOpt,
	agentName: string,
	mode: "model" | "fallback",
): Promise<void> {
	const { profilesDir } = resolvePaths();
	const profilePath = path.join(profilesDir, profileOpt.value);
	const api = buildV1Shim(context, snapshot);
	const providers = snapshot.providers;
	if (providers.length === 0) {
		toast(context, { title: "No Providers", message: "No authenticated providers found.", variant: "warning" });
		return;
	}

	while (true) {
		const providerChoice = await context.ui.dialog.select({
			title: `Provider for ${agentName}${mode === "fallback" ? " (fallback)" : ""}`,
			options: [
				...providers.map((provider) => ({
					title: provider.name || provider.id,
					value: provider.id,
					description: `${Object.keys(provider.models || {}).length} models available`,
				})),
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!providerChoice || providerChoice === "__back__") return;
		const selected = providers.find((provider) => provider.id === providerChoice);
		if (!selected) continue;

		const models = selected.models || {};
		const modelChoice = await context.ui.dialog.select({
			title: `${selected.name || selected.id} › ${agentName}${mode === "fallback" ? " (fallback)" : ""}`,
			options: [
				...Object.keys(models).map((key) => {
					const model = models[key];
					const ctxText = model?.limit?.context ? formatContext(model.limit.context) : "ctx: N/A";
					return {
						title: model?.name || key,
						value: `${selected.id}/${key}`,
						description: ctxText,
					};
				}),
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!modelChoice || modelChoice === "__back__") continue;

		const runtimePolicy = resolveRuntimeOrchestratorPolicy(api.state.config);
		try {
			if (mode === "fallback") {
				const result = updateProfilePhaseModel(profilePath, agentName, "fallback", modelChoice, runtimePolicy);
				toast(context, {
					title: result.changed ? "Updated" : "No Changes",
					message: result.changed
						? `${agentName} fallback set to ${modelChoice}. Version saved.`
						: `${agentName} fallback already uses ${modelChoice}`,
					variant: result.changed ? "success" : "warning",
				});
			} else {
				const result = updateProfilePhaseModel(profilePath, agentName, "primary", modelChoice, runtimePolicy);
				toast(context, {
					title: result.changed ? "Updated" : "No Changes",
					message: result.changed
						? `${agentName} set to ${modelChoice}. Version saved.`
						: `${agentName} already uses ${modelChoice}`,
					variant: result.changed ? "success" : "warning",
				});
			}
		} catch (error: any) {
			log.warn(`agentModelFlow: failed to update ${agentName}`, error);
			toast(context, { title: "Error", message: `Failed to update agent: ${error?.message || error}`, variant: "error" });
		}
		return;
	}
}

/** Ports the V1 reasoning-effort picker for one agent. */
async function reasoningEffortFlow(
	context: Context,
	snapshot: RuntimeSnapshot,
	profileOpt: ProfileOpt,
	agentName: string,
): Promise<void> {
	const { profilesDir } = resolvePaths();
	const profilePath = path.join(profilesDir, profileOpt.value);
	const api = buildV1Shim(context, snapshot);

	try {
		const profile = readProfileData(profilePath);
		const modelId = profile?.models?.[agentName];
		const current = profile?.configs?.[agentName]?.reasoningEffort;
		const state = buildReasoningEditState(api.state.provider || [], agentName, modelId, current);

		if (state.kind !== "selectable") {
			toast(context, {
				title: "Reasoning Unsupported",
				message: buildReasoningBlockedMessage(state),
				variant: "warning",
			});
			return;
		}

		const choice = await context.ui.dialog.select<string>({
			title: `Reasoning effort › ${agentName}`,
			options: [
				...state.options.map((value: string) => ({
					title: value,
					value,
					description: state.current === value ? "Current" : undefined,
				})),
				{ title: "Clear saved value", value: "__clear__", category: NAV_CATEGORY },
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!choice || choice === "__back__") return;

		const nextProfile = updateProfileReasoningEffort(profile, agentName, choice === "__clear__" ? "" : choice);
		writeProfileData(profilePath, nextProfile, resolveRuntimeOrchestratorPolicy(api.state.config));
		toast(context, { title: "Updated", message: `${agentName} reasoning effort updated`, variant: "success" });
	} catch (error: any) {
		log.warn(`reasoningEffortFlow: failed to update ${agentName}`, error);
		toast(context, { title: "Error", message: `Failed to update reasoning effort: ${error?.message || error}`, variant: "error" });
	}
}

/** Ports the V1 primary-models submenu. */
async function primaryModelsFlow(context: Context, snapshot: RuntimeSnapshot, profileOpt: ProfileOpt): Promise<void> {
	const api = buildV1Shim(context, snapshot);
	while (true) {
		const { profilesDir } = resolvePaths();
		const profileData = readProfileData(path.join(profilesDir, profileOpt.value));
		const sections = buildProfileDetailAgentSections(api.state.config, profileData);
		const choice = await context.ui.dialog.select<string>({
			title: `Primary models › ${profileOpt.title}`,
			options: buildPrimaryModelSubmenuOptions(profileData, sections, api),
		});
		if (!choice || choice === "__back__") return;
		const action = resolveProfileDetailSelectionAction(choice);
		if (action.action === "model") {
			await agentModelFlow(context, snapshot, profileOpt, action.agentName, "model");
		}
	}
}

/** Ports the V1 reasoning-effort submenu. */
async function reasoningModelsFlow(context: Context, snapshot: RuntimeSnapshot, profileOpt: ProfileOpt): Promise<void> {
	const api = buildV1Shim(context, snapshot);
	while (true) {
		const { profilesDir } = resolvePaths();
		const profileData = readProfileData(path.join(profilesDir, profileOpt.value));
		const sections = buildProfileDetailAgentSections(api.state.config, profileData);
		const choice = await context.ui.dialog.select<string>({
			title: `Reasoning effort › ${profileOpt.title}`,
			options: buildReasoningSubmenuOptions(profileData, sections),
		});
		if (!choice || choice === "__back__") return;
		const action = resolveProfileDetailSelectionAction(choice);
		if (action.action === "reasoning") {
			await reasoningEffortFlow(context, snapshot, profileOpt, action.agentName);
		}
	}
}

/** Ports the V1 fallback-models submenu. */
async function fallbackModelsFlow(context: Context, snapshot: RuntimeSnapshot, profileOpt: ProfileOpt): Promise<void> {
	const api = buildV1Shim(context, snapshot);
	while (true) {
		const { profilesDir } = resolvePaths();
		const profileData = readProfileData(path.join(profilesDir, profileOpt.value));
		const sections = buildProfileDetailAgentSections(api.state.config, profileData);
		const choice = await context.ui.dialog.select<string>({
			title: `Fallback models › ${profileOpt.title}`,
			options: buildFallbackSubmenuOptions(profileData, sections, api),
		});
		if (!choice || choice === "__back__") return;
		const action = resolveProfileDetailSelectionAction(choice);
		if (action.action === "fallback") {
			await agentModelFlow(context, snapshot, profileOpt, action.agentName, "fallback");
		}
	}
}

/** Ports the V1 bulk profile-action picker (fill/override across phases). */
async function bulkActionsFlow(context: Context, snapshot: RuntimeSnapshot, profileOpt: ProfileOpt): Promise<void> {
	const api = buildV1Shim(context, snapshot);
	const actions = buildBulkProfileActionOptions();
	while (true) {
		const choice = await context.ui.dialog.select({
			title: "Bulk profile actions",
			options: [
				...actions.map((action) => ({
					title: action.title,
					value: action.value,
					description: action.requiresConfirmation
						? "Requires confirmation before overwriting"
						: "Fill only empty or unassigned entries",
				})),
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!choice || choice === "__back__") return;
		const selected = actions.find((action) => action.value === choice);
		if (!selected) continue;

		if (selected.requiresConfirmation) {
			const confirmed = await context.ui.dialog.confirm({
				title: "Confirm bulk override",
				message: `${selected.title} will replace existing targeted assignments in '${profileOpt.title}'. A dated version will be saved first.`,
			});
			if (!confirmed) continue;
		}

		const providers = snapshot.providers;
		if (providers.length === 0) {
			toast(context, { title: "No Providers", message: "No authenticated providers found.", variant: "warning" });
			return;
		}
		const providerChoice = await context.ui.dialog.select({
			title: `Provider › ${selected.title}`,
			options: [
				...providers.map((provider) => ({
					title: provider.name || provider.id,
					value: provider.id,
					description: `${Object.keys(provider.models || {}).length} models available`,
				})),
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!providerChoice || providerChoice === "__back__") continue;
		const provider = providers.find((entry) => entry.id === providerChoice);
		if (!provider) continue;

		const models = provider.models || {};
		const modelChoice = await context.ui.dialog.select({
			title: `${provider.name || provider.id} › ${selected.title}`,
			options: [
				...Object.keys(models).map((key) => {
					const model = models[key];
					const ctxText = model?.limit?.context ? formatContext(model.limit.context) : "ctx: N/A";
					return { title: model?.name || key, value: `${provider.id}/${key}`, description: ctxText };
				}),
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!modelChoice || modelChoice === "__back__") continue;

		const { profilesDir } = resolvePaths();
		const profilePath = path.join(profilesDir, profileOpt.value);
		try {
			const primarySddAgentNames = Object.keys(api.state.config?.agent || {}).filter(isPrimarySddAgent);
			const runtimePolicy = resolveRuntimeOrchestratorPolicy(api.state.config);
			const { assignment } = updateProfileWithBulkPhaseAssignment(
				profilePath,
				primarySddAgentNames,
				modelChoice,
				selected.operation,
				runtimePolicy,
			);
			const totalAssigned = assignment.modelsAssigned + assignment.fallbackAssigned;
			toast(context, {
				title: totalAssigned > 0 ? "Updated" : "No Changes",
				message: totalAssigned > 0
					? `${selected.title}: ${assignment.modelsAssigned} primary and ${assignment.fallbackAssigned} fallback assignments set to ${modelChoice}. Version saved.`
					: "No targeted SDD primary or fallback phases required updates",
				variant: totalAssigned > 0 ? "success" : "warning",
			});
		} catch (error: any) {
			log.warn(`bulkActionsFlow: failed for profile '${profileOpt.value}'`, error);
			toast(context, { title: "Error", message: `Failed to update phases: ${error?.message || error}`, variant: "error" });
		}
		return;
	}
}

/** Ports the V1 profile-version browser (list, preview, restore). */
async function profileVersionsFlow(context: Context, profileOpt: ProfileOpt): Promise<void> {
	while (true) {
		let versions;
		try {
			versions = listProfileVersions(profileOpt.value);
		} catch (error: any) {
			log.warn(`profileVersionsFlow: failed to list versions for '${profileOpt.value}'`, error);
			toast(context, { title: "Version Error", message: error?.message || "Failed to list profile versions", variant: "error" });
			return;
		}
		if (versions.length === 0) {
			toast(context, { title: "No Versions", message: `No saved versions for '${profileOpt.title}'`, variant: "warning" });
			return;
		}
		const choice = await context.ui.dialog.select({
			title: `Versions: ${profileOpt.title}`,
			options: [
				...versions.map(buildProfileVersionListOption),
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!choice || choice === "__back__") return;

		let version;
		try {
			version = readProfileVersion(choice);
		} catch (error: any) {
			log.warn(`profileVersionsFlow: failed to read version '${choice}'`, error);
			toast(context, { title: "Version Error", message: error?.message || "Failed to read profile version", variant: "error" });
			continue;
		}
		const lines = formatProfileVersionPreviewLines(version);
		const previewChoice = await context.ui.dialog.select({
			title: `Preview: ${profileOpt.title}`,
			options: [
				...lines.map((line, index) => ({ title: line, value: `__line__${index}` })),
				{ title: "↩ Restore this version", value: "__restore__", category: NAV_CATEGORY },
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!previewChoice || previewChoice === "__back__") continue;
		if (previewChoice !== "__restore__") continue;

		const confirmed = await context.ui.dialog.confirm({
			title: "Restore profile version",
			message: `Restore '${profileOpt.title}' from this version? Current profile content will be overwritten.`,
		});
		if (!confirmed) continue;
		try {
			restoreProfileVersion(profileOpt.value, version.id);
			toast(context, { title: "Restored", message: `Profile '${profileOpt.title}' restored`, variant: "success" });
		} catch (error: any) {
			log.warn(`profileVersionsFlow: failed to restore '${version.id}'`, error);
			toast(context, { title: "Restore Failed", message: error?.message || "Failed to restore version", variant: "error" });
		}
		return;
	}
}

/** Ports V1 `showProfileDetail` (~line 662): the per-profile hub with all sub-flows. */
async function openProfileDetail(
	context: Context,
	snapshot: RuntimeSnapshot,
	profileOpt: ProfileOpt,
	updatePrefs: UpdatePrefs,
): Promise<void> {
	const api = buildV1Shim(context, snapshot);
	const { profilesDir } = resolvePaths();
	while (true) {
		let profileData;
		try {
			profileData = readProfileData(path.join(profilesDir, profileOpt.value));
		} catch (error) {
			log.warn(`openProfileDetail: failed to read profile '${profileOpt.value}'`, error);
			toast(context, { title: "Error", message: "Failed to read profile details", variant: "error" });
			return;
		}
		const sections = buildProfileDetailAgentSections(api.state.config, profileData);
		const choice = await context.ui.dialog.select({
			title: `Profile: ${profileOpt.title}`,
			options: buildProfileDetailHubOptions(api, profileOpt, profileData),
		});
		if (!choice || choice === "__back__") return;

		if (choice === "__assign__") {
			await activateProfileFlow(context, snapshot, path.join(profilesDir, profileOpt.value), profileOpt.title, updatePrefs);
			continue;
		}
		if (choice === "__delete__") {
			const exited = await deleteProfileFlow(context, profileOpt);
			if (exited) return;
			continue;
		}
		if (choice === "__rename__") {
			const next = await renameProfileFlow(context, profileOpt);
			// A rename moves the file V1 returns to the list for; any other
			// outcome stays on the hub.
			if (next === null) return;
			continue;
		}
		if (choice === "__bulk_actions__") {
			await bulkActionsFlow(context, snapshot, profileOpt);
			continue;
		}
		if (choice === "__profile_versions__") {
			await profileVersionsFlow(context, profileOpt);
			continue;
		}

		const navAction = resolveProfileDetailNavigationAction(choice);
		if (navAction.action === "submenu-primary") {
			await primaryModelsFlow(context, snapshot, profileOpt);
			continue;
		}
		if (navAction.action === "submenu-reasoning") {
			await reasoningModelsFlow(context, snapshot, profileOpt);
			continue;
		}
		if (navAction.action === "submenu-fallback") {
			await fallbackModelsFlow(context, snapshot, profileOpt);
			continue;
		}

		const selectionAction = resolveProfileDetailSelectionAction(choice);
		if (selectionAction.action === "model") {
			await agentModelFlow(context, snapshot, profileOpt, selectionAction.agentName, "model");
		} else if (selectionAction.action === "reasoning") {
			await reasoningEffortFlow(context, snapshot, profileOpt, selectionAction.agentName);
		} else if (selectionAction.action === "fallback") {
			await agentModelFlow(context, snapshot, profileOpt, selectionAction.agentName, "fallback");
		}
	}
}

/** Ports V1 `showProfileList` (~line 618). */
async function openProfileList(
	context: Context,
	snapshot: RuntimeSnapshot,
	updatePrefs: UpdatePrefs,
): Promise<void> {
	ensureProfilesDir();
	let files: string[];
	try {
		files = listProfileFiles();
	} catch (error) {
		log.warn("openProfileList: failed to list profiles", error);
		files = [];
	}
	if (files.length === 0) {
		toast(context, { title: "No Profiles", message: "No saved profiles found. Create one first!", variant: "warning" });
		return;
	}
	while (true) {
		const api = buildV1Shim(context, snapshot);
		const activeFile = detectActiveProfileFile(files, api);
		const choice = await context.ui.dialog.select({
			title: "Select SDD Profile",
			...(activeFile ? { current: activeFile } : {}),
			options: [
				...files.map((file) => ({
					title: `${file === activeFile ? "✓ " : ""}${file.replace(/\.json$/, "")}`,
					value: file,
					description: file === activeFile ? "✓ Active" : "SDD Profile",
				})),
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!choice || choice === "__back__") return;
		await openProfileDetail(
			context,
			snapshot,
			{ title: choice.replace(/\.json$/, ""), value: choice },
			updatePrefs,
		);
		// Refresh the listing after detail flows (rename/delete change files).
		try {
			files = listProfileFiles();
		} catch (error) {
			log.warn("openProfileList: failed to refresh profiles", error);
			return;
		}
		if (files.length === 0) {
			toast(context, { title: "No Profiles", message: "No saved profiles found. Create one first!", variant: "warning" });
			return;
		}
	}
}

/** Ports V1 `showCreateProfile` (~line 555). */
async function openCreateProfile(
	context: Context,
	snapshot: RuntimeSnapshot,
	updatePrefs: UpdatePrefs,
): Promise<void> {
	const { profilesDir } = resolvePaths();
	ensureProfilesDir();

	const name = await context.ui.dialog.prompt({
		title: "New SDD Profile Name",
		placeholder: "Enter profile name",
	});
	const trimmed = name?.trim();
	if (!trimmed) return;

	try {
		const finalName = sanitizeProfileName(trimmed);
		const fileName = `${finalName}.json`;
		const profilePath = path.join(profilesDir, fileName);

		if (fs.existsSync(profilePath)) {
			toast(context, {
				title: "Error",
				message: `Profile '${finalName}' already exists`,
				variant: "error",
			});
			return;
		}

		writeProfileModels(profilePath, {});
		await openProfileDetail(context, snapshot, { title: finalName, value: fileName }, updatePrefs);
		toast(context, {
			title: "Success",
			message: `Profile '${finalName}' created successfully`,
			variant: "success",
		});
	} catch (error: any) {
		log.warn(`openCreateProfile: failed to create profile '${trimmed}'`, error);
		toast(context, {
			title: "Error",
			message: `Failed to create profile: ${error?.message || error}`,
			variant: "error",
		});
	}
}

/** Cleans memory text for display (mirrors V1 `showMemoryDetail`). */
function sanitizeMemoryDisplayText(value: string): string {
	return value
		.replace(/\*\*(.*?)\*\*/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/→/g, "->");
}

/** Wraps long memory text lines to fit within the dialog width. */
function wrapDisplayText(value: string, max = 52): string[] {
	if (!value) return [" "];
	const words = sanitizeMemoryDisplayText(value).split(/\s+/).filter(Boolean);
	if (words.length === 0) return [" "];

	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		if (!current) {
			current = word;
			continue;
		}

		if (`${current} ${word}`.length <= max) {
			current = `${current} ${word}`;
			continue;
		}

		lines.push(current);
		current = word;
	}

	if (current) lines.push(current);
	return lines.length > 0 ? lines : [value];
}

/** Ports V1 `showMemoryDetail` + `showDeleteMemory`. */
async function openMemoryDetail(context: Context, memory: EngramObservation): Promise<void> {
	while (true) {
		const title = memory.title || memory.topic_key || `Memory #${memory.id}`;
		const metadata = `[${(memory.type || "manual").toUpperCase()}] ${formatMemoryDate(
			memory.updated_at || memory.created_at,
		)} · ${memory.scope || "project"}`;
		const contentLines = (memory.content || "No content")
			.split("\n")
			.flatMap((line) => wrapDisplayText(line || " "));

		const choice = await context.ui.dialog.select<string>({
			title: truncateText(title, 60),
			options: [
				{ title: metadata, value: "__meta__", category: "Memory" },
				...contentLines.map((line, index) => ({ title: line || " ", value: `__line__${index}` })),
				{ title: "✕ Delete Memory", value: "__delete__", category: NAV_CATEGORY },
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!choice || choice === "__back__") return;
		if (choice === "__delete__") {
			const confirmed = await context.ui.dialog.confirm({
				title: "Delete Memory",
				message: `Permanently delete '${truncateText(title, 48)}'?`,
			});
			if (!confirmed) continue;
			try {
				await deleteProjectMemory(memory.id);
				toast(context, { title: "Deleted", message: "Memory deleted successfully", variant: "success" });
				return;
			} catch (error: any) {
				log.warn(`openMemoryDetail: failed to delete memory ${memory?.id}`, error);
				toast(context, { title: "Error", message: error?.message || "Failed to delete memory", variant: "error" });
			}
		}
	}
}

/** Ports V1 `showProjectMemoriesMenu` (~line 1290). */
async function openProjectMemoriesMenu(context: Context): Promise<void> {
	// `listProjectMemories` resolves project candidates from
	// `state.path.directory`, so the shim carries the V2 location directory.
	const shim = { state: { path: { directory: context.location?.directory } } };
	const projectName = resolveEngramProjectName(shim) || resolveConfigProjectName(shim) || "project";

	while (true) {
		let memories: EngramObservation[];
		try {
			memories = await listProjectMemories(shim);
		} catch (error: any) {
			log.warn(`openProjectMemoriesMenu: failed to load memories for ${projectName}`, error);
			toast(context, { title: "Error", message: `Failed to load memories: ${error?.message || error}`, variant: "error" });
			return;
		}

		if (memories.length === 0) {
			toast(context, {
				title: "No Memories",
				message: `No project observations found for ${projectName}`,
				variant: "warning",
			});
			return;
		}

		const choice = await context.ui.dialog.select<string>({
			title: `Memories: ${projectName}`,
			options: [
				...memories.map((memory) => ({
					title: truncateText(`[${memory.id}] ${memory.title || memory.topic_key || `Memory #${memory.id}`}`, 60),
					value: String(memory.id),
					description: `[${(memory.type || "manual").toUpperCase()}] ${formatMemoryDate(
						memory.updated_at || memory.created_at,
					)} · ${memory.scope || "project"}`,
				})),
				{ title: "← Back", value: "__back__", category: NAV_CATEGORY },
			],
		});
		if (!choice || choice === "__back__") return;
		const memory = memories.find((item) => String(item.id) === choice);
		if (!memory) continue;
		await openMemoryDetail(context, memory);
	}
}

async function openProfilesMenu(
	context: Context,
	prefs: SddPrefs,
	updatePrefs: UpdatePrefs,
): Promise<void> {
	await migrateV1PrefsOnce(context, prefs, updatePrefs);
	const snapshot = await loadRuntimeSnapshot(context);
	while (true) {
		const choice = await context.ui.dialog.select({
			title: "SDD Profile Management",
			options: [
				{ title: "Create new SDD profile", value: "create", description: "Create an empty SDD profile" },
				{ title: "Manage SDD profiles", value: "list", description: "List and activate saved SDD profiles" },
				{ title: "View project memories", value: "memories", description: "Show recent Engram observations" },
				{ title: `Badge: ${prefs.badgeVisible ? "On" : "Off"}`, value: "toggle_badge", description: "Show or hide the badge" },
				{ title: `Badge mode: ${prefs.displayMode === "profile" ? "Profile" : "Model"}`, value: "toggle_mode", description: "Show model info or profile name" },
				{ title: "Close", value: "__close__" },
			],
		});
		if (!choice || choice === "__close__") return;
		if (choice === "create") {
			await openCreateProfile(context, snapshot, updatePrefs);
		} else if (choice === "list") {
			await openProfileList(context, snapshot, updatePrefs);
		} else if (choice === "memories") {
			await openProjectMemoriesMenu(context);
		} else if (choice === "toggle_badge") {
			const nextVisible = !prefs.badgeVisible;
			await updatePrefs((draft) => {
				draft.badgeVisible = nextVisible;
			});
			toast(context, { title: "Badge", message: `Badge ${nextVisible ? "shown" : "hidden"}.`, variant: "success" });
		} else if (choice === "toggle_mode") {
			const nextMode = prefs.displayMode === "model" ? "profile" : "model";
			await updatePrefs((draft) => {
				draft.displayMode = nextMode;
			});
			toast(context, { title: "Badge mode", message: "Badge display mode updated.", variant: "success" });
		}
	}
}

/** Opens the SDD profiles menu from the `sdd-model` command (`run`). */
function openSddMenu(context: Context): void {
	try {
		// `storage.store` is synchronous and returns `[state, update]`
		// (see `@opencode/plugin` storage types); the same key yields the
		// live-synced store created in `setup`.
		const [prefs, updatePrefs] = context.storage.store<SddPrefs>("sdd-prefs", {
			initial: initialPrefs,
		});
		void openProfilesMenu(context, prefs, updatePrefs).catch((error) => {
			log.warn("sdd-model command: profiles menu failed", error);
		});
	} catch (error) {
		log.warn("sdd-model command: failed to open profiles menu", error);
		toast(context, { title: "Error", message: "Failed to open SDD profiles", variant: "error" });
	}
}

/**
 * Registers the plugin keymap layer. Must run inside a mounted component body
 * (`context.keymap.layer` is owned by the calling component — see PR99
 * `useKeymapLayer`, called synchronously from the sidebar component body with
 * no `createEffect`/`onMount`), never in `setup()`. Called from `SddBadge`,
 * so the palette command lives and dies with slots that definitely mount
 * (`sidebar.content`, `home.footer.status`). PR99 proves sidebar-content
 * ownership; the previous `app`-slot owner never surfaced in the live TUI
 * (no badge, no palette entry, zero errors), so the palette is never owned
 * solely by the unproven `app` slot.
 */
function useSddKeymapLayer(context: Context): void {
	// V1 parity: shortcuts come from `sdd-model-select.json`
	// (`readPluginShortcutBindings`, default Alt+K/Cmd+K). `KeymapCommand.bind`
	// holds a single binding string, so the first binding goes on the named
	// palette command and any extras ride as inline commands sharing `run`.
	// (The old top-level `bindings: ["sdd-model"]` only activated
	// user-configured bindings for that id — it never created the default
	// shortcut, so the keyboard shortcut was dead. Removed.)
	let shortcutBindings: string[];
	try {
		shortcutBindings = readPluginShortcutBindings();
	} catch (error) {
		log.warn("useSddKeymapLayer: failed to read shortcut bindings, using defaults", error);
		shortcutBindings = ["alt+k", "super+k"];
	}
	if (shortcutBindings.length === 0) shortcutBindings = ["alt+k", "super+k"];
	const openMenu = (): void => openSddMenu(context);
	const [primaryBinding, ...extraBindings] = shortcutBindings;
	try {
		context.keymap.layer(() => ({
			mode: "global",
			commands: [
				{
					id: "sdd-model",
					title: "SDD Profiles",
					group: "SDD",
					bind: primaryBinding,
					palette: true,
					// Slash registration: `/sdd-model` works in the prompt
					// regardless of palette discovery.
					slash: { name: "sdd-model" },
					run: openMenu,
				},
				...extraBindings.map((binding) => ({
					bind: binding,
					run: openMenu,
				})),
			],
		}));
	} catch (error) {
		log.warn("useSddKeymapLayer: failed to register keymap layer", error);
	}
}

function SddBadge(props: { context: Context; prefs: SddPrefs; sessionID?: string }) {
	const context = props.context;
	// Own the palette command here: this body always executes while the slot
	// is mounted, even when the badge visuals below are hidden via `Show`.
	useSddKeymapLayer(context);
	const theme = context.theme;
	// Optional chaining + hex fallbacks: a custom/incomplete theme must never
	// throw inside render and take down the slot.
	const accent = rgbaToHex(theme?.text?.feedback?.success?.base, "#00ff00");
	const muted = rgbaToHex(theme?.text?.muted, "#888888");
	const base = rgbaToHex(theme?.text?.base, "#ffffff");
	const profile = resolveBadgeProfile(context, props.sessionID);
	return (
		<Show when={props.prefs.badgeVisible}>
			<box flexDirection="row" alignItems="center" paddingLeft={1} paddingRight={1}>
				<text fg={profile ? accent : muted} attributes={profile ? 1 : 0}>
					{profile ? "󰚩 " : "󱚧 "}
				</text>
				<text fg={base}>
					{formatActiveModelBadgeText(profile, props.prefs.displayMode)}
				</text>
			</box>
		</Show>
	);
}

export default Plugin.define({
	id: "sdd-model-select",
	setup(context) {
		const disposers: Array<() => void> = [];
		const failures: string[] = [];
		const fail = (step: string, error: unknown): void => {
			failures.push(step);
			// `log` writes to stderr, so the failure stays visible even when
			// the toast below cannot render yet.
			log.warn(`setup: ${step} failed; continuing without it`, error);
		};

		// Each registration below is isolated: one bad slot must never kill
		// the others. `storage.store` is synchronous and returns
		// `[state, update]` (see `@opencode/plugin` storage types).
		let prefs: Store<SddPrefs> | undefined;
		try {
			const [initial, update] = context.storage.store<SddPrefs>("sdd-prefs", {
				initial: initialPrefs,
			});
			prefs = initial;
			// `update` is only consumed by the palette command (which
			// re-reads the store itself); slots render from `prefs`.
			void update;
		} catch (error) {
			fail("storage.store(sdd-prefs)", error);
		}

		if (prefs) {
			const badgePrefs = prefs;
			try {
				disposers.push(
					context.ui.slot({
						append: "sidebar.content",
						render: ({ sessionID }) => (
							<SddBadge context={context} prefs={badgePrefs} sessionID={sessionID} />
						),
					}),
				);
			} catch (error) {
				fail("slot sidebar.content", error);
			}

			try {
				disposers.push(
					context.ui.slot({
						append: "home.footer.status",
						render: () => {
							// Route through context.ui.router so the footer reflects the
							// current location (session vs home).
							let sessionID: string | undefined;
							try {
								const route = context.ui.router.current();
								if (route.type === "session") sessionID = route.sessionID;
							} catch (error) {
								log.warn("home.footer.status: router read failed", error);
							}
							return <SddBadge context={context} prefs={badgePrefs} sessionID={sessionID} />;
						},
					}),
				);
			} catch (error) {
				fail("slot home.footer.status", error);
			}
		} else {
			fail("slot sidebar.content (skipped: no prefs)", "storage init failed");
			fail("slot home.footer.status (skipped: no prefs)", "storage init failed");
		}

		if (failures.length > 0) {
			// VISIBLE degradation signal: stderr log above plus a toast, so a
			// partial init can never pass silently.
			const message =
				`SDD plugin partially initialized (${failures.length} step(s) failed: ` +
				`${failures.join("; ")}. Continuing with the rest. See logs for details.)`;
			log.warn(`setup: ${message}`);
			try {
				context.ui.toast.show({
					title: "SDD plugin",
					message,
					variant: "warning",
					duration: 8000,
				});
			} catch (error) {
				log.warn("setup: failed to show degradation toast", error);
			}
		}

		return () => {
			for (const dispose of disposers) {
				try {
					dispose();
				} catch (error) {
					log.warn("cleanup: slot dispose failed", error);
				}
			}
		};
	},
});

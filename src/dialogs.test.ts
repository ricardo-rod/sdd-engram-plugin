import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BULK_ASSIGNMENT_MODE, BULK_ASSIGNMENT_TARGET, PROFILE_VERSION_SOURCE } from './types';
import { buildBulkProfileActionOptions, buildProfileVersionListOption, createFallbackSubmenuDialogProps, createPrimarySubmenuDialogProps, createReasoningSubmenuDialogProps, formatProfileVersionPreviewLines } from './dialogs';
import { buildProfileAgentRows, buildProfileListOptions, createProfileListDialogProps, resolvePersistedActiveProfileFile } from './dialogs';
import { buildProfileDetailAgentSections, resolveRuntimeOrchestratorPolicy, buildReasoningRowForAgent, buildReasoningBlockedMessage } from './dialogs';
import { resolveProfileDetailSelectionAction, wrapDisplayText, sanitizeMemoryDisplayText } from './dialogs';
import {
  buildModelMutationContext,
  buildBulkModelMutationContext,
  createModelSelectionHandler,
  createModelPickerDialogProps,
  createReasoningEffortPickerDialogProps,
  createBulkModelSelectionHandler,
  createBulkReasoningEffortPickerDialogProps,
  createBulkModelPickerDialogProps,
  PROFILE_DETAIL_SUBMENU,
  createProfileDetailDialogProps,
  buildFallbackSubmenuOptions,
  buildPrimaryModelSubmenuOptions,
  buildProfileDetailHubOptions,
  buildReasoningSubmenuOptions,
  returnToProfileDetailTarget,
  resolveProfileDetailNavigationAction,
  registerDialogCallbacks,
  showProfileDetail,
  showMemoryDetail,
  showModelPickerForBulkProfilePhases,
  showModelPickerForAgent,
  showProfileDetailSubmenuPrimary,
  showProfileDetailSubmenuReasoning,
  showProfileDetailSubmenuFallback,
  showReasoningEffortPicker,
  showBulkProfileActions,
  showProviderPickerForBulkProfilePhases,
  showProfileVersions,
  showProfileVersionPreview,
  showProviderPickerForAgent,
  showProjectMemoriesMenu,
  showProfilesMenu,
  showProfileList,
  showCreateProfile,
  showRenameProfile,
  showDeleteProfile,
  showConfirmRestoreProfileVersion,
  handleActivateProfile,
  showDeleteMemory,
} from './dialogs';
import type { DialogSize } from './types';
import * as profiles from './profiles';
import { getOrchestratorPolicy } from './orchestrator';
import { buildCatalogSections, CATALOG_GROUPS, VISIBLE_CATALOG_ROWS } from './catalog';

describe('dialog pure builders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    registerDialogCallbacks({
      showProfilesMenu,
      showProfileList,
      showProfileDetail,
      showProjectMemoriesMenu,
    });
  });

  it('shows canonical orchestrator row for updated runtime', () => {
    const policy = getOrchestratorPolicy(['gentle-orchestrator', 'sdd-init']);
    const rows = buildProfileAgentRows(
      ['sdd-orchestrator', 'gentle-orchestrator', 'sdd-init'],
      {
        models: {
          'sdd-orchestrator': 'legacy/model',
          'gentle-orchestrator': 'new/model',
          'sdd-init': 'phase/model',
        },
      },
      policy,
    );

    const titles = rows.map((row) => row.title);
    expect(titles).toContain('gentle-orchestrator');
    expect(titles).not.toContain('sdd-orchestrator');
  });

  it('derives updated-runtime policy from api.state.config and builds canonical detail rows', () => {
    const apiConfig = {
      default_agent: 'gentle-orchestrator',
      agent: {
        'sdd-init': { model: 'phase/model' },
        'sdd-orchestrator': { model: 'legacy/model' },
        'gentle-orchestrator': { model: 'new/model' },
      },
    };

    const policy = resolveRuntimeOrchestratorPolicy(apiConfig as any);
    const sections = buildProfileDetailAgentSections(apiConfig as any, {
      models: {
        'sdd-orchestrator': 'legacy/model',
        'gentle-orchestrator': 'new/model',
        'sdd-init': 'phase/model',
      },
      fallback: { 'sdd-init': 'fallback/model' },
    });

    expect(policy.canonicalName).toBe('gentle-orchestrator');
    expect(sections.sddAgents.map(([name]) => name)).toContain('gentle-orchestrator');
    expect(sections.sddAgents.map(([name]) => name)).not.toContain('sdd-orchestrator');
    expect(sections.sddAgents.find(([name]) => name === 'gentle-orchestrator')?.[1]).toBe('new/model');
    expect(sections.fallbackAgents).toEqual([
      ['sdd-init', 'fallback/model'],
    ]);
  });

  it('derives legacy policy from api.state.config and keeps legacy orchestrator in detail rows', () => {
    const apiConfig = {
      default_agent: 'sdd-orchestrator',
      agent: {
        'sdd-init': { model: 'phase/model' },
        'sdd-orchestrator': { model: 'legacy/model' },
      },
    };

    const policy = resolveRuntimeOrchestratorPolicy(apiConfig as any);
    const sections = buildProfileDetailAgentSections(apiConfig as any, {
      models: {
        'sdd-orchestrator': 'legacy/model',
        'sdd-init': 'phase/model',
      },
      fallback: {},
    });

    expect(policy.canonicalName).toBe('sdd-orchestrator');
    expect(sections.sddAgents.map(([name]) => name)).toContain('sdd-orchestrator');
    expect(sections.sddAgents.map(([name]) => name)).not.toContain('gentle-orchestrator');
  });

  it('includes review and jd subagents in detail rows and fallback rows', () => {
    const apiConfig = {
      default_agent: 'gentle-orchestrator',
      agent: {
        'sdd-init': { model: 'phase/model' },
        'review-risk': { model: 'review/model' },
        'jd-judge-a': { model: 'judge/model' },
        'gentle-orchestrator': { model: 'new/model' },
      },
    };

    const sections = buildProfileDetailAgentSections(apiConfig as any, {
      models: {
        'sdd-init': 'phase/model',
        'review-risk': 'review/model',
        'jd-judge-a': 'judge/model',
        'gentle-orchestrator': 'new/model',
      },
      fallback: {
        'review-risk': 'review/fallback',
        'jd-judge-a': 'judge/fallback',
      },
    });

    expect(sections.sddAgents.map(([name]) => name)).toEqual([
      'gentle-orchestrator',
      'jd-judge-a',
      'review-risk',
      'sdd-init',
    ]);
    expect(sections.fallbackAgents).toEqual([
      ['jd-judge-a', 'judge/fallback'],
      ['review-risk', 'review/fallback'],
      ['sdd-init', undefined],
    ]);
  });

  it('exposes exactly two Spanish bulk actions without confirmation metadata', () => {
    const options = buildBulkProfileActionOptions();

    expect(options).toEqual([
      {
        title: 'Asignar un modelo y esfuerzo a todos los agentes',
        value: 'bulk:assign-model-and-effort',
        target: BULK_ASSIGNMENT_TARGET.PRIMARY,
      },
      {
        title: 'Asignar un modelo y esfuerzo a todos los agentes fallback',
        value: 'bulk:assign-model-and-effort:fallback',
        target: BULK_ASSIGNMENT_TARGET.FALLBACK,
      },
    ]);
  });

  it('formats profile version previews with date, operation, assignments, and raw excerpt', () => {
    const lines = formatProfileVersionPreviewLines({
      version: 1,
      id: 'team.json/2026-04-26T10-00-00-000Z-a.json',
      profileFile: 'team.json',
      createdAt: '2026-04-26T10:00:00.000Z',
      source: PROFILE_VERSION_SOURCE.BULK,
      operation: { source: PROFILE_VERSION_SOURCE.BULK, target: BULK_ASSIGNMENT_TARGET.BOTH, mode: BULK_ASSIGNMENT_MODE.FILL_ONLY },
      operationSummary: 'Set 2 primary and 1 fallback phases',
      beforeRaw: '{"models":{"sdd-init":"old/model"},"fallback":{"sdd-init":"old/fallback"}}',
      preview: { models: { 'sdd-init': 'old/model' }, fallback: { 'sdd-init': 'old/fallback' } }
    });

    expect(lines).toContain('Perfil: team.json');
    expect(lines).toContain('Origen: Masivo');
    expect(lines).toContain('Operación: Set 2 primary and 1 fallback phases');
    expect(lines).toContain('Primario: sdd-init -> old/model');
    expect(lines).toContain('fallback: sdd-init -> old/fallback');
    expect(lines.some((line) => line.startsWith('Contenido: {"models"'))).toBe(true);
  });

  it('builds version list labels with source, date, and operation summary', () => {
    const option = buildProfileVersionListOption({
      version: 1,
      id: 'team.json/2026-04-26T10-00-00-000Z-a.json',
      profileFile: 'team.json',
      createdAt: '2026-04-26T10:00:00.000Z',
      source: PROFILE_VERSION_SOURCE.BULK,
      operation: { source: PROFILE_VERSION_SOURCE.BULK, target: BULK_ASSIGNMENT_TARGET.PRIMARY, mode: BULK_ASSIGNMENT_MODE.OVERWRITE },
      operationSummary: 'Override all primary phases: 2 primary, 0 fallback',
      preview: { models: { 'sdd-init': 'old/model' }, fallback: {} }
    });

    expect(option).toEqual({
      title: expect.stringContaining('Masivo'),
      value: 'team.json/2026-04-26T10-00-00-000Z-a.json',
      description: 'Override all primary phases: 2 primary, 0 fallback',
    });
    expect(option.title).toContain('2026');
  });

  it('builds concise reasoning detail rows with stable action tokens', () => {
    const withValue = buildReasoningRowForAgent({ configs: { 'sdd-apply': { reasoningEffort: 'high' } } }, 'sdd-apply');
    expect(withValue).toEqual({
      title: 'sdd-apply: high',
      value: 'reasoning:sdd-apply',
      category: 'Núcleo SDD',
    });

    const withoutValue = buildReasoningRowForAgent({}, 'sdd-apply');
    expect(withoutValue.title).toBe('sdd-apply: Sin asignar');
  });

  it('returns explicit blocked messages for missing-model and unsupported states', () => {
    expect(buildReasoningBlockedMessage({ kind: 'missing-model', agentName: 'sdd-apply' })).toContain('Asigna un modelo primario');
    expect(buildReasoningBlockedMessage({ kind: 'unsupported', agentName: 'sdd-apply', modelId: 'openai/gpt-4.1' })).toContain('no expone opciones de esfuerzo de razonamiento');
  });


  it('prioritizes a safely mapped persisted active profile name in profile list rows', () => {
    const files = ['GLOBAL-1.json', 'team.json'];
    const activeFile = resolvePersistedActiveProfileFile(files, 'GLOBAL-1');
    const options = buildProfileListOptions(files, activeFile);

    expect(activeFile).toBe('GLOBAL-1.json');
    expect(options[0]).toEqual({ title: '✓ GLOBAL-1', value: 'GLOBAL-1.json', description: '✓ Activo' });
    expect(options[1]).toEqual({ title: 'team', value: 'team.json', description: 'Perfil SDD' });
  });

  it('falls back to config detection when persisted active profile name is stale or unsafe', () => {
    expect(resolvePersistedActiveProfileFile(['team.json'], 'missing')).toBeUndefined();
    expect(resolvePersistedActiveProfileFile(['team.json'], '../team')).toBeUndefined();
    expect(resolvePersistedActiveProfileFile(['team.json'], 'team.json')).toBe('team.json');
  });

  it('passes the persisted active profile file to DialogSelect current', () => {
    const props = createProfileListDialogProps(['GLOBAL-1.json', 'team.json'], 'GLOBAL-1.json', vi.fn(), vi.fn());

    expect(props.current).toBe('GLOBAL-1.json');
    expect(props.options[0]).toEqual({ title: '✓ GLOBAL-1', value: 'GLOBAL-1.json', description: '✓ Activo' });
  });

  it('routes profile detail selection actions to reasoning/model/fallback branches', () => {
    expect(resolveProfileDetailSelectionAction('reasoning:sdd-apply')).toEqual({ action: 'reasoning', agentName: 'sdd-apply' });
    expect(resolveProfileDetailSelectionAction('model:sdd-design')).toEqual({ action: 'model', agentName: 'sdd-design' });
    expect(resolveProfileDetailSelectionAction('fallback:sdd-design')).toEqual({ action: 'fallback', agentName: 'sdd-design' });
  });

  it('does not route navigation/internal tokens as reasoning edit actions', () => {
    expect(resolveProfileDetailSelectionAction('__back__')).toEqual({ action: 'noop' });
    expect(resolveProfileDetailSelectionAction('')).toEqual({ action: 'noop' });
    expect(resolveProfileDetailSelectionAction('unknown-token')).toEqual({ action: 'noop' });
  });

  it('builds profile detail hub with the complete grouped primary catalog and navigation actions', () => {
    const api = {
      state: {
        config: {
          default_agent: 'gentle-orchestrator',
          agent: {
            'gentle-orchestrator': {},
            'sdd-apply': {},
            'legacy-runtime-only': {},
          },
        },
        provider: [],
      },
    } as any;
    const profileOpt = { title: 'team', value: 'team.json' };
    const profileData = {
      models: {
        'gentle-orchestrator': 'openai/gpt-4.1',
        'sdd-apply': 'openai/gpt-4.1',
        'sdd-design': 'openai/gpt-4.1-mini',
      },
      fallback: { 'sdd-apply': 'openai/gpt-4.1-mini' },
      configs: { 'sdd-apply': { reasoningEffort: 'medium' } },
    };

    const options = buildProfileDetailHubOptions(api as any, profileOpt, profileData);
    const submenuValues = options
      .filter((option) => option.value.startsWith('__submenu_'))
      .map((option) => option.value)
      .sort();

    expect(submenuValues).toEqual([
      PROFILE_DETAIL_SUBMENU.FALLBACK,
      PROFILE_DETAIL_SUBMENU.REASONING,
    ]);

    const optionValues = options.map((option) => option.value);
    const modelOptions = options.filter((option) => String(option.value).startsWith('model:'));
    expect(modelOptions.map((option) => option.value)).toEqual(
      CATALOG_GROUPS.flatMap((group) => group.agents.map((agent) => `model:${agent}`)),
    );
    expect(modelOptions.map((option) => option.category)).toEqual(
      CATALOG_GROUPS.flatMap((group) => group.agents.map(() => group.labelEs)),
    );
    expect(modelOptions).toHaveLength(25);
    expect(modelOptions.find((option) => option.value === 'model:sdd-ORCHETATOR')?.description).toContain('openai/gpt-4.1');
    expect(modelOptions.find((option) => option.value === 'model:summary')?.description).toBe('Sin asignar');
    expect(modelOptions.some((option) => option.title === 'legacy-runtime-only')).toBe(false);
    expect(modelOptions.some((option) => option.value.startsWith('__'))).toBe(false);
    expect(optionValues.some((value) => String(value).startsWith('reasoning:'))).toBe(false);
    expect(optionValues.some((value) => String(value).startsWith('fallback:'))).toBe(false);
    expect(optionValues).toContain('__rename__');
    expect(optionValues).not.toContain('__profile_versions__');
    expect(optionValues[1]).toBe('__bulk_actions__');

    expect(options.some((option) => option.category === 'Agentes')).toBe(false);
    const bulkActionsOption = options.find((option) => option.value === '__bulk_actions__');
    expect(bulkActionsOption?.category).toBe('Navegación de modelos');
    expect(options.find((option) => option.value === PROFILE_DETAIL_SUBMENU.REASONING)?.category).toBe('Navegación');
    expect(options.find((option) => option.value === PROFILE_DETAIL_SUBMENU.FALLBACK)?.category).toBe('Navegación');
  });

  it('builds submenu option sets and resolves submenu navigation tokens', () => {
    const profileData = {
      models: { 'sdd-apply': 'openai/gpt-4.1', 'sdd-design': 'openai/gpt-4.1-mini' },
      fallback: { 'sdd-design': 'openai/gpt-4.1-nano' },
      configs: { 'sdd-apply': { reasoningEffort: 'high' } },
    };
    const sections = {
      sddAgentNames: ['sdd-apply', 'sdd-design'],
      sddAgents: [
        ['sdd-apply', 'openai/gpt-4.1'],
        ['sdd-design', 'openai/gpt-4.1-mini'],
      ],
      fallbackAgents: [
        ['sdd-design', 'openai/gpt-4.1-nano'],
      ],
      policy: { canonicalName: 'sdd-orchestrator' },
    } as any;

    const primary = buildPrimaryModelSubmenuOptions(profileData, sections);
    const reasoning = buildReasoningSubmenuOptions(profileData, sections);
    const fallback = buildFallbackSubmenuOptions(profileData, sections);

    expect(primary.some((option) => option.value === 'model:sdd-apply')).toBe(true);
    expect(reasoning.some((option) => option.value === 'reasoning:sdd-design')).toBe(true);
    expect(fallback.some((option) => option.value === 'fallback:sdd-design')).toBe(true);
    expect(primary.at(-1)?.value).toBe('__back__');
    expect(reasoning.at(-1)?.value).toBe('__back__');
    expect(fallback.at(-1)?.value).toBe('__back__');

    expect(resolveProfileDetailNavigationAction(PROFILE_DETAIL_SUBMENU.PRIMARY)).toEqual({ action: 'submenu-primary' });
    expect(resolveProfileDetailNavigationAction(PROFILE_DETAIL_SUBMENU.REASONING)).toEqual({ action: 'submenu-reasoning' });
    expect(resolveProfileDetailNavigationAction(PROFILE_DETAIL_SUBMENU.FALLBACK)).toEqual({ action: 'submenu-fallback' });
    expect(resolveProfileDetailNavigationAction('__back__')).toEqual({ action: 'back' });
    expect(resolveProfileDetailNavigationAction('model:sdd-apply')).toEqual({ action: 'selection' });
  });

  it('runtime: Back from each submenu returns safely to profile detail hub without writes', () => {
    const api = { state: { config: { agent: { 'sdd-apply': {}, 'sdd-design': {} } }, provider: [] } } as any;
    const profileOpt = { title: 'team', value: 'team.json' };
    const profileData = { models: { 'sdd-apply': 'openai/gpt-4.1' }, fallback: {}, configs: {} } as any;
    const sections = buildProfileDetailAgentSections(api.state.config, profileData);
    const showHub = vi.fn();
    const showProvider = vi.fn();
    const showReasoning = vi.fn();

    const primary = createPrimarySubmenuDialogProps(api, profileOpt, profileData, sections, { showProfileDetail: showHub, showProviderPickerForAgent: showProvider });
    const reasoning = createReasoningSubmenuDialogProps(api, profileOpt, profileData, sections, { showProfileDetail: showHub, showReasoningEffortPicker: showReasoning });
    const fallback = createFallbackSubmenuDialogProps(api, profileOpt, profileData, sections, { showProfileDetail: showHub, showProviderPickerForAgent: showProvider });

    primary.onSelect({ value: '__back__' });
    reasoning.onSelect({ value: '__back__' });
    fallback.onSelect({ value: '__back__' });

    expect(showHub).toHaveBeenCalledTimes(3);
    expect(showProvider).not.toHaveBeenCalled();
    expect(showReasoning).not.toHaveBeenCalled();
  });

  it('runtime: Cancel from each submenu returns safely to profile detail hub without writes', () => {
    const api = { state: { config: { agent: { 'sdd-apply': {}, 'sdd-design': {} } }, provider: [] } } as any;
    const profileOpt = { title: 'team', value: 'team.json' };
    const profileData = { models: { 'sdd-apply': 'openai/gpt-4.1' }, fallback: {}, configs: {} } as any;
    const sections = buildProfileDetailAgentSections(api.state.config, profileData);
    const showHub = vi.fn();
    const showProvider = vi.fn();
    const showReasoning = vi.fn();

    const primary = createPrimarySubmenuDialogProps(api, profileOpt, profileData, sections, { showProfileDetail: showHub, showProviderPickerForAgent: showProvider });
    const reasoning = createReasoningSubmenuDialogProps(api, profileOpt, profileData, sections, { showProfileDetail: showHub, showReasoningEffortPicker: showReasoning });
    const fallback = createFallbackSubmenuDialogProps(api, profileOpt, profileData, sections, { showProfileDetail: showHub, showProviderPickerForAgent: showProvider });

    primary.onCancel();
    reasoning.onCancel();
    fallback.onCancel();

    expect(showHub).toHaveBeenCalledTimes(3);
    expect(showProvider).not.toHaveBeenCalled();
    expect(showReasoning).not.toHaveBeenCalled();
  });

  it('runtime: submenu routing preserves origin when opening detail pickers', () => {
    const api = { state: { config: { agent: { 'sdd-apply': {}, 'sdd-design': {} } }, provider: [] } } as any;
    const profileOpt = { title: 'team', value: 'team.json' };
    const profileData = {
      models: { 'sdd-apply': 'openai/gpt-4.1', 'sdd-design': 'openai/gpt-4.1-mini' },
      fallback: { 'sdd-apply': 'openai/gpt-4.1-mini' },
      configs: { 'sdd-apply': { reasoningEffort: 'medium' } },
    } as any;
    const sections = buildProfileDetailAgentSections(api.state.config, profileData);
    const showHub = vi.fn();
    const showProvider = vi.fn();
    const showReasoning = vi.fn();

    const primary = createPrimarySubmenuDialogProps(api, profileOpt, profileData, sections, { showProfileDetail: showHub, showProviderPickerForAgent: showProvider });
    const reasoning = createReasoningSubmenuDialogProps(api, profileOpt, profileData, sections, { showProfileDetail: showHub, showReasoningEffortPicker: showReasoning });
    const fallback = createFallbackSubmenuDialogProps(api, profileOpt, profileData, sections, { showProfileDetail: showHub, showProviderPickerForAgent: showProvider });

    primary.onSelect({ value: 'model:sdd-apply' });
    fallback.onSelect({ value: 'fallback:sdd-apply' });
    reasoning.onSelect({ value: 'reasoning:sdd-apply' });

    expect(showProvider).toHaveBeenNthCalledWith(1, api, profileOpt, 'sdd-apply', 'model', 'primary');
    expect(showProvider).toHaveBeenNthCalledWith(2, api, profileOpt, 'sdd-apply', 'fallback', 'fallback');
    expect(showReasoning).toHaveBeenCalledWith(api, profileOpt, 'sdd-apply', 'reasoning');
    expect(showHub).not.toHaveBeenCalled();
  });

  it('runtime: inline primary model row from hub opens provider picker with hub return target', () => {
    const api = { state: { config: { agent: { 'sdd-apply': {}, 'sdd-design': {} } }, provider: [] } } as any;
    const profileOpt = { title: 'team', value: 'team.json' };
    const profilePath = '/tmp/team.json';
    const profileData = {
      models: { 'sdd-apply': 'openai/gpt-4.1', 'sdd-design': 'openai/gpt-4.1-mini' },
      fallback: {},
      configs: {},
    } as any;
    const sections = buildProfileDetailAgentSections(api.state.config, profileData);

    const showProfileList = vi.fn();
    const showProvider = vi.fn();

    const props = createProfileDetailDialogProps(api, profileOpt, profilePath, profileData, sections, {
      showProfileList,
      showProviderPickerForAgent: showProvider,
    });

    props.onSelect({ value: 'model:sdd-apply' });

    expect(showProvider).toHaveBeenCalledWith(api, profileOpt, 'sdd-apply', 'model', 'hub');
    expect(showProfileList).not.toHaveBeenCalled();
  });

  it('returns to the requested immediate submenu target instead of profile hub', () => {
    const api = { state: { config: { agent: { 'sdd-apply': {} } } } } as any;
    const profileOpt = { title: 'team', value: 'team.json' };
    const profileData = { models: {}, fallback: {}, configs: {} } as any;
    const sections = { sddAgents: [], fallbackAgents: [], sddAgentNames: [], policy: { canonicalName: 'sdd-orchestrator' } } as any;
    const showHub = vi.fn();
    const showPrimary = vi.fn();
    const showReasoning = vi.fn();
    const showFallback = vi.fn();

    returnToProfileDetailTarget(api, profileOpt, 'primary', {
      showProfileDetail: showHub,
      readProfileData: () => profileData,
      buildProfileDetailAgentSections: () => sections,
      showProfileDetailSubmenuPrimary: showPrimary,
      showProfileDetailSubmenuReasoning: showReasoning,
      showProfileDetailSubmenuFallback: showFallback,
    });
    returnToProfileDetailTarget(api, profileOpt, 'reasoning', {
      showProfileDetail: showHub,
      readProfileData: () => profileData,
      buildProfileDetailAgentSections: () => sections,
      showProfileDetailSubmenuPrimary: showPrimary,
      showProfileDetailSubmenuReasoning: showReasoning,
      showProfileDetailSubmenuFallback: showFallback,
    });
    returnToProfileDetailTarget(api, profileOpt, 'fallback', {
      showProfileDetail: showHub,
      readProfileData: () => profileData,
      buildProfileDetailAgentSections: () => sections,
      showProfileDetailSubmenuPrimary: showPrimary,
      showProfileDetailSubmenuReasoning: showReasoning,
      showProfileDetailSubmenuFallback: showFallback,
    });

    expect(showPrimary).toHaveBeenCalledWith(api, profileOpt, profileData, sections);
    expect(showReasoning).toHaveBeenCalledWith(api, profileOpt, profileData, sections);
    expect(showFallback).toHaveBeenCalledWith(api, profileOpt, profileData, sections);
    expect(showHub).not.toHaveBeenCalled();
  });

  it('falls back to profile hub when submenu return cannot be resolved', () => {
    const api = { state: { config: { agent: { 'sdd-apply': {} } } } } as any;
    const profileOpt = { title: 'team', value: 'team.json' };
    const showHub = vi.fn();

    returnToProfileDetailTarget(api, profileOpt, 'reasoning', {
      showProfileDetail: showHub,
      readProfileData: () => {
        throw new Error('read failed');
      },
    });

    expect(showHub).toHaveBeenCalledWith(api, profileOpt);
  });

  describe('catalog-driven dialogs & category ordering', () => {
    const createMockApi = (configAgent: any = {}) => ({
      ui: {
        dialog: {
          setSize: vi.fn(),
          replace: vi.fn(),
          clear: vi.fn(),
        },
        toast: vi.fn(),
      },
      state: { config: { agent: configAgent }, provider: [] },
      kv: { set: vi.fn().mockResolvedValue(undefined) },
    });

    it.each([
      ['primary runtime (T10)', { 'sdd-spec': {} }, 'sdd-spec', 'model:sdd-spec', undefined],
      ['primary configured (T10)', { 'sdd-spec': {} }, 'sdd-spec', 'model:sdd-spec', undefined],
      ['fallback runtime (T11)', { 'sdd-spec-fallback': {} }, 'sdd-spec-fallback', 'fallback:sdd-spec', undefined],
    ])('%s', (_, agentConfig, displayName, expectedValue, expectedBadge) => {
      const api = createMockApi(agentConfig);
      const catalog = buildCatalogSections(api.state.config, { models: {} });
      const isFallback = displayName.endsWith('-fallback');
      const options = isFallback
        ? buildFallbackSubmenuOptions({ models: {} }, catalog, api)
        : buildPrimaryModelSubmenuOptions({ models: {} }, catalog, api);

      const option = options.find((opt) => opt.value === expectedValue);
      expect(option).toBeDefined();
      expect(option?.badge).toBe(expectedBadge);
    });

    it('displays fallback model desc from profileKey and badge from displayName hasOwn (T18)', () => {
      const api = createMockApi({ 'sdd-apply-fallback': {} });
      const profileData = { fallback: { 'sdd-apply': 'openai/gpt-4.1-mini' } };
      const catalog = buildCatalogSections(api.state.config, profileData as any);
      const options = buildFallbackSubmenuOptions(profileData, catalog, api);
      const option = options.find((opt) => opt.value === 'fallback:sdd-apply');

      expect(option).toBeDefined();
      expect(option?.title).toBe('sdd-apply');
      expect(option?.description).toContain('openai/gpt-4.1-mini');
      expect(option?.badge).toBeUndefined();
    });

    it('routes unconfigured primary and fallback selections to assign actions (T19, T20)', () => {
      expect(resolveProfileDetailSelectionAction('model:sdd-spec')).toEqual({ action: 'model', agentName: 'sdd-spec' });
      expect(resolveProfileDetailSelectionAction('fallback:sdd-spec')).toEqual({ action: 'fallback', agentName: 'sdd-spec' });
    });

    it('wraps memory text at >=80 at xlarge and preserves empty lines (T29)', () => {
      const text = 'word '.repeat(24); // 120 chars
      const lines80 = wrapDisplayText(text, 80);
      const lines52 = wrapDisplayText(text, 52);

      expect(lines80.length).toBeLessThan(lines52.length);
      expect(lines80).toHaveLength(2);
      expect(wrapDisplayText('')).toEqual([' ']);
    });

    it('does not truncate continuous 200-char string with ellipsis (T30)', () => {
      const longWord = 'x'.repeat(200);
      const wrapped = wrapDisplayText(longWord, 80);

      expect(wrapped).toEqual([longWord]);
      expect(wrapped[0]).not.toContain('…');
      expect(wrapped[0]).not.toContain('...');
    });

    it('sanitizes markdown tokens and wraps correctly (T31)', () => {
      const input = '`code` **bold** -> target';
      expect(sanitizeMemoryDisplayText(input)).toBe('code bold -> target');
      const wrapped = wrapDisplayText(input, 80);
      expect(wrapped[0]).toBe('code bold -> target');
    });

    const sampleProfileOpt = { title: 'team', value: 'team.json' };
    const sampleMemory = { id: 1, title: 'Memory 1', content: 'test memory', type: 'manual', scope: 'project' };
    const sampleProvider = { id: 'test-prov', name: 'Test Provider', models: { 'model-a': { name: 'Model A' } } };
    const sampleBulkAction = {
      title: 'Bulk Action',
      value: 'bulk:fill-only:primary',
      operation: { target: BULK_ASSIGNMENT_TARGET.PRIMARY, mode: BULK_ASSIGNMENT_MODE.FILL_ONLY },
      requiresConfirmation: false,
    };

    const TIER_MAP: Array<[string, (api: any) => Promise<any> | any, DialogSize]> = [
      // xlarge dense selectors
      ['showProfileList', (api) => showProfileList(api), 'xlarge'],
      ['showProfileDetail', (api) => showProfileDetail(api, sampleProfileOpt), 'xlarge'],
      ['showProfileDetailSubmenuPrimary', (api) => showProfileDetailSubmenuPrimary(api, sampleProfileOpt, { models: {} }), 'xlarge'],
      ['showProfileDetailSubmenuReasoning', (api) => showProfileDetailSubmenuReasoning(api, sampleProfileOpt, { models: {} }), 'xlarge'],
      ['showProfileDetailSubmenuFallback', (api) => showProfileDetailSubmenuFallback(api, sampleProfileOpt, { models: {} }), 'xlarge'],
      ['showBulkProfileActions', (api) => showBulkProfileActions(api, sampleProfileOpt), 'xlarge'],
      ['showProviderPickerForBulkProfilePhases', (api) => showProviderPickerForBulkProfilePhases(api, sampleProfileOpt, sampleBulkAction), 'xlarge'],
      ['showMemoryDetail', (api) => showMemoryDetail(api, sampleMemory), 'xlarge'],
      ['showModelPickerForBulkProfilePhases', (api) => showModelPickerForBulkProfilePhases(api, sampleProfileOpt, sampleProvider, sampleBulkAction), 'xlarge'],
      ['showProfileVersions', (api) => showProfileVersions(api, sampleProfileOpt), 'xlarge'],
      ['showProfileVersionPreview', (api) => showProfileVersionPreview(api, sampleProfileOpt, 'team.json/2026-04-26T10-00-00-000Z-a.json'), 'xlarge'],
      ['showProviderPickerForAgent', (api) => showProviderPickerForAgent(api, sampleProfileOpt, 'sdd-init', 'model'), 'xlarge'],
      ['showModelPickerForAgent', (api) => showModelPickerForAgent(api, sampleProfileOpt, 'sdd-init', sampleProvider, 'model'), 'xlarge'],

      // large
      ['showProjectMemoriesMenu', (api) => showProjectMemoriesMenu(api), 'large'],

      // medium prompts and confirmations
      ['showProfilesMenu', (api) => showProfilesMenu(api), 'medium'],
      ['showCreateProfile', (api) => showCreateProfile(api), 'medium'],
      ['showReasoningEffortPicker', (api) => showReasoningEffortPicker(api, sampleProfileOpt, 'sdd-init'), 'medium'],
      ['showRenameProfile', (api) => showRenameProfile(api, sampleProfileOpt), 'medium'],
      ['showDeleteProfile', (api) => showDeleteProfile(api, sampleProfileOpt), 'medium'],
      ['showConfirmRestoreProfileVersion', (api) => showConfirmRestoreProfileVersion(api, sampleProfileOpt, 'team.json/2026-04-26T10-00-00-000Z-a.json'), 'medium'],
      ['handleActivateProfile', (api) => handleActivateProfile(api, '/mock/team.json', 'team'), 'medium'],
      ['showDeleteMemory', (api) => showDeleteMemory(api, sampleMemory), 'medium'],
    ];

    it.each(TIER_MAP)('sets tiered dialog size on entry for %s -> %s (T25)', async (_, showFn, expectedTier) => {
      const api = createMockApi({ 'sdd-apply': {} });
      vi.spyOn(profiles, 'activateProfileFile').mockResolvedValue({ agent: {} });
      await showFn(api);
      expect(api.ui.dialog.setSize).toHaveBeenCalledWith(expectedTier);
    });

    it('resets dialog size across xlarge -> large -> medium -> back/cancel 5x without leak (T26)', async () => {
      const api = createMockApi({ 'sdd-apply': {} });
      vi.spyOn(profiles, 'activateProfileFile').mockResolvedValue({ agent: {} });

      for (let i = 0; i < 5; i++) {
        // xlarge hub
        showProfileDetail(api, sampleProfileOpt);
        expect(api.ui.dialog.setSize).toHaveBeenLastCalledWith('xlarge');

        // xlarge submenu
        showProfileDetailSubmenuPrimary(api, sampleProfileOpt, { models: {} });
        expect(api.ui.dialog.setSize).toHaveBeenLastCalledWith('xlarge');

        // back to xlarge bulk selector
        showBulkProfileActions(api, sampleProfileOpt);
        expect(api.ui.dialog.setSize).toHaveBeenLastCalledWith('xlarge');

        // back to xlarge hub
        showProfileDetail(api, sampleProfileOpt);
        expect(api.ui.dialog.setSize).toHaveBeenLastCalledWith('xlarge');

        // back to medium root menu
        showProfilesMenu(api);
        expect(api.ui.dialog.setSize).toHaveBeenLastCalledWith('medium');
      }
    });

    it('uses native categories in exact catalog order without synthetic separator options', () => {
      const api = createMockApi(Object.fromEntries(VISIBLE_CATALOG_ROWS.filter((row) => row.kind === 'agent').map((row) => [row.key, {}])));
      const sections = buildProfileDetailAgentSections(api.state.config, { models: {}, fallback: {} });
      const primary = buildPrimaryModelSubmenuOptions({ models: {} }, sections, api);
      const fallback = buildFallbackSubmenuOptions({ models: {}, fallback: {} }, sections, api);

      const expectedAgents = CATALOG_GROUPS.flatMap((group) => group.agents);
      expect(primary.filter((option) => option.value.startsWith('model:')).map((option) => option.value.slice(6))).toEqual(expectedAgents);
      expect(fallback.filter((option) => option.value.startsWith('fallback:')).map((option) => option.value.slice(9))).toEqual(expectedAgents.filter((agent) => agent === 'gentle-ai-windows-validator' || !['compaction', 'summary', 'title'].includes(agent)));
      expect(CATALOG_GROUPS.map((group) => group.labelEs)).toEqual(['Orquestador', 'Núcleo SDD', 'Judgment Day', 'Revisores', 'Auxiliares']);
      expect(primary.filter((option) => option.value.startsWith('model:')).map((option) => option.category)).toEqual(CATALOG_GROUPS.flatMap((group) => group.agents.map(() => group.labelEs)));
      expect(primary.some((option) => option.value === '__catalog_separator__' || option.description === 'No seleccionable')).toBe(false);
    });

    it('routes only real catalog agent values and never needs separator selection guards', () => {
      const api = createMockApi({ 'sdd-apply': {} });
      const profileOpt = { title: 'team', value: 'team.json' };
      const profileData = { models: {}, fallback: {} };
      const sections = buildProfileDetailAgentSections(api.state.config, profileData);
      const showProvider = vi.fn();
      const showHub = vi.fn();
      const primary = createPrimarySubmenuDialogProps(api, profileOpt, profileData, sections, {
        showProfileDetail: showHub,
        showProviderPickerForAgent: showProvider,
      });
      expect(primary.options.every((option) => option.category || option.value === '__back__')).toBe(true);
      primary.onSelect({ value: 'unknown-category-header' });

      expect(showProvider).not.toHaveBeenCalled();
      expect(showHub).not.toHaveBeenCalled();
    });

    it('always opens effort selection after primary model choice, including same-model selection', () => {
      const stageModel = vi.fn().mockReturnValue({ pending: { agentName: 'sdd-spec', field: 'primary', modelId: 'openai/gpt-5' } });
      const showReasoning = vi.fn();
      createModelSelectionHandler(createMockApi({ 'sdd-spec': {} }), { title: 'team', value: 'team.json' }, 'sdd-spec', 'primary', 'primary', {
        stageProfileModelSelection: stageModel, commitPendingModelSelection: vi.fn(), showReasoningEffortPicker: showReasoning, returnToProfileDetailTarget: vi.fn(),
      })('openai/gpt-5');
      expect(showReasoning).toHaveBeenCalledWith(expect.anything(), { title: 'team', value: 'team.json' }, 'sdd-spec', 'primary', expect.objectContaining({ sequential: true }));
    });

    it('shows only Predeterminado when the selected model has no reasoning variants', () => {
      const props = createReasoningEffortPickerDialogProps(
        createMockApi({ 'sdd-spec': {} }), { title: 'team', value: 'team.json' }, 'sdd-spec', '/mock/profiles/team.json', { models: { 'sdd-spec': 'anthropic/claude-3-5-sonnet' } },
        { kind: 'provider-default', options: ['provider-default'], optionLabel: 'Predeterminado' }, 'primary', { sequential: true }, { updateProfileReasoningWithoutVersion: vi.fn(), returnToProfileDetailTarget: vi.fn() },
      );
      expect(props.options.map((option) => option.title)).toEqual(['Predeterminado', '← Volver']);
      expect(props.options.some((option) => option.title === 'Predeterminado')).toBe(true);
    });

    it('keeps cancellation state-safe and translates affected visible flow copy', () => {
      const api = createMockApi({ 'sdd-apply': {} });
      const props = createProfileDetailDialogProps(api, { title: 'equipo', value: 'equipo.json' }, '/mock/equipo.json', { models: {}, fallback: {} }, {
        sddAgents: [], fallbackAgents: [], sddAgentNames: [], policy: { canonicalName: 'sdd-orchestrator' },
      } as any, { showProfileList: vi.fn() });
      expect(props.title).toBe('Perfil: equipo');
      expect(props.options.map((option) => option.title)).toContain('Acciones masivas...');
      props.onCancel();
      expect(api.ui.toast).not.toHaveBeenCalled();
    });
  });

  describe('sequential model-to-effort flow (Phase 3)', () => {
    const profileOpt = { title: 'team', value: 'team.json' };
    const reasoningProvider = { id: 'openai', name: 'OpenAI', models: { 'gpt-5': { name: 'GPT-5', capabilities: { reasoning: true }, variants: { low: { reasoningEffort: 'low' }, medium: { reasoningEffort: 'medium' }, high: { reasoningEffort: 'high' } } } } };
    const nonReasoningProvider = { id: 'anthropic', name: 'Anthropic', models: { 'claude-3-5-sonnet': { name: 'Claude 3.5 Sonnet', capabilities: { reasoning: false } } } };
    const createFlowApi = (providers = [reasoningProvider, nonReasoningProvider]) => ({
      state: { config: { agent: { 'sdd-spec': {}, 'security-auditor': {}, 'sdd-spec-fallback': {} } }, provider: providers },
      ui: { toast: vi.fn(), dialog: { replace: vi.fn(), setSize: vi.fn() } },
    });

    it('chains a supported primary model selection into the effort picker with provider context', () => {
      const api = createFlowApi(), stageModel = vi.fn().mockReturnValue({ pending: { agentName: 'sdd-spec', field: 'primary', modelId: 'openai/gpt-5' } }), showReasoning = vi.fn();
      createModelSelectionHandler(api, profileOpt, 'sdd-spec', 'primary', 'primary', { stageProfileModelSelection: stageModel, commitPendingModelSelection: vi.fn(), showReasoningEffortPicker: showReasoning, returnToProfileDetailTarget: vi.fn() })('openai/gpt-5');
      expect(stageModel).toHaveBeenCalled();
      expect(showReasoning).toHaveBeenCalledWith(api, profileOpt, 'sdd-spec', 'primary', expect.objectContaining({ sequential: true }));
      expect(api.ui.toast).not.toHaveBeenCalled();
    });

    it('returns directly with a confirmation toast when the selected primary model lacks reasoning support', () => {
      const api = createFlowApi(), stageModel = vi.fn().mockReturnValue({ pending: { agentName: 'sdd-spec', field: 'primary', modelId: 'anthropic/claude-3-5-sonnet' } }), showReasoning = vi.fn();
      createModelSelectionHandler(api, profileOpt, 'sdd-spec', 'primary', 'hub', { stageProfileModelSelection: stageModel, commitPendingModelSelection: vi.fn(), showReasoningEffortPicker: showReasoning, returnToProfileDetailTarget: vi.fn() })('anthropic/claude-3-5-sonnet');
      expect(showReasoning).toHaveBeenCalled();
      expect(api.ui.toast).not.toHaveBeenCalled();
    });

    it('stages fallback selection until reasoning effort is selected', () => {
      const api = createFlowApi(), stageModel = vi.fn().mockReturnValue({ pending: { agentName: 'sdd-spec', field: 'fallback', modelId: 'openai/gpt-5' } }), showReasoning = vi.fn();
      createModelSelectionHandler(api, profileOpt, 'sdd-spec', 'fallback', 'fallback', { stageProfileModelSelection: stageModel, commitPendingModelSelection: vi.fn().mockReturnValue({ changed: true }), showReasoningEffortPicker: showReasoning, returnToProfileDetailTarget: vi.fn() })('openai/gpt-5');
      expect(stageModel).toHaveBeenCalled();
      expect(showReasoning).toHaveBeenCalledWith(api, profileOpt, 'sdd-spec', 'fallback', expect.objectContaining({ sequential: true, pending: { agentName: 'sdd-spec', field: 'fallback', modelId: 'openai/gpt-5' } }));
    });

    it('persists a selected effort without creating a second snapshot and returns to the caller', () => {
      const api = createFlowApi(), updateEffort = vi.fn().mockReturnValue({ models: { 'sdd-spec': 'openai/gpt-5' }, configs: { 'sdd-spec': { reasoningEffort: 'high' } } }), returnToTarget = vi.fn();
      const props = createReasoningEffortPickerDialogProps(api, profileOpt, 'sdd-spec', '/mock/profiles/team.json', { models: { 'sdd-spec': 'openai/gpt-5' } }, { kind: 'selectable', options: ['low', 'medium', 'high'], current: 'medium' }, 'primary', { sequential: true }, { updateProfileReasoningWithoutVersion: updateEffort, returnToProfileDetailTarget: returnToTarget });
      props.onSelect({ value: 'high' });
      expect(updateEffort).toHaveBeenCalledWith('/mock/profiles/team.json', 'sdd-spec', 'high', expect.anything());
      expect(api.ui.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Actualizado', variant: 'success' }));
      expect(returnToTarget).toHaveBeenCalledWith(api, profileOpt, 'primary');
    });

    it('commits an orchestrator selection through the canonical pending mutation path and confirms model plus effort', () => {
      const api = createFlowApi(), commitModel = vi.fn(), returnToTarget = vi.fn();
      const props = createReasoningEffortPickerDialogProps(api, profileOpt, 'gentle-orchestrator', '/mock/profiles/team.json', { models: { 'gentle-orchestrator': 'openai/gpt-5' } }, { kind: 'selectable', options: ['high'] }, 'hub', { sequential: true, pending: { agentName: 'gentle-orchestrator', field: 'primary', modelId: 'openai/gpt-5' }, commitPendingModelSelection: commitModel }, { returnToProfileDetailTarget: returnToTarget });
      props.onSelect({ value: 'high' });
      expect(commitModel).toHaveBeenCalledWith('/mock/profiles/team.json', { agentName: 'gentle-orchestrator', field: 'primary', modelId: 'openai/gpt-5' }, 'high', expect.anything(), buildModelMutationContext(api, 'primary'));
      expect(api.ui.toast).toHaveBeenCalledWith({ title: 'Actualizado', message: 'gentle-orchestrator: modelo openai/gpt-5 y esfuerzo high actualizados', variant: 'success' });
      expect(returnToTarget).toHaveBeenCalledWith(api, profileOpt, 'hub');
    });

    it('clears effort on picker back and cancel, then returns to the stable caller target', () => {
      const api = createFlowApi(), returnToTarget = vi.fn();
      const deps = { updateProfileReasoningWithoutVersion: vi.fn(), returnToProfileDetailTarget: returnToTarget };
      const createProps = () => createReasoningEffortPickerDialogProps(api, profileOpt, 'sdd-spec', '/mock/profiles/team.json', { models: { 'sdd-spec': 'openai/gpt-5' } }, { kind: 'selectable', options: ['low', 'high'] }, 'hub', { sequential: true }, deps);
      createProps().onSelect({ value: '__back__' });
      createProps().onCancel();
      expect(deps.updateProfileReasoningWithoutVersion).not.toHaveBeenCalled();
      expect(returnToTarget).toHaveBeenNthCalledWith(1, api, profileOpt, 'hub');
      expect(returnToTarget).toHaveBeenNthCalledWith(2, api, profileOpt, 'hub');
    });

    it('keeps routing and reports an error when sequential back cannot clear effort', () => {
      const api = createFlowApi(), returnToTarget = vi.fn();
      const props = createReasoningEffortPickerDialogProps(api, profileOpt, 'sdd-spec', '/mock/profiles/team.json', { models: { 'sdd-spec': 'openai/gpt-5' } }, { kind: 'selectable', options: ['low', 'high'] }, 'primary', { sequential: true }, { updateProfileReasoningWithoutVersion: vi.fn(() => { throw new Error('effort clear failed'); }), returnToProfileDetailTarget: returnToTarget });
      expect(() => props.onSelect({ value: '__back__' })).not.toThrow();
      expect(api.ui.toast).not.toHaveBeenCalled();
      expect(returnToTarget).toHaveBeenCalledWith(api, profileOpt, 'primary');
    });

    it('keeps routing and reports an error when sequential cancel cannot clear effort', () => {
      const api = createFlowApi(), returnToTarget = vi.fn();
      const props = createReasoningEffortPickerDialogProps(api, profileOpt, 'sdd-spec', '/mock/profiles/team.json', { models: { 'sdd-spec': 'openai/gpt-5' } }, { kind: 'selectable', options: ['low', 'high'] }, 'fallback', { sequential: true }, { updateProfileReasoningWithoutVersion: vi.fn(() => { throw new Error('effort cancel failed'); }), returnToProfileDetailTarget: returnToTarget });
      expect(() => props.onCancel()).not.toThrow();
      expect(api.ui.toast).not.toHaveBeenCalled();
      expect(returnToTarget).toHaveBeenCalledWith(api, profileOpt, 'fallback');
    });

    it('shows error toasts and still returns when model or effort persistence fails', () => {
      const api = createFlowApi(), returnToTarget = vi.fn();
      createModelSelectionHandler(api, profileOpt, 'sdd-spec', 'primary', 'hub', { stageProfileModelSelection: vi.fn(() => { throw new Error('model write failed'); }), returnToProfileDetailTarget: returnToTarget })('openai/gpt-5');
      const effortReturn = vi.fn();
      const props = createReasoningEffortPickerDialogProps(api, profileOpt, 'sdd-spec', '/mock/profiles/team.json', { models: { 'sdd-spec': 'openai/gpt-5' } }, { kind: 'selectable', options: ['high'] }, 'primary', { sequential: true }, { updateProfileReasoningWithoutVersion: vi.fn(() => { throw new Error('effort write failed'); }), returnToProfileDetailTarget: effortReturn });
      props.onSelect({ value: 'high' });
      expect(api.ui.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error', variant: 'error' }));
      expect(returnToTarget).toHaveBeenCalledWith(api, profileOpt, 'hub');
      expect(effortReturn).toHaveBeenCalledWith(api, profileOpt, 'primary');
    });

    it('routes model picker back and cancel through the same provider target', () => {
      const api = createFlowApi(), providerTarget = vi.fn();
      const props = createModelPickerDialogProps(api, profileOpt, 'sdd-spec', reasoningProvider, 'primary', 'primary', { showProviderPickerForAgent: providerTarget, onModelSelected: vi.fn() });
      props.onSelect({ value: '__back__' });
      props.onCancel();
      expect(providerTarget).toHaveBeenNthCalledWith(1, api, profileOpt, 'sdd-spec', 'model', 'primary');
      expect(providerTarget).toHaveBeenNthCalledWith(2, api, profileOpt, 'sdd-spec', 'model', 'primary');
    });

    it('collects a bulk model selection before any persistence mutation', () => {
      const api = createFlowApi();
      const updateBulk = vi.fn();
      const showEffort = vi.fn();

      const handleSelection = createBulkModelSelectionHandler(api, profileOpt, 'openai/gpt-5', {
        updateProfileWithBulkOverwrite: updateBulk,
        showBulkReasoningEffortPicker: showEffort,
      });
      handleSelection();

      expect(showEffort).toHaveBeenCalledWith(api, profileOpt, 'openai/gpt-5');
      expect(updateBulk).not.toHaveBeenCalled();
    });

    it('commits one fallback bulk transaction only after effort selection and confirms model plus effort', () => {
      const api = createFlowApi();
      const updateBulk = vi.fn().mockReturnValue({ assignment: { modelsAssigned: 19, effortsAssigned: 19, changed: true } });
      const showDetail = vi.fn();
      const props = createBulkReasoningEffortPickerDialogProps(api, profileOpt, 'openai/gpt-5', {
        collectConfigurableProfileTargets: vi.fn(() => [{ profileKey: 'sdd-spec', field: 'model' as const }]),
        updateProfileWithBulkOverwrite: updateBulk,
        showProfileDetail: showDetail,
        bulkTarget: BULK_ASSIGNMENT_TARGET.FALLBACK,
      });

      props.onSelect({ value: 'high' });

      expect(updateBulk).toHaveBeenCalledTimes(1);
      expect(updateBulk).toHaveBeenCalledWith(
        expect.any(String),
        [{ profileKey: 'sdd-spec', field: 'model' }],
        'openai/gpt-5',
        'high',
        buildBulkModelMutationContext(api, ['sdd-spec']),
        expect.anything(),
        BULK_ASSIGNMENT_TARGET.FALLBACK,
      );
      expect(api.ui.toast).toHaveBeenCalledWith({
        title: 'Actualizado',
        message: '19 agentes configurados con openai/gpt-5 y esfuerzo high. Versión guardada.',
        variant: 'success',
      });
      expect(showDetail).toHaveBeenCalledWith(api, profileOpt);
    });

    it('cancels the bulk model or effort selection without creating writes or snapshots', () => {
      const api = createFlowApi();
      const updateBulk = vi.fn();
      const showDetail = vi.fn();
      const props = createBulkReasoningEffortPickerDialogProps(api, profileOpt, 'openai/gpt-5', {
        updateProfileWithBulkOverwrite: updateBulk,
        showProfileDetail: showDetail,
      });

      props.onCancel();

      expect(updateBulk).not.toHaveBeenCalled();
      expect(showDetail).toHaveBeenCalledWith(api, profileOpt);
      expect(api.ui.toast).not.toHaveBeenCalled();
    });

    it('cancels the bulk model picker before staging a global transaction', () => {
      const api = createFlowApi();
      const onModelSelected = vi.fn();
      const returnToProvider = vi.fn();
      const props = createBulkModelPickerDialogProps(api, profileOpt, reasoningProvider, {
        title: 'Asignar un modelo y esfuerzo a todos los agentes',
        value: 'bulk:assign-model-and-effort',
      }, { onModelSelected, showProviderPickerForBulkProfilePhases: returnToProvider });

      props.onCancel();

      expect(onModelSelected).not.toHaveBeenCalled();
      expect(returnToProvider).toHaveBeenCalledWith(api, profileOpt, expect.anything());
    });

    it('passes the selected bulk model to the effort picker when using the default callback', () => {
      const api = createFlowApi();
      const showEffort = vi.fn();
      const props = createBulkModelPickerDialogProps(api, profileOpt, reasoningProvider, {
        title: 'Asignar un modelo y esfuerzo a todos los agentes',
        value: 'bulk:assign-model-and-effort',
      }, { showBulkReasoningEffortPicker: showEffort });

      props.onSelect({ value: 'openai/gpt-5' });

      expect(showEffort).toHaveBeenCalledWith(api, profileOpt, 'openai/gpt-5');
    });
  });
});
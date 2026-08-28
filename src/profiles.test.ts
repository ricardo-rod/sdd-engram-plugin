import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import type { ProfileData } from './types';
import { BULK_ASSIGNMENT_MODE, BULK_ASSIGNMENT_TARGET, PROFILE_VERSION_SOURCE } from './types';
import { formatProfileVersionPreviewLines, resolveRuntimeOrchestratorPolicy } from './dialogs';
import {
  extractSddAgentModels, 
  extractPersistedAgentModels,
  extractSddFallbackModels, 
  extractPersistedProfileExtras,
  readProfileModels, 
  readProfileFallbackModels, 
  writeProfileModels,
  writeProfileFallbackModels,
  sanitizeProfileName,
  syncSddFallbackAgents, 
  validateProfileFallbackMapping,
  isSddProfile,
  applyProfileDataToConfig,
  applyBulkProfilePhaseAssignment,
  assignModelToUnassignedProfilePhases,
  readProfileData,
  writeProfileData,
  createProfileVersion,
  listProfileVersions,
  readProfileVersion,
  restoreProfileVersion,
  commitPendingModelSelection,
  stageProfileModelSelection,
  updateProfileWithBulkPhaseAssignment,
  buildBulkProfileOverwrite,
  updateProfileWithBulkOverwrite,
  updateProfileReasoningWithoutVersion,
   updateProfilePhaseModel,
    detectActiveProfileFile,
    discoverInstalledAgentDefinitions,
    activateProfileFile,
   deleteProfileFile,
   renameProfileFile,
   migrateProfilesForRuntimePolicy
} from './profiles';
import { getOrchestratorPolicy } from './orchestrator';
import { collectConfigurableProfileTargets } from './catalog';

const toPosix = (p: any) => (typeof p === 'string' ? p.replace(/\\/g, '/') : p);

vi.mock('node:fs');
vi.mock('./config', () => ({
  resolvePaths: () => ({
    profilesDir: '/mock/profiles',
    configRoot: '/mock/config',
    configPath: '/mock/config/opencode.json',
    backupPath: '/mock/config/opencode.json.bak',
    profileVersionsDir: '/mock/config/profile-versions'
  }),
  ensureProfilesDir: vi.fn()
}));

describe('profiles logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isSddProfile', () => {
    it('should correctly identify .json files', () => {
      expect(isSddProfile('profile.json')).toBe(true);
      expect(isSddProfile('readme.md')).toBe(false);
      expect(isSddProfile('config')).toBe(false);
    });
  });

  describe('sanitizeProfileName', () => {
    it('accepts safe names and strips a trailing json extension', () => {
      expect(sanitizeProfileName(' team-default.json ')).toBe('team-default');
      expect(sanitizeProfileName('team default.v2')).toBe('team default.v2');
    });

    it('rejects empty, traversal, separators, and unsafe characters', () => {
      expect(() => sanitizeProfileName('   ')).toThrow('Profile name cannot be empty');
      expect(() => sanitizeProfileName('../team')).toThrow('unsafe characters');
      expect(() => sanitizeProfileName('team/nested')).toThrow('unsafe characters');
      expect(() => sanitizeProfileName('team*prod')).toThrow('unsafe characters');
    });
  });

  describe('extractSddAgentModels', () => {
    it('should extract models for primary managed agents', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'gpt-4' },
          'sdd-apply': { model: 'claude-3' },
          'review-risk': { model: 'gpt-4.1-mini' },
          'jd-judge-a': { model: 'o3-mini' },
          'other-agent': { model: 'mistral' },
          'sdd-init-fallback': { model: 'gpt-3.5' },
          'review-risk-fallback': { model: 'gpt-4.1-nano' }
        }
      };
      
      const models = extractSddAgentModels(config);
      expect(models).toEqual({
        'sdd-init': 'gpt-4',
        'sdd-apply': 'claude-3',
        'review-risk': 'gpt-4.1-mini',
        'jd-judge-a': 'o3-mini'
      });
    });

    it('should return empty object if no agent field', () => {
      expect(extractSddAgentModels({})).toEqual({});
    });
  });

  describe('extractPersistedAgentModels', () => {
    it('extracts models for all valid agent keys', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'gpt-4' },
          'custom-agent': { model: 'custom-model' },
          'invalid/agent': { model: 'bad' },
          'no-model': { description: 'test' },
        },
      };
      expect(extractPersistedAgentModels(config)).toEqual({
        'sdd-init': 'gpt-4',
        'custom-agent': 'custom-model',
      });
    });
  });

  describe('extractSddFallbackModels', () => {
    it('should extract fallback mapping and drop invalid keys', () => {
      const raw = {
        fallback: {
          'sdd-init': 'gpt-3.5',
          'sdd-apply': 'sonnet',
          'review-risk': 'gpt-4.1-nano',
          'jd-judge-a': 'o3-mini-low',
          'my-agent': 'custom/fb',
          'a/b': 'foo',
          '__proto__': 'bar'
        }
      };
      
      const fallback = extractSddFallbackModels(raw);
      expect(fallback).toEqual({
        'sdd-init': 'gpt-3.5',
        'sdd-apply': 'sonnet',
        'review-risk': 'gpt-4.1-nano',
        'jd-judge-a': 'o3-mini-low',
        'my-agent': 'custom/fb'
      });
    });

    it('should handle missing fallback field', () => {
      expect(extractSddFallbackModels({})).toEqual({});
    });
  });

  describe('readProfileModels', () => {
    it('should parse new profile format', () => {
      const mockContent = JSON.stringify({
        models: { 'sdd-init': 'gpt-4' },
        fallback: { 'sdd-init': 'gpt-3.5' }
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);
      
      const models = readProfileModels('/mock/profiles/test.json');
      expect(models).toEqual({ 'sdd-init': 'gpt-4' });
    });

    it('should parse profile json with a leading UTF-8 BOM', () => {
      const mockContent = `\uFEFF${JSON.stringify({
        models: { 'sdd-init': 'gpt-4' },
      })}`;
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const models = readProfileModels('/mock/profiles/bom.json');

      expect(models).toEqual({ 'sdd-init': 'gpt-4' });
    });

    it('should parse legacy flat format', () => {
      const mockContent = JSON.stringify({
        'sdd-init': 'gpt-4',
        'sdd-apply': { model: 'claude-3' }
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);
      
      const models = readProfileModels('/mock/profiles/legacy.json');
      expect(models).toEqual({
        'sdd-init': 'gpt-4',
        'sdd-apply': 'claude-3'
      });
    });

    it('should parse full config format', () => {
      const mockContent = JSON.stringify({
        agent: { 'sdd-init': { model: 'gpt-4' } }
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);
      
      const models = readProfileModels('/mock/profiles/config.json');
      expect(models).toEqual({ 'sdd-init': 'gpt-4' });
    });

    it('preserves gentle-orchestrator when reading migrated profile payloads', () => {
      const mockContent = JSON.stringify({
        models: {
          'gentle-orchestrator': 'openai/gpt-5',
          'sdd-init': 'openai/gpt-4'
        }
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const models = readProfileModels('/mock/profiles/migrated.json');
      expect(models).toEqual({
        'gentle-orchestrator': 'openai/gpt-5',
        'sdd-init': 'openai/gpt-4'
      });
    });

    it('returns empty models for corrupted json payloads instead of throwing', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('{invalid json');

      expect(readProfileModels('/mock/profiles/corrupt.json')).toEqual({});
    });
  });

  describe('readProfileData and writeProfileData', () => {
    it('migrates legacy orchestrator to gentle-orchestrator on write in updated runtime', () => {
      const policy = getOrchestratorPolicy(['gentle-orchestrator', 'sdd-init']);

      writeProfileData('/mock/profiles/compatible.json', {
        models: {
          'sdd-orchestrator': 'legacy/model',
          'sdd-init': 'phase/model',
        },
      } as any, policy);

      const persisted = JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]));
      expect(persisted.models['gentle-orchestrator']).toBe('legacy/model');
      expect(persisted.models['sdd-orchestrator']).toBeUndefined();
    });

    it('migrates legacy orchestrator reasoning config to gentle-orchestrator on write in updated runtime', () => {
      const policy = getOrchestratorPolicy(['gentle-orchestrator', 'sdd-init']);

      writeProfileData('/mock/profiles/compatible.json', {
        models: {
          'sdd-orchestrator': 'legacy/model',
          'sdd-init': 'phase/model',
        },
        configs: {
          'sdd-orchestrator': { reasoningEffort: 'high' },
        },
      } as any, policy);

      const persisted = JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]));
      expect(persisted.configs['gentle-orchestrator']?.reasoningEffort).toBe('high');
      expect(persisted.configs['sdd-orchestrator']).toBeUndefined();
    });

    it('migrates updated orchestrator reasoning config back to sdd-orchestrator on write in legacy runtime', () => {
      const policy = getOrchestratorPolicy(['sdd-orchestrator', 'sdd-init']);

      writeProfileData('/mock/profiles/compatible.json', {
        models: {
          'gentle-orchestrator': 'updated/model',
          'sdd-init': 'phase/model',
        },
        configs: {
          'gentle-orchestrator': { reasoningEffort: 'low' },
        },
      } as any, policy);

      const persisted = JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]));
      expect(persisted.configs['sdd-orchestrator']?.reasoningEffort).toBe('low');
      expect(persisted.configs['gentle-orchestrator']).toBeUndefined();
    });

    it('preserves unrelated profile fields when reading and writing full profile data', () => {
      const mockContent = JSON.stringify({
        models: { 'sdd-init': 'gpt-4' },
        fallback: { 'sdd-init': 'gpt-3.5' },
        description: 'team defaults'
      });
      vi.mocked(fs.readFileSync).mockReturnValue(mockContent);

      const profileData = readProfileData('/mock/profiles/compatible.json');
      writeProfileData('/mock/profiles/compatible.json', profileData);

      expect(profileData).toEqual({
        models: { 'sdd-init': 'gpt-4' },
        fallback: { 'sdd-init': 'gpt-3.5' },
        description: 'team defaults'
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        JSON.stringify(profileData, null, 2)
      );
      expect(fs.renameSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        '/mock/profiles/compatible.json'
      );
    });

    it('writes canonical profile payloads without stale legacy or config-shaped fields', () => {
      writeProfileData('/mock/profiles/compatible.json', {
        models: { 'sdd-init': ' gpt-4 ', 'not-sdd': 'ignore-me', '__proto__': 'stale', 'bad name': 'stale' } as any,
        fallback: { 'sdd-init': ' gpt-3.5 ', 'invalid': 'ignore-me', 'bad fallback': 'stale' } as any,
        description: 'team defaults',
        agent: { 'sdd-init': { model: 'stale/model' } },
        'sdd-init': 'legacy/model',
      } as any);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/^[\/\\]mock[\/\\]profiles[\/\\]compatible\.json\.tmp-[0-9a-f]{8}$/),
        JSON.stringify({
          description: 'team defaults',
          models: { 'sdd-init': 'gpt-4', 'not-sdd': 'ignore-me' },
          fallback: { 'sdd-init': 'gpt-3.5', 'invalid': 'ignore-me' }
        }, null, 2)
      );
      expect(toPosix(vi.mocked(fs.renameSync).mock.calls[0][0])).toMatch(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/);
      expect(toPosix(vi.mocked(fs.renameSync).mock.calls[0][1])).toBe('/mock/profiles/compatible.json');
    });

    it('omits empty fallback maps when reading and writing full profile data', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-init': 'gpt-4' },
        fallback: {},
        description: 'team defaults'
      }));

      const profileData = readProfileData('/mock/profiles/compatible.json');
      writeProfileData('/mock/profiles/compatible.json', profileData);

      expect(profileData).toEqual({
        models: { 'sdd-init': 'gpt-4' },
        description: 'team defaults'
      });
      expect(fs.writeFileSync).toHaveBeenLastCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        JSON.stringify({
          description: 'team defaults',
          models: { 'sdd-init': 'gpt-4' }
        }, null, 2)
      );
      expect(fs.renameSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        '/mock/profiles/compatible.json'
      );
    });

    it('preserves valid primary reasoning config and drops unsupported config entries', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-init': 'gpt-4' },
        configs: {
          'sdd-init': { reasoningEffort: ' high ', unknown: 'ignored' },
          'sdd-init-fallback': { reasoningEffort: 'low' },
          random: { reasoningEffort: 'medium' }
        }
      }));

      const profileData = readProfileData('/mock/profiles/compatible.json');
      writeProfileData('/mock/profiles/compatible.json', profileData);

      expect(profileData).toEqual({
        models: { 'sdd-init': 'gpt-4' },
        configs: { 'sdd-init': { reasoningEffort: 'high' } }
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        JSON.stringify({
          models: { 'sdd-init': 'gpt-4' },
          configs: { 'sdd-init': { reasoningEffort: 'high' } }
        }, null, 2)
      );
    });

    it('omits empty configs when writing profile data', () => {
      writeProfileData('/mock/profiles/compatible.json', {
        models: { 'sdd-init': 'gpt-4' },
        configs: { 'sdd-init': { reasoningEffort: '   ' } }
      } as any);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        JSON.stringify({ models: { 'sdd-init': 'gpt-4' } }, null, 2)
      );
    });

    it('reads and parses profile json only once and degrades safely when corrupt', () => {
      vi.mocked(fs.readFileSync).mockReturnValue('{invalid json');

      expect(readProfileData('/mock/profiles/corrupt.json')).toEqual({ models: {} });
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('cleans temporary files when atomic profile rename fails and fsyncs written content', () => {
      vi.mocked(fs.openSync).mockReturnValue(123 as any);
      vi.mocked(fs.renameSync).mockImplementationOnce((fromPath: any, toPath: any) => {
        if (String(toPath) === '/mock/profiles/compatible.json') {
          throw new Error('rename failed');
        }

        return undefined as any;
      });

      expect(() => writeProfileData('/mock/profiles/compatible.json', { models: { 'sdd-init': 'gpt-4' } })).toThrow('rename failed');
      expect(fs.fsyncSync).toHaveBeenCalledWith(123);
      expect(fs.closeSync).toHaveBeenCalledWith(123);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/)
      );
    });

    it('fsyncs both temp file and parent directory during atomic write', () => {
      vi.mocked(fs.openSync)
        .mockReturnValueOnce(101 as any)
        .mockReturnValueOnce(202 as any);

      writeProfileData('/mock/profiles/compatible.json', { models: { 'sdd-init': 'gpt-4' } });

      expect(fs.openSync).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        'r+'
      );
      expect(fs.openSync).toHaveBeenNthCalledWith(2, '/mock/profiles', 'r');
      expect(fs.fsyncSync).toHaveBeenCalledWith(101);
      expect(fs.fsyncSync).toHaveBeenCalledWith(202);
      expect(fs.closeSync).toHaveBeenCalledWith(101);
      expect(fs.closeSync).toHaveBeenCalledWith(202);
    });

    it('ignores EPERM from temp file fsync and still renames the profile', () => {
      vi.mocked(fs.openSync)
        .mockReturnValueOnce(101 as any)
        .mockReturnValueOnce(202 as any);
      vi.mocked(fs.fsyncSync)
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('temp fsync denied'), { code: 'EPERM' });
        })
        .mockImplementationOnce(() => undefined as any);

      expect(() => writeProfileData('/mock/profiles/compatible.json', { models: { 'sdd-init': 'gpt-4' } })).not.toThrow();
      expect(fs.renameSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        '/mock/profiles/compatible.json'
      );
      expect(fs.closeSync).toHaveBeenCalledWith(101);
      expect(fs.closeSync).toHaveBeenCalledWith(202);
    });

    it('ignores EPERM from directory fsync after rename completes', () => {
      vi.mocked(fs.openSync)
        .mockReturnValueOnce(101 as any)
        .mockReturnValueOnce(202 as any);
      vi.mocked(fs.fsyncSync)
        .mockImplementationOnce(() => undefined as any)
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('dir fsync denied'), { code: 'EPERM' });
        });

      expect(() => writeProfileData('/mock/profiles/compatible.json', { models: { 'sdd-init': 'gpt-4' } })).not.toThrow();
      expect(fs.renameSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        '/mock/profiles/compatible.json'
      );
      expect(fs.closeSync).toHaveBeenCalledWith(101);
      expect(fs.closeSync).toHaveBeenCalledWith(202);
    });

    it('rethrows non-EPERM errors from temp file fsync', () => {
      vi.mocked(fs.openSync).mockReturnValue(101 as any);
      vi.mocked(fs.fsyncSync).mockImplementationOnce(() => {
        throw Object.assign(new Error('temp fsync failed'), { code: 'EIO' });
      });

      expect(() => writeProfileData('/mock/profiles/compatible.json', { models: { 'sdd-init': 'gpt-4' } })).toThrow('temp fsync failed');
      expect(fs.closeSync).toHaveBeenCalledWith(101);
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/)
      );
    });

    it('rethrows non-EPERM errors from directory fsync after rename', () => {
      vi.mocked(fs.openSync)
        .mockReturnValueOnce(101 as any)
        .mockReturnValueOnce(202 as any);
      vi.mocked(fs.fsyncSync)
        .mockImplementationOnce(() => undefined as any)
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('dir fsync failed'), { code: 'EIO' });
        });

      expect(() => writeProfileData('/mock/profiles/compatible.json', { models: { 'sdd-init': 'gpt-4' } })).toThrow('dir fsync failed');
      expect(fs.renameSync).toHaveBeenCalledWith(
        expect.stringMatching(/^\/mock\/profiles\/compatible\.json\.tmp-[0-9a-f]{8}$/),
        '/mock/profiles/compatible.json'
      );
      expect(fs.closeSync).toHaveBeenCalledWith(101);
      expect(fs.closeSync).toHaveBeenCalledWith(202);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('writeProfileModels preserves non-model profile fields', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-init': 'old/model' },
        fallback: { 'sdd-init': 'old/fallback' },
        description: 'team defaults'
      }));

      writeProfileModels('/mock/profiles/compatible.json', { 'sdd-init': 'new/model' });

      const persisted = JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]));
      expect(persisted).toEqual({
        models: { 'sdd-init': 'new/model' },
        fallback: { 'sdd-init': 'old/fallback' },
        description: 'team defaults'
      });
    });

    it('writeProfileFallbackModels preserves non-model profile fields', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-init': 'old/model' },
        fallback: { 'sdd-init': 'old/fallback' },
        description: 'team defaults'
      }));

      writeProfileFallbackModels('/mock/profiles/compatible.json', { 'sdd-init': 'new/fallback' });

      const persisted = JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]));
      expect(persisted).toEqual({
        models: { 'sdd-init': 'old/model' },
        fallback: { 'sdd-init': 'new/fallback' },
        description: 'team defaults'
      });
    });
  });

  describe('validateProfileFallbackMapping', () => {
    it('should return empty list on success', () => {
      const config = {
        agent: { 'sdd-init': { model: 'gpt-4' } }
      };
      const fallback = { 'sdd-init': 'gpt-3.5' };
      
      const errors = validateProfileFallbackMapping(config, fallback);
      expect(errors).toEqual([]);
    });

    it('should catch invalid fallback targets', () => {
      const config = { agent: {} };
      const fallback = { 'sdd-orchestrator': 'gpt-4', 'invalid': 'foo' };
      
      const errors = validateProfileFallbackMapping(config, fallback);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('sdd-orchestrator');
      expect(errors[0]).toContain('review-*');
      expect(errors[0]).toContain('jd-*');
    });

    it('should catch missing targets in config', () => {
      const config = { agent: {} };
      const fallback = { 'sdd-init': 'gpt-3.5' };
      
      const errors = validateProfileFallbackMapping(config, fallback);
      expect(errors).toContain("Fallback target 'sdd-init' does not exist in active config.");
    });
  });

  describe('syncSddFallbackAgents', () => {
    it('should create new fallback agents', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'gpt-4', other: 'meta' }
        }
      };
      const fallback = { 'sdd-init': 'gpt-3.5' };
      
      const nextConfig = syncSddFallbackAgents(config, fallback);
      expect(nextConfig.agent['sdd-init-fallback']).toEqual({
        model: 'gpt-3.5',
        other: 'meta'
      });
    });

    it('should override existing fallback agents if base agent changes', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'gpt-4', other: 'new-meta' },
          'sdd-init-fallback': { model: 'gpt-3.5', other: 'old-meta' }
        }
      };
      const fallback = { 'sdd-init': 'gpt-3.5' };
      
      const nextConfig = syncSddFallbackAgents(config, fallback);
      expect(nextConfig.agent['sdd-init-fallback'].other).toBe('new-meta');
    });

    it('should inherit base model if no override provided', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'gpt-4' }
        }
      };
      const fallback = {};
      
      const nextConfig = syncSddFallbackAgents(config, fallback);
      expect(nextConfig.agent['sdd-init-fallback'].model).toBe('gpt-4');
    });

    it('should be idempotent', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'gpt-4' }
        }
      };
      const fallback = { 'sdd-init': 'gpt-3.5' };
      
      const firstPass = syncSddFallbackAgents(config, fallback);
      const secondPass = syncSddFallbackAgents(firstPass, fallback);
      
      expect(firstPass).toEqual(secondPass);
    });
    it('applies a persisted suffixed fallback effort without contaminating the primary agent', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'openai/gpt-5', reasoningEffort: 'high', options: { reasoningEffort: 'high' } },
          'sdd-init-fallback': { model: 'old/model', reasoningEffort: 'medium', options: { reasoningEffort: 'medium' } },
        },
      };

      const synced = (syncSddFallbackAgents as any)(
        config,
        { 'sdd-init': 'openai/gpt-5-mini' },
        { 'sdd-init-fallback': { reasoningEffort: 'low' } },
      );

      expect(synced.agent['sdd-init']).toEqual(config.agent['sdd-init']);
      expect(synced.agent['sdd-init-fallback']).toMatchObject({
        model: 'openai/gpt-5-mini',
        reasoningEffort: 'low',
        options: { reasoningEffort: 'low' },
      });
    });

    it('clears fallback-only runtime effort when the persisted fallback effort is provider-default or absent', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'openai/gpt-5', reasoningEffort: 'high', options: { reasoningEffort: 'high' } },
          'sdd-init-fallback': { model: 'old/model', reasoningEffort: 'medium', options: { reasoningEffort: 'medium' } },
        },
      };

      const providerDefault = (syncSddFallbackAgents as any)(
        config,
        { 'sdd-init': 'anthropic/claude-3-5-sonnet' },
        { 'sdd-init-fallback': { reasoningEffort: 'provider-default' } },
      );
      expect(providerDefault.agent['sdd-init-fallback']).toMatchObject({ model: 'anthropic/claude-3-5-sonnet' });
      expect(providerDefault.agent['sdd-init-fallback'].reasoningEffort).toBeUndefined();
      expect(providerDefault.agent['sdd-init-fallback'].options.reasoningEffort).toBeUndefined();

      const absent = (syncSddFallbackAgents as any)(
        config,
        { 'sdd-init': 'anthropic/claude-3-5-sonnet' },
        {},
      );
      expect(absent.agent['sdd-init-fallback'].reasoningEffort).toBeUndefined();
      expect(absent.agent['sdd-init-fallback'].options.reasoningEffort).toBeUndefined();
      expect(absent.agent['sdd-init'].reasoningEffort).toBe('high');
    });

    it('does not synthesize fallback for dynamic primary when profile fallback is omitted (RED)', () => {
      const config = {
        agent: {
          'sdd-future': { model: 'future/model' },
        },
      };
      const synced = syncSddFallbackAgents(config, {});
      expect(synced.agent['sdd-future-fallback']).toBeUndefined();
    });

    it('preserves existing dynamic fallback when profile fallback omits it (RED)', () => {
      const config = {
        agent: {
          'sdd-future': { model: 'future/model' },
          'sdd-future-fallback': { model: 'old/fallback', other: 'keep' },
        },
      };
      const synced = syncSddFallbackAgents(config, {});
      expect(synced.agent['sdd-future-fallback']).toEqual({
        model: 'old/fallback',
        other: 'keep',
      });
    });

    it('still syncs canonical 19 base fallbacks when profile fallback is empty (RED)', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'base/init' },
          'sdd-apply': { model: 'base/apply' },
          'jd-fix-agent': { model: 'base/fix' },
          'review-risk': { model: 'base/risk' },
        },
      };
      const synced = syncSddFallbackAgents(config, {});
      expect(synced.agent['sdd-init-fallback']?.model).toBe('base/init');
      expect(synced.agent['sdd-apply-fallback']?.model).toBe('base/apply');
      expect(synced.agent['jd-fix-agent-fallback']?.model).toBe('base/fix');
      expect(synced.agent['review-risk-fallback']?.model).toBe('base/risk');
    });

    it('exhaustively syncs all 19 canonical base fallbacks with distinct models', () => {
      const expectedFallbackNames = [
        'jd-fix-agent-fallback', 'jd-judge-a-fallback', 'jd-judge-b-fallback',
        'review-readability-fallback', 'review-refuter-fallback', 'review-reliability-fallback',
        'review-resilience-fallback', 'review-risk-fallback', 'review-validator-fallback',
        'sdd-apply-fallback', 'sdd-archive-fallback', 'sdd-design-fallback',
        'sdd-explore-fallback', 'sdd-init-fallback', 'sdd-onboard-fallback',
        'sdd-propose-fallback', 'sdd-spec-fallback', 'sdd-tasks-fallback', 'sdd-verify-fallback',
      ] as const;
      const baseNames = expectedFallbackNames.map((name) => name.replace(/-fallback$/, ''));
      const config = {
        agent: Object.fromEntries(baseNames.map((baseName, index) => [
          baseName,
          { model: `provider/exhaustive-${String(index + 1).padStart(2, '0')}` },
        ])),
      };

      expect(expectedFallbackNames).toHaveLength(19);
      expect(baseNames).toHaveLength(19);
      expect(Object.keys(config.agent)).toHaveLength(19);

      const synced = syncSddFallbackAgents(config, {});
      for (const [index, baseName] of baseNames.entries()) {
        const fallback = synced.agent[`${baseName}-fallback`];
        expect(fallback).toBeDefined();
        expect(fallback.model).toBe(`provider/exhaustive-${String(index + 1).padStart(2, '0')}`);
      }
    });

  });

  describe('applyProfileDataToConfig', () => {
    it('should apply both primary models and fallback reconciliation', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'gpt-4' }
        }
      };
      const profile = {
        models: { 'sdd-init': 'claude-3' },
        fallback: { 'sdd-init': 'gpt-3.5' }
      };
      
      const nextConfig = applyProfileDataToConfig(config, profile);
      expect(nextConfig.agent['sdd-init'].model).toBe('claude-3');
      expect(nextConfig.agent['sdd-init-fallback'].model).toBe('gpt-3.5');
    });
  });

  describe('assignModelToUnassignedProfilePhases', () => {
    it('fills missing and blank primary SDD model assignments', () => {
      const profile = {
        models: {
          'sdd-init': '',
          'sdd-spec': '   ',
          'sdd-design': 'existing/provider',
        },
        fallback: {}
      };

      const result = assignModelToUnassignedProfilePhases(
        profile,
        ['sdd-init', 'sdd-apply', 'sdd-spec', 'sdd-design'],
        'provider/model'
      );

      expect(result.modelsAssigned).toBe(3);
      expect(result.profile.models).toEqual({
        'sdd-init': 'provider/model',
        'sdd-apply': 'provider/model',
        'sdd-spec': 'provider/model',
        'sdd-design': 'existing/provider',
      });
      expect(profile.models['sdd-init']).toBe('');
    });

    it('fills missing and blank fallback entries only for fallback-eligible SDD agents', () => {
      const profile = {
        models: {},
        fallback: {
          'sdd-init': '',
          'sdd-apply': '   ',
          'sdd-spec': 'fallback/existing'
        }
      };

      const result = assignModelToUnassignedProfilePhases(
        profile,
        ['sdd-init', 'sdd-apply', 'sdd-orchestrator', 'not-sdd'],
        'provider/model'
      );

      expect(result.fallbackAssigned).toBe(2);
      expect(result.profile.fallback).toEqual({
        'sdd-init': 'provider/model',
        'sdd-apply': 'provider/model',
        'sdd-spec': 'fallback/existing'
      });
      expect(result.profile.fallback?.['sdd-orchestrator']).toBeUndefined();
    });

    it('fills primary and fallback assignments for sparse profiles without models or fallback maps', () => {
      const result = assignModelToUnassignedProfilePhases(
        {} as ProfileData,
        ['sdd-init', 'sdd-apply', 'sdd-orchestrator', 'sdd-init-fallback', 'not-sdd'],
        'provider/model'
      );

      expect(result.modelsAssigned).toBe(3);
      expect(result.fallbackAssigned).toBe(2);
      expect(result.profile).toEqual({
        models: {
          'sdd-init': 'provider/model',
          'sdd-apply': 'provider/model',
          'sdd-orchestrator': 'provider/model'
        },
        fallback: {
          'sdd-init': 'provider/model',
          'sdd-apply': 'provider/model'
        }
      });
    });

    it('preserves existing non-empty primary and fallback assignments', () => {
      const profile = {
        models: {
          'sdd-init': 'primary/existing',
          'sdd-apply': 'primary/other'
        },
        fallback: {
          'sdd-init': 'fallback/existing',
          'sdd-apply': 'fallback/other'
        }
      };

      const result = assignModelToUnassignedProfilePhases(
        profile,
        ['sdd-init', 'sdd-apply'],
        'provider/model'
      );

      expect(result.modelsAssigned).toBe(0);
      expect(result.fallbackAssigned).toBe(0);
      expect(result.profile).toEqual(profile);
    });

    it('ignores non-SDD agents and generated fallback agents and is idempotent', () => {
      const first = assignModelToUnassignedProfilePhases(
        { models: {}, fallback: {} },
        ['sdd-init', 'sdd-init-fallback', 'sdd-orchestrator', 'general-agent'],
        'provider/model'
      );

      expect(first.modelsAssigned).toBe(2);
      expect(first.fallbackAssigned).toBe(1);
      expect(first.profile.models).toEqual({
        'sdd-init': 'provider/model',
        'sdd-orchestrator': 'provider/model'
      });
      expect(first.profile.fallback).toEqual({
        'sdd-init': 'provider/model'
      });

      const second = assignModelToUnassignedProfilePhases(
        first.profile,
        ['sdd-init', 'sdd-init-fallback', 'sdd-orchestrator', 'general-agent'],
        'provider/model'
      );

      expect(second.modelsAssigned).toBe(0);
      expect(second.fallbackAssigned).toBe(0);
      expect(second.profile).toEqual(first.profile);
    });

    it('rejects blank model ids without changing profile data', () => {
      const profile = { models: { 'sdd-init': '' }, fallback: {} };

      expect(() =>
        assignModelToUnassignedProfilePhases(profile, ['sdd-init'], '   ')
      ).toThrow('modelId must be a non-empty string');
      expect(profile.models['sdd-init']).toBe('');
    });
  });

  describe('applyBulkProfilePhaseAssignment', () => {
    const agents = ['sdd-init', 'sdd-spec', 'sdd-design', 'sdd-apply', 'sdd-orchestrator', 'sdd-init-fallback', 'general'];

    it('fills only unassigned primary phase models without touching fallbacks', () => {
      const profile: ProfileData = {
        models: { 'sdd-init': '', 'sdd-spec': 'existing/spec', 'sdd-design': '   ' },
        fallback: { 'sdd-init': 'fallback/existing' }
      };

      const result = applyBulkProfilePhaseAssignment(profile, agents, 'provider/model', {
        target: BULK_ASSIGNMENT_TARGET.PRIMARY,
        mode: BULK_ASSIGNMENT_MODE.FILL_ONLY
      });

      expect(result.changed).toBe(true);
      expect(result.modelsAssigned).toBe(4);
      expect(result.fallbackAssigned).toBe(0);
      expect(result.profile.models).toEqual({
        'sdd-init': 'provider/model',
        'sdd-spec': 'existing/spec',
        'sdd-design': 'provider/model',
        'sdd-apply': 'provider/model',
        'sdd-orchestrator': 'provider/model'
      });
      expect(result.profile.fallback).toEqual({ 'sdd-init': 'fallback/existing' });
      expect(profile.models['sdd-init']).toBe('');
    });

    it('fills only unassigned fallback phase models without touching primary models', () => {
      const profile: ProfileData = {
        models: { 'sdd-init': 'primary/existing' },
        fallback: { 'sdd-init': '', 'sdd-spec': 'fallback/existing' }
      };

      const result = applyBulkProfilePhaseAssignment(profile, agents, 'provider/model', {
        target: BULK_ASSIGNMENT_TARGET.FALLBACK,
        mode: BULK_ASSIGNMENT_MODE.FILL_ONLY
      });

      expect(result.changed).toBe(true);
      expect(result.modelsAssigned).toBe(0);
      expect(result.fallbackAssigned).toBe(3);
      expect(result.profile.models).toEqual({ 'sdd-init': 'primary/existing' });
      expect(result.profile.fallback).toEqual({
        'sdd-init': 'provider/model',
        'sdd-spec': 'fallback/existing',
        'sdd-design': 'provider/model',
        'sdd-apply': 'provider/model'
      });
      expect(result.profile.fallback?.['sdd-orchestrator']).toBeUndefined();
    });

    it('fills unassigned primary and fallback phase models for both target', () => {
      const result = applyBulkProfilePhaseAssignment({ models: {}, fallback: {} }, agents, 'provider/model', {
        target: BULK_ASSIGNMENT_TARGET.BOTH,
        mode: BULK_ASSIGNMENT_MODE.FILL_ONLY
      });

      expect(result.changed).toBe(true);
      expect(result.modelsAssigned).toBe(5);
      expect(result.fallbackAssigned).toBe(4);
      expect(result.profile.models['sdd-orchestrator']).toBe('provider/model');
      expect(result.profile.fallback?.['sdd-orchestrator']).toBeUndefined();
      expect(result.profile.models['sdd-init-fallback']).toBeUndefined();
    });

    it('overrides only primary phase models for primary target', () => {
      const profile: ProfileData = {
        models: { 'sdd-init': 'old/init', 'sdd-spec': 'old/spec' },
        fallback: { 'sdd-init': 'fallback/old' }
      };

      const result = applyBulkProfilePhaseAssignment(profile, agents, 'provider/new', {
        target: BULK_ASSIGNMENT_TARGET.PRIMARY,
        mode: BULK_ASSIGNMENT_MODE.OVERWRITE
      });

      expect(result.changed).toBe(true);
      expect(result.modelsAssigned).toBe(5);
      expect(result.fallbackAssigned).toBe(0);
      expect(result.profile.models['sdd-init']).toBe('provider/new');
      expect(result.profile.models['sdd-orchestrator']).toBe('provider/new');
      expect(result.profile.fallback).toEqual({ 'sdd-init': 'fallback/old' });
    });

    it('overrides only fallback phase models for fallback target', () => {
      const profile: ProfileData = {
        models: { 'sdd-init': 'primary/old' },
        fallback: { 'sdd-init': 'fallback/old', 'sdd-apply': 'fallback/apply' }
      };

      const result = applyBulkProfilePhaseAssignment(profile, agents, 'provider/new', {
        target: BULK_ASSIGNMENT_TARGET.FALLBACK,
        mode: BULK_ASSIGNMENT_MODE.OVERWRITE
      });

      expect(result.changed).toBe(true);
      expect(result.modelsAssigned).toBe(0);
      expect(result.fallbackAssigned).toBe(4);
      expect(result.profile.models).toEqual({ 'sdd-init': 'primary/old' });
      expect(result.profile.fallback?.['sdd-init']).toBe('provider/new');
      expect(result.profile.fallback?.['sdd-orchestrator']).toBeUndefined();
    });

    it('overrides primary and fallback phase models for both target', () => {
      const result = applyBulkProfilePhaseAssignment(
        { models: { 'sdd-init': 'old' }, fallback: { 'sdd-init': 'old-fallback' } },
        agents,
        'provider/new',
        { target: BULK_ASSIGNMENT_TARGET.BOTH, mode: BULK_ASSIGNMENT_MODE.OVERWRITE }
      );

      expect(result.changed).toBe(true);
      expect(result.modelsAssigned).toBe(5);
      expect(result.fallbackAssigned).toBe(4);
      expect(result.profile.models['sdd-init']).toBe('provider/new');
      expect(result.profile.fallback?.['sdd-init']).toBe('provider/new');
    });

    it('rejects blank models and reports no change for fill-only no-op', () => {
      const profile: ProfileData = { models: { 'sdd-init': 'existing' }, fallback: { 'sdd-init': 'existing-fallback' } };

      expect(() => applyBulkProfilePhaseAssignment(profile, ['sdd-init'], '   ', {
        target: BULK_ASSIGNMENT_TARGET.BOTH,
        mode: BULK_ASSIGNMENT_MODE.FILL_ONLY
      })).toThrow('modelId must be a non-empty string');

      const noOp = applyBulkProfilePhaseAssignment(profile, ['sdd-init'], 'provider/model', {
        target: BULK_ASSIGNMENT_TARGET.BOTH,
        mode: BULK_ASSIGNMENT_MODE.FILL_ONLY
      });
      expect(noOp.changed).toBe(false);
      expect(noOp.profile).toEqual(profile);
    });
  });

  describe('bulk profile overwrite engine (Unit 2)', () => {
    const configurableRuntime = {
      agent: {
        'gentle-orchestrator': {},
        'sdd-apply': {},
        'jd-judge-a': {},
        'review-risk': {},
        'model-audit': {},
        'gentle-ai-windows-validator': {},
        'security-scanner': {},
        compaction: {},
        summary: {},
        title: {},
        general: {},
        'sdd-apply-fallback': {},
      },
    };

    it('derives every configurable primary target from runtime inventory and excludes internal or fallback entries', () => {
      const targets = collectConfigurableProfileTargets(configurableRuntime);

      expect(targets.map((target) => [target.field, target.profileKey])).toEqual([
        ['model', 'gentle-orchestrator'],
        ['model', 'sdd-apply'],
        ['model', 'jd-judge-a'],
        ['model', 'review-risk'],
        ['model', 'model-audit'],
        ['model', 'gentle-ai-windows-validator'],
        ['model', 'security-scanner'],
      ]);
    });

    it('overwrites every catalog-derived target with model and selected effort while leaving internal profile entries untouched', () => {
      const targets = collectConfigurableProfileTargets(configurableRuntime);
      const profile = {
        models: {
          'gentle-orchestrator': 'old/orchestrator',
          'sdd-apply': 'old/apply',
          'jd-judge-a': 'old/judge',
          'review-risk': 'old/review',
          'model-audit': 'old/audit',
          'gentle-ai-windows-validator': 'old/validator',
          'security-scanner': 'old/security',
          compaction: 'internal/compaction',
        },
        configs: {
          'sdd-apply': { reasoningEffort: 'low' },
          compaction: { reasoningEffort: 'low' },
        },
      } as ProfileData;

      const result = buildBulkProfileOverwrite(profile, targets, 'openai/o3-mini', 'high', {
        providers: [{
          id: 'openai',
          models: {
            'o3-mini': {
              capabilities: { reasoning: true },
              variants: { high: { reasoningEffort: 'high' } },
            },
          },
        }],
        effortPolicy: 'bulk-compatible-prune',
      });

      expect(result.modelsAssigned).toBe(7);
      expect(result.effortsAssigned).toBe(7);
      expect(result.profile.models).toMatchObject({
        'gentle-orchestrator': 'openai/o3-mini',
        'sdd-apply': 'openai/o3-mini',
        'jd-judge-a': 'openai/o3-mini',
        'review-risk': 'openai/o3-mini',
        'model-audit': 'openai/o3-mini',
        'gentle-ai-windows-validator': 'openai/o3-mini',
        'security-scanner': 'openai/o3-mini',
        compaction: 'internal/compaction',
      });
      expect(result.profile.configs).toMatchObject({
        'gentle-orchestrator': { reasoningEffort: 'high' },
        'sdd-apply': { reasoningEffort: 'high' },
        'jd-judge-a': { reasoningEffort: 'high' },
        'review-risk': { reasoningEffort: 'high' },
        'model-audit': { reasoningEffort: 'high' },
        'gentle-ai-windows-validator': { reasoningEffort: 'high' },
        'security-scanner': { reasoningEffort: 'high' },
      });
      expect(result.profile.configs?.compaction).toEqual({ reasoningEffort: 'low' });
      expect(profile.models['sdd-apply']).toBe('old/apply');
    });

    it('uses provider-default for unsupported reasoning and deduplicates target field/profile-key pairs', () => {
      const result = buildBulkProfileOverwrite({
        models: { 'sdd-apply': 'old/apply', compaction: 'internal/compaction' },
      }, [
        { field: 'model', profileKey: 'sdd-apply' },
        { field: 'model', profileKey: 'sdd-apply' },
      ], 'anthropic/claude-3-5-sonnet', 'high', { providers: [], effortPolicy: 'bulk-compatible-prune' });

      expect(result.modelsAssigned).toBe(1);
      expect(result.effortsAssigned).toBe(1);
      expect(result.profile.models).toEqual({
        'sdd-apply': 'anthropic/claude-3-5-sonnet',
        compaction: 'internal/compaction',
      });
      expect(result.profile.configs).toEqual({
        'sdd-apply': { reasoningEffort: 'provider-default' },
      });
    });

    it('overwrites fallback models and suffixed efforts without mutating primary models or configs', () => {
      const result = buildBulkProfileOverwrite({
        models: { 'sdd-apply': 'primary/apply', 'sdd-init': 'primary/init' },
        configs: { 'sdd-apply': { reasoningEffort: 'low' } },
        fallback: { 'sdd-apply': 'old/fallback' },
      }, [
        { field: 'fallback', profileKey: 'sdd-apply' },
        { field: 'fallback', profileKey: 'sdd-init' },
        { field: 'fallback', profileKey: 'sdd-apply' },
      ], 'openai/o3-mini', 'high', {
        providers: [{ id: 'openai', models: { 'o3-mini': { capabilities: { reasoning: true }, variants: { high: { reasoningEffort: 'high' } } } } }],
        effortPolicy: 'bulk-compatible-prune',
      }, undefined, BULK_ASSIGNMENT_TARGET.FALLBACK);

      expect(result.modelsAssigned).toBe(2);
      expect(result.effortsAssigned).toBe(2);
      expect(result.profile.models).toEqual({ 'sdd-apply': 'primary/apply', 'sdd-init': 'primary/init' });
      expect(result.profile.configs).toEqual({
        'sdd-apply': { reasoningEffort: 'low' },
        'sdd-apply-fallback': { reasoningEffort: 'high' },
        'sdd-init-fallback': { reasoningEffort: 'high' },
      });
      expect(result.profile.fallback).toEqual({ 'sdd-apply': 'openai/o3-mini', 'sdd-init': 'openai/o3-mini' });
    });

    it('creates a fallback-target snapshot before one write and restores the exact legacy payload after a failed write', () => {
      const beforeRaw = JSON.stringify({ models: { 'sdd-apply': 'primary/old' } });
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(beforeRaw);
      let profileWriteAttempts = 0;
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        const normalizedPath = toPosix(filePath);
        writes.push({ filePath: normalizedPath, content: String(content) });
        if (normalizedPath.includes('/mock/profiles/team.json.tmp-') && profileWriteAttempts++ === 0) {
          throw new Error('profile write failed');
        }
      });

      expect(() => updateProfileWithBulkOverwrite(
        '/mock/profiles/team.json',
        [{ field: 'fallback', profileKey: 'sdd-apply' }],
        'anthropic/claude-3-5-sonnet',
        'high',
        { providers: [], effortPolicy: 'bulk-compatible-prune' },
        undefined,
        BULK_ASSIGNMENT_TARGET.FALLBACK,
      )).toThrow('profile write failed');

      expect(writes[0].filePath).toContain('/mock/config/profile-versions/team.json/');
      expect(JSON.parse(writes[0].content).operation.target).toBe(BULK_ASSIGNMENT_TARGET.FALLBACK);
      expect(writes.filter(({ filePath }) => filePath.includes('/mock/profiles/team.json.tmp-'))).toHaveLength(2);
      expect(JSON.parse(writes.at(-1)!.content)).toEqual(JSON.parse(beforeRaw));
      expect(vi.mocked(fs.unlinkSync).mock.calls.some(([filePath]) =>
        toPosix(filePath).includes('/mock/config/profile-versions/team.json/')
      )).toBe(true);
    });

    it('persists provider-default with the snapshot-backed overwrite transaction', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-apply': 'old/apply' },
        configs: { 'sdd-apply': { reasoningEffort: 'low' } },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      const result = updateProfileWithBulkOverwrite(
        '/mock/profiles/team.json',
        [{ field: 'model', profileKey: 'sdd-apply' }],
        'anthropic/claude-3-5-sonnet',
        'high',
        { providers: [], effortPolicy: 'bulk-compatible-prune' },
      );

      const profileWrite = writes.find(({ filePath }) => filePath.includes('/mock/profiles/team.json.tmp-'));
      expect(result.version?.beforeRaw).toContain('old/apply');
      expect(JSON.parse(profileWrite!.content)).toEqual({
        models: { 'sdd-apply': 'anthropic/claude-3-5-sonnet' },
        configs: { 'sdd-apply': { reasoningEffort: 'provider-default' } },
      });
    });

    it('creates the snapshot before one profile write and compensates the snapshot when that write fails', () => {
      const writes: string[] = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-apply': 'old/apply' },
        configs: { 'sdd-apply': { reasoningEffort: 'low' } },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any) => {
        const normalizedPath = toPosix(filePath);
        writes.push(normalizedPath);
        if (normalizedPath.includes('/mock/profiles/team.json.tmp-')) throw new Error('profile write failed');
      });

      expect(() => updateProfileWithBulkOverwrite(
        '/mock/profiles/team.json',
        [{ field: 'model', profileKey: 'sdd-apply' }],
        'anthropic/claude-3-5-sonnet',
        'high',
        { providers: [], effortPolicy: 'bulk-compatible-prune' },
      )).toThrow('profile write failed');

      expect(writes[0]).toContain('/mock/config/profile-versions/team.json/');
      expect(writes[1]).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      expect(vi.mocked(fs.unlinkSync).mock.calls.some(([filePath]) =>
        toPosix(filePath).includes('/mock/config/profile-versions/team.json/')
      )).toBe(true);
    });
  });

  describe('profile versions', () => {
    const operation = { target: BULK_ASSIGNMENT_TARGET.BOTH, mode: BULK_ASSIGNMENT_MODE.FILL_ONLY };

    it('creates dated profile versions under controlled storage with raw content and preview metadata', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-init': 'old/model' },
        fallback: { 'sdd-init': 'old/fallback' }
      }));

      const version = createProfileVersion('/mock/profiles/team.json', operation, 'Bulk fill both');

      expect(version.profileFile).toBe('team.json');
      expect(version.source).toBe(PROFILE_VERSION_SOURCE.BULK);
      expect(version.operationSummary).toBe('Bulk fill both');
      expect(version.beforeRaw).toContain('old/model');
      expect(version.preview.models).toEqual({ 'sdd-init': 'old/model' });
      expect(version.preview.fallback).toEqual({ 'sdd-init': 'old/fallback' });
      expect(toPosix(vi.mocked(fs.writeFileSync).mock.calls[0][0])).toMatch(/^\/mock\/config\/profile-versions\/team\.json\/\d{4}-/);
      expect(vi.mocked(fs.writeFileSync).mock.calls[0][1]).toContain('"beforeRaw"');
    });

    it('normalizes legacy versions without source as bulk versions', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        id: 'team.json/2026-04-26T10-00-00-000Z-a.json',
        profileFile: 'team.json',
        createdAt: '2026-04-26T10:00:00.000Z',
        operation,
        operationSummary: 'Legacy bulk fill both',
        beforeRaw: '{"models":{"sdd-init":"old"}}',
        preview: { models: { 'sdd-init': 'old' }, fallback: {} }
      }));

      const version = readProfileVersion('team.json/2026-04-26T10-00-00-000Z-a.json');

      expect(version.source).toBe(PROFILE_VERSION_SOURCE.BULK);
      expect(version.operation).toEqual({
        source: PROFILE_VERSION_SOURCE.BULK,
        target: BULK_ASSIGNMENT_TARGET.BOTH,
        mode: BULK_ASSIGNMENT_MODE.FILL_ONLY,
      });
    });

    it('prunes profile versions to the newest 60 snapshots', () => {
      const existingFiles = Array.from({ length: 61 }, (_, index) => {
        const hour = String(index).padStart(2, '0');
        return `2026-04-26T${hour}-00-00-000Z-${index}.json`;
      });
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(existingFiles as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ models: { 'sdd-init': 'old/model' }, fallback: {} }));

      createProfileVersion('/mock/profiles/team.json', operation, 'Bulk fill both');

      expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
      expect(toPosix(vi.mocked(fs.unlinkSync).mock.calls[0][0])).toBe('/mock/config/profile-versions/team.json/2026-04-26T00-00-00-000Z-0.json');
    });

    it('lists newest versions and reads previews by safe version id', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['2026-04-26T10-00-00-000Z-a.json', '2026-04-26T11-00-00-000Z-b.json'] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => JSON.stringify({
        version: 1,
        id: String(filePath).includes('11-00') ? 'team.json/2026-04-26T11-00-00-000Z-b.json' : 'team.json/2026-04-26T10-00-00-000Z-a.json',
        profileFile: 'team.json',
        createdAt: String(filePath).includes('11-00') ? '2026-04-26T11:00:00.000Z' : '2026-04-26T10:00:00.000Z',
        operation,
        operationSummary: 'Bulk fill both',
        beforeRaw: '{"models":{"sdd-init":"old"}}',
        preview: { models: { 'sdd-init': 'old' }, fallback: {} }
      }));

      const versions = listProfileVersions('team.json');
      const read = readProfileVersion(versions[0].id);

      expect(versions.map((item) => item.createdAt)).toEqual(['2026-04-26T11:00:00.000Z', '2026-04-26T10:00:00.000Z']);
      expect(read.preview.models).toEqual({ 'sdd-init': 'old' });
      expect(() => readProfileVersion('../evil.json')).toThrow('Invalid profile version id');
    });

    it('skips corrupt version files instead of failing the entire list', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        '2026-04-26T10-00-00-000Z-good.json',
        '2026-04-26T11-00-00-000Z-bad.json',
      ] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath).includes('bad.json')) {
          return '{invalid json';
        }

        return JSON.stringify({
          version: 1,
          id: 'team.json/2026-04-26T10-00-00-000Z-good.json',
          profileFile: 'team.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          operation,
          operationSummary: 'Bulk fill both',
          beforeRaw: '{"models":{"sdd-init":"old"}}',
          preview: { models: { 'sdd-init': 'old' }, fallback: {} }
        });
      });

      expect(listProfileVersions('team.json')).toEqual([
        {
          version: 1,
          id: 'team.json/2026-04-26T10-00-00-000Z-good.json',
          profileFile: 'team.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          source: PROFILE_VERSION_SOURCE.BULK,
          operation: {
            source: PROFILE_VERSION_SOURCE.BULK,
            target: BULK_ASSIGNMENT_TARGET.BOTH,
            mode: BULK_ASSIGNMENT_MODE.FILL_ONLY,
          },
          operationSummary: 'Bulk fill both',
          preview: { models: { 'sdd-init': 'old' }, fallback: {} }
        }
      ]);
    });

    it('rejects malformed parseable version payloads and skips them from lists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        '2026-04-26T10-00-00-000Z-good.json',
        '2026-04-26T11-00-00-000Z-malformed.json',
      ] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath).includes('malformed.json')) {
          return JSON.stringify({
            version: 1,
            id: 'team.json/2026-04-26T11-00-00-000Z-malformed.json',
            profileFile: 'team.json',
            createdAt: null,
            source: PROFILE_VERSION_SOURCE.BULK,
            operation,
            operationSummary: 'Bulk fill both',
            beforeRaw: null,
            preview: null,
          });
        }

        return JSON.stringify({
          version: 1,
          id: 'team.json/2026-04-26T10-00-00-000Z-good.json',
          profileFile: 'team.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          operation,
          operationSummary: 'Bulk fill both',
          beforeRaw: '{"models":{"sdd-init":"old"}}',
          preview: { models: { 'sdd-init': 'old' }, fallback: {} }
        });
      });

      expect(() => readProfileVersion('team.json/2026-04-26T11-00-00-000Z-malformed.json')).toThrow('Invalid profile version data');
      expect(listProfileVersions('team.json')).toEqual([
        {
          version: 1,
          id: 'team.json/2026-04-26T10-00-00-000Z-good.json',
          profileFile: 'team.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          source: PROFILE_VERSION_SOURCE.BULK,
          operation: {
            source: PROFILE_VERSION_SOURCE.BULK,
            target: BULK_ASSIGNMENT_TARGET.BOTH,
            mode: BULK_ASSIGNMENT_MODE.FILL_ONLY,
          },
          operationSummary: 'Bulk fill both',
          preview: { models: { 'sdd-init': 'old' }, fallback: {} }
        }
      ]);
    });

    it('sanitizes preview maps for valid persisted versions so preview formatting stays safe', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        version: 1,
        id: 'team.json/2026-04-26T10-00-00-000Z-a.json',
        profileFile: 'team.json',
        createdAt: '2026-04-26T10:00:00.000Z',
        operation,
        operationSummary: 'Bulk fill both',
        beforeRaw: '{"models":{"sdd-init":"old"}}',
        preview: {
          models: { 'sdd-init': 'old', 'sdd-apply': 42, random: 'ignored', '__proto__': 'dropped', 'invalid key': 'dropped' },
          fallback: { 'sdd-init': 'fallback', 'sdd-design': null, random: 'ignored', '': 'dropped' }
        }
      }));

      const version = readProfileVersion('team.json/2026-04-26T10-00-00-000Z-a.json');

      expect(version.preview).toEqual({
        models: { 'sdd-init': 'old', random: 'ignored' },
        fallback: { 'sdd-init': 'fallback', random: 'ignored' }
      });
      expect(() => formatProfileVersionPreviewLines(version)).not.toThrow();
    });

    it('restores only the selected profile from version raw content after snapshotting the live profile', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => toPosix(filePath).includes('/profile-versions/team.json'));
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath).includes('/profile-versions/team.json/')) {
          return JSON.stringify({
            version: 1,
            id: 'team.json/2026-04-26T10-00-00-000Z-a.json',
            profileFile: 'team.json',
            createdAt: '2026-04-26T10:00:00.000Z',
            operation,
            operationSummary: 'Bulk fill both',
            beforeRaw: '{"models":{"sdd-init":"old/model"}}',
            preview: { models: { 'sdd-init': 'old/model' }, fallback: {} }
          });
        }

        return '{"models":{"sdd-init":"live/model"}}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      const restored = restoreProfileVersion('team.json', 'team.json/2026-04-26T10-00-00-000Z-a.json');

      expect(restored.profileFile).toBe('team.json');
      expect(writes[0].filePath).toContain('/mock/config/profile-versions/team.json/');
      expect(writes[0].content).toContain('Snapshot before restoring 2026-04-26T10-00-00-000Z-a.json');
      expect(writes[0].content).toContain('live/model');
      expect(writes[1].filePath).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      expect(writes[1].content).toBe('{"models":{"sdd-init":"old/model"}}');
      const profileRename = vi.mocked(fs.renameSync).mock.calls.find(([from]) => toPosix(from).includes('/mock/profiles/team.json.tmp-'));
      expect(profileRename).toBeDefined();
      expect(toPosix(profileRename![0])).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      expect(toPosix(profileRename![1])).toBe('/mock/profiles/team.json');
      expect(() => restoreProfileVersion('other.json', 'team.json/2026-04-26T10-00-00-000Z-a.json')).toThrow('does not match selected profile');
    });

    it('restores a valid selected version even when the current live profile JSON is corrupt', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => toPosix(filePath).includes('/profile-versions/team.json'));
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath).includes('/profile-versions/team.json/')) {
          return JSON.stringify({
            version: 1,
            id: 'team.json/2026-04-26T10-00-00-000Z-a.json',
            profileFile: 'team.json',
            createdAt: '2026-04-26T10:00:00.000Z',
            operation,
            operationSummary: 'Bulk fill both',
            beforeRaw: '{"models":{"sdd-init":"old/model"}}',
            preview: { models: { 'sdd-init': 'old/model' }, fallback: {} }
          });
        }

        return '{invalid current profile';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      expect(() => restoreProfileVersion('team.json', 'team.json/2026-04-26T10-00-00-000Z-a.json')).not.toThrow();
      expect(writes[0].filePath).toContain('/mock/config/profile-versions/team.json/');
      expect(writes[0].content).toContain('"beforeRaw": "{invalid current profile"');
      expect(writes[0].content).toContain('"preview": {\n    "models": {},\n    "fallback": {}\n  }');
      expect(writes[1].filePath).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      expect(writes[1].content).toBe('{"models":{"sdd-init":"old/model"}}');
      const profileRename = vi.mocked(fs.renameSync).mock.calls.find(([from]) => toPosix(from).includes('/mock/profiles/team.json.tmp-'));
      expect(profileRename).toBeDefined();
      expect(toPosix(profileRename![0])).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      expect(toPosix(profileRename![1])).toBe('/mock/profiles/team.json');
    });

    it('restores snapshot configs and drops unsupported config keys', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => toPosix(filePath).includes('/profile-versions/team.json'));
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath).includes('/profile-versions/team.json/')) {
          return JSON.stringify({
            version: 1,
            id: 'team.json/2026-04-26T10-00-00-000Z-a.json',
            profileFile: 'team.json',
            createdAt: '2026-04-26T10:00:00.000Z',
            operation,
            operationSummary: 'Bulk fill both',
            beforeRaw: JSON.stringify({
              models: { 'sdd-init': 'old/model' },
              fallback: { 'sdd-init': 'old/fallback' },
              configs: {
                'sdd-init': { reasoningEffort: 'high' },
                random: { reasoningEffort: 'low' },
              }
            }),
            preview: {
              models: { 'sdd-init': 'old/model' },
              fallback: { 'sdd-init': 'old/fallback' },
              configs: { 'sdd-init': { reasoningEffort: 'high' } }
            }
          });
        }

        return '{"models":{"sdd-init":"live/model"}}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      restoreProfileVersion('team.json', 'team.json/2026-04-26T10-00-00-000Z-a.json');

      expect(JSON.parse(writes[1].content)).toEqual({
        models: { 'sdd-init': 'old/model' },
        fallback: { 'sdd-init': 'old/fallback' },
        configs: { 'sdd-init': { reasoningEffort: 'high' } }
      });
    });

    it('restores raw snapshot content even when beforeRaw is invalid JSON', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => toPosix(filePath).includes('/profile-versions/team.json'));
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath).includes('/profile-versions/team.json/')) {
          return JSON.stringify({
            version: 1,
            id: 'team.json/2026-04-26T10-00-00-000Z-a.json',
            profileFile: 'team.json',
            createdAt: '2026-04-26T10:00:00.000Z',
            operation,
            operationSummary: 'Bulk fill both',
            beforeRaw: '{invalid snapshot payload',
            preview: { models: {}, fallback: {} }
          });
        }

        return '{"models":{"sdd-init":"live/model"}}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      expect(() => restoreProfileVersion('team.json', 'team.json/2026-04-26T10-00-00-000Z-a.json')).not.toThrow();
      expect(writes[1].filePath).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      expect(writes[1].content).toBe('{invalid snapshot payload');
      const profileRename = vi.mocked(fs.renameSync).mock.calls.find(([from]) => toPosix(from).includes('/mock/profiles/team.json.tmp-'));
      expect(profileRename).toBeDefined();
      expect(toPosix(profileRename![0])).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      expect(toPosix(profileRename![1])).toBe('/mock/profiles/team.json');
    });

    it('creates a version before mutating bulk write and skips versioning for no-op or validation failure', () => {
      const writes: string[] = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ models: { 'sdd-init': '' }, fallback: {} }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any) => { writes.push(toPosix(filePath)); });

      const result = updateProfileWithBulkPhaseAssignment('/mock/profiles/team.json', ['sdd-init'], 'provider/model', operation);

      expect(result.assignment.changed).toBe(true);
      expect(writes[0]).toContain('/mock/config/profile-versions/team.json/');
      expect(writes[1]).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      const profileRename = vi.mocked(fs.renameSync).mock.calls.find(([from]) => toPosix(from).includes('/mock/profiles/team.json.tmp-'));
      expect(profileRename).toBeDefined();
      expect(toPosix(profileRename![0])).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      expect(toPosix(profileRename![1])).toBe('/mock/profiles/team.json');

      vi.clearAllMocks();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ models: { 'sdd-init': 'existing' }, fallback: { 'sdd-init': 'existing' } }));
      const noOp = updateProfileWithBulkPhaseAssignment('/mock/profiles/team.json', ['sdd-init'], 'provider/model', operation);
      expect(noOp.assignment.changed).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();

      expect(() => updateProfileWithBulkPhaseAssignment('/mock/profiles/team.json', ['sdd-init'], ' ', operation)).toThrow('modelId must be a non-empty string');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('reuses already-read profile raw when creating bulk version snapshots', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ models: { 'sdd-init': '' }, fallback: {} }));

      updateProfileWithBulkPhaseAssignment('/mock/profiles/team.json', ['sdd-init'], 'provider/model', operation);

      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    });

    it('uses runtime policy for bulk updates so updated runtimes persist gentle-orchestrator only', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: {
          'sdd-orchestrator': 'legacy/orchestrator',
          'sdd-init': '',
        },
        fallback: {},
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: String(filePath), content: String(content) });
      });

      const updatedPolicy = getOrchestratorPolicy(['gentle-orchestrator', 'sdd-init']);
      updateProfileWithBulkPhaseAssignment(
        '/mock/profiles/team.json',
        ['sdd-init'],
        'provider/model',
        operation,
        updatedPolicy as any,
      );

      const profileWrite = writes.find((write) => /^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/.test(write.filePath));
      expect(profileWrite).toBeDefined();
      const persistedProfile = JSON.parse(profileWrite!.content);
      expect(persistedProfile.models['gentle-orchestrator']).toBe('legacy/orchestrator');
      expect(persistedProfile.models['sdd-orchestrator']).toBeUndefined();
    });

    it('creates a phase source version before mutating a single primary phase model', () => {
      const writes: string[] = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-design': 'old/model' },
        fallback: { 'sdd-design': 'old/fallback' },
        description: 'team defaults'
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any) => { writes.push(toPosix(filePath)); });

      const result = updateProfilePhaseModel('/mock/profiles/team.json', 'sdd-design', 'primary', 'new/model');

      expect(result.changed).toBe(true);
      expect(result.version?.source).toBe(PROFILE_VERSION_SOURCE.PHASE);
      expect(result.version?.operation).toEqual({
        source: PROFILE_VERSION_SOURCE.PHASE,
        phase: 'sdd-design',
        field: 'primary',
        modelId: 'new/model',
        changedPhases: 1,
      });
      expect(result.version?.operationSummary).toBe('Set sdd-design primary model to new/model');
      expect(result.profile.models['sdd-design']).toBe('new/model');
      expect(result.profile.fallback?.['sdd-design']).toBe('old/fallback');
      expect((result.profile as any).description).toBe('team defaults');
      expect(writes[0]).toContain('/mock/config/profile-versions/team.json/');
      expect(writes[1]).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      const profileRename = vi.mocked(fs.renameSync).mock.calls.find(([from]) => toPosix(from).includes('/mock/profiles/team.json.tmp-'));
      expect(profileRename).toBeDefined();
      expect(toPosix(profileRename![0])).toMatch(/^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/);
      expect(toPosix(profileRename![1])).toBe('/mock/profiles/team.json');
    });

    it('does not persist version metadata in the profile payload for phase model updates', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-design': 'old/model' },
        fallback: { 'sdd-design': 'old/fallback' },
        description: 'team defaults'
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: String(filePath), content: String(content) });
      });

      updateProfilePhaseModel('/mock/profiles/team.json', 'sdd-design', 'primary', 'new/model');

      const profileWrite = writes.find((write) => /^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/.test(write.filePath));
      expect(profileWrite).toBeDefined();

      const persistedProfile = JSON.parse(profileWrite!.content);
      expect(persistedProfile).toEqual({
        models: { 'sdd-design': 'new/model' },
        fallback: { 'sdd-design': 'old/fallback' },
        description: 'team defaults'
      });
      expect(persistedProfile).not.toHaveProperty('source');
      expect(persistedProfile).not.toHaveProperty('operation');
      expect(persistedProfile).not.toHaveProperty('operationSummary');
      expect(persistedProfile).not.toHaveProperty('beforeRaw');
    });

    it('uses UI-derived runtime policy for detail edits so updated runtimes persist gentle-orchestrator only', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: {
          'sdd-design': 'old/model',
          'sdd-orchestrator': 'legacy/orchestrator'
        }
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: String(filePath), content: String(content) });
      });

      const updatedPolicy = resolveRuntimeOrchestratorPolicy({
        default_agent: 'gentle-orchestrator',
        agent: {
          'gentle-orchestrator': { model: 'runtime/model' },
          'sdd-design': { model: 'design/model' },
        },
      } as any);
      updateProfilePhaseModel('/mock/profiles/team.json', 'sdd-design', 'primary', 'new/model', updatedPolicy as any);

      const profileWrite = writes.find((write) => /^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/.test(write.filePath));
      expect(profileWrite).toBeDefined();

      const persistedProfile = JSON.parse(profileWrite!.content);
      expect(persistedProfile.models['gentle-orchestrator']).toBe('legacy/orchestrator');
      expect(persistedProfile.models['sdd-orchestrator']).toBeUndefined();
    });

    it('creates a phase source version before mutating a single fallback phase model', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-apply': 'old/model' },
        fallback: { 'sdd-apply': 'old/fallback' }
      }));

      const result = updateProfilePhaseModel('/mock/profiles/team.json', 'sdd-apply', 'fallback', 'new/fallback');

      expect(result.changed).toBe(true);
      expect(result.version?.source).toBe(PROFILE_VERSION_SOURCE.PHASE);
      expect(result.version?.operationSummary).toBe('Set sdd-apply fallback model to new/fallback');
      expect(result.profile.models['sdd-apply']).toBe('old/model');
      expect(result.profile.fallback?.['sdd-apply']).toBe('new/fallback');
    });

    it('skips versioning and profile writes for no-op single phase model updates', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-design': 'new/model' },
        fallback: { 'sdd-design': 'new/fallback' }
      }));

      const primaryNoOp = updateProfilePhaseModel('/mock/profiles/team.json', 'sdd-design', 'primary', 'new/model');
      const fallbackNoOp = updateProfilePhaseModel('/mock/profiles/team.json', 'sdd-design', 'fallback', 'new/fallback');

      expect(primaryNoOp.changed).toBe(false);
      expect(fallbackNoOp.changed).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('clears old primary effort, creates one snapshot, and exposes its transaction context', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'security-auditor': 'openai/old' },
        configs: { 'security-auditor': { reasoningEffort: 'high' } },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      const context = {
        providers: [] as unknown[],
        runtimePrimaryNames: ['security-auditor'],
        effortPolicy: 'interactive-clear',
      } as const;
      const result = updateProfilePhaseModel(
        '/mock/profiles/team.json',
        'security-auditor',
        'primary',
        'openai/new',
        undefined,
        context,
      );

      expect(result.changed).toBe(true);
      expect(result.version?.id).toMatch(/^team\.json\//);
      expect(result.versionId).toBe(result.version?.id);
      expect(result.context).toEqual(context);
      expect(result.profile.models['security-auditor']).toBe('openai/new');
      expect(result.profile.configs).toBeUndefined();
      expect(writes.filter(({ filePath }) => filePath.includes('/profile-versions/team.json/'))).toHaveLength(1);
      expect(writes.filter(({ filePath }) => filePath === '/mock/profiles/team.json.tmp-' + filePath.split('/mock/profiles/team.json.tmp-')[1])).toHaveLength(1);
    });

    it('removes only the newly-created snapshot when the profile write fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'security-auditor': 'openai/old' },
        configs: { 'security-auditor': { reasoningEffort: 'high' } },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath).includes('/mock/profiles/team.json.tmp-')) throw new Error('profile write failed');
      });

      expect(() => updateProfilePhaseModel(
        '/mock/profiles/team.json',
        'security-auditor',
        'primary',
        'openai/new',
      )).toThrow('profile write failed');

      expect(vi.mocked(fs.unlinkSync).mock.calls.some(([filePath]) =>
        toPosix(filePath).includes('/profile-versions/team.json/')
      )).toBe(true);
      expect(vi.mocked(fs.unlinkSync).mock.calls.every(([filePath]) =>
        toPosix(filePath).includes('/profile-versions/team.json/') || toPosix(filePath).includes('/mock/profiles/team.json.tmp-')
      )).toBe(true);
    });

    it('updates or clears reasoning without creating a version and preserves the saved model on failure', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'security-auditor': 'openai/model' },
      }));
      const writes: string[] = [];
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any) => writes.push(toPosix(filePath)));

      const updated = updateProfileReasoningWithoutVersion(
        '/mock/profiles/team.json',
        'security-auditor',
        'medium',
      );
      expect(updated.models['security-auditor']).toBe('openai/model');
      expect(updated.configs?.['security-auditor']?.reasoningEffort).toBe('medium');
      expect(writes.some((filePath) => filePath.includes('/profile-versions/'))).toBe(false);

      vi.clearAllMocks();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'security-auditor': 'openai/model' },
        configs: { 'security-auditor': { reasoningEffort: 'medium' } },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath).includes('/mock/profiles/team.json.tmp-')) throw new Error('reasoning write failed');
      });

      expect(() => updateProfileReasoningWithoutVersion(
        '/mock/profiles/team.json',
        'security-auditor',
        '',
      )).toThrow('reasoning write failed');
      expect(fs.readFileSync).toHaveBeenCalledWith('/mock/profiles/team.json', 'utf-8');
    });

    it('prunes incompatible bulk efforts while retaining compatible efforts without prompts', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      const providers = [
        {
          id: 'openai',
          models: {
            'gpt-5': {
              capabilities: { reasoning: true },
              variants: {
                low: { reasoningEffort: 'low' },
                high: { reasoningEffort: 'high' },
              },
            },
          },
        },
      ];
      const bulkOperation = {
        target: BULK_ASSIGNMENT_TARGET.PRIMARY,
        mode: BULK_ASSIGNMENT_MODE.OVERWRITE,
      } as const;

      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: {
          'sdd-spec': 'openai/old',
          'sdd-tasks': 'openai/old',
        },
        configs: {
          'sdd-spec': { reasoningEffort: 'high' },
          'sdd-tasks': { reasoningEffort: 'max' },
        },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      const result = (updateProfileWithBulkPhaseAssignment as any)(
        '/mock/profiles/team.json',
        ['sdd-spec', 'sdd-tasks'],
        'openai/gpt-5',
        bulkOperation,
        undefined,
        { providers, effortPolicy: 'bulk-compatible-prune' },
      );

      expect(result.assignment.modelsAssigned).toBe(2);
      expect(result.assignment.profile.configs).toEqual({
        'sdd-spec': { reasoningEffort: 'high' },
      });
      expect(writes.filter(({ filePath }) => filePath.includes('/profile-versions/team.json/'))).toHaveLength(1);
      expect(writes.filter(({ filePath }) => filePath.includes('/profiles/team.json.tmp-'))).toHaveLength(1);
    });

    it('stages a primary model selection and requests effort even when the model is unchanged', () => {
      const profile = {
        models: { 'sdd-apply': 'openai/gpt-5' },
        configs: { 'sdd-apply': { reasoningEffort: 'low' } },
      } as ProfileData;

      const staged = stageProfileModelSelection(profile, 'sdd-apply', 'primary', 'openai/gpt-5');

      expect(staged).toEqual({
        pending: { agentName: 'sdd-apply', field: 'primary', modelId: 'openai/gpt-5' },
        modelChanged: false,
        requestReasoningEffort: true,
      });
    });

    it('commits same-model effort changes as one model-and-effort transaction', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-apply': 'openai/gpt-5' },
        configs: { 'sdd-apply': { reasoningEffort: 'low' } },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      const pending = stageProfileModelSelection(
        { models: { 'sdd-apply': 'openai/gpt-5' }, configs: { 'sdd-apply': { reasoningEffort: 'low' } } },
        'sdd-apply',
        'primary',
        'openai/gpt-5',
      ).pending;
      const result = commitPendingModelSelection('/mock/profiles/team.json', pending, 'high', undefined, {
        providers: [{
          id: 'openai',
          models: {
            'gpt-5': {
              capabilities: { reasoning: true },
              variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } },
            },
          },
        }],
        effortPolicy: 'none',
      });

      expect(result.changed).toBe(true);
      expect(result.profile.models['sdd-apply']).toBe('openai/gpt-5');
      expect(result.profile.configs).toEqual({ 'sdd-apply': { reasoningEffort: 'high' } });
      expect(writes.filter(({ filePath }) => filePath.includes('/profile-versions/team.json/'))).toHaveLength(1);
      expect(writes.filter(({ filePath }) => filePath.includes('/profiles/team.json.tmp-'))).toHaveLength(1);
    });

    it('does not write on primary cancellation or invalid effort resolution', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-apply': 'openai/gpt-5' },
        configs: { 'sdd-apply': { reasoningEffort: 'low' } },
      }));
      const pending = stageProfileModelSelection(
        { models: { 'sdd-apply': 'openai/gpt-5' }, configs: { 'sdd-apply': { reasoningEffort: 'low' } } },
        'sdd-apply',
        'primary',
        'openai/gpt-5',
      ).pending;

      const cancelled = commitPendingModelSelection('/mock/profiles/team.json', pending);
      expect(cancelled.changed).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();

      expect(() => commitPendingModelSelection('/mock/profiles/team.json', pending, 'not-a-provider-effort', undefined, {
        providers: [{ id: 'openai', models: { 'gpt-5': { capabilities: { reasoning: true }, variants: { high: { reasoningEffort: 'high' } } } } }],
        effortPolicy: 'none',
      })).toThrow(/not available/);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('commits a catalog orchestrator selection to the supplied canonical owner and prunes stale aliases', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: {
          'sdd-orchestrator': 'legacy/model',
          'sdd-ORCHETATOR': 'catalog/model',
        },
        configs: {
          'sdd-orchestrator': { reasoningEffort: 'low' },
          'sdd-ORCHETATOR': { reasoningEffort: 'medium' },
        },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      const result = commitPendingModelSelection(
        '/mock/profiles/team.json',
        { agentName: 'sdd-ORCHETATOR', field: 'primary', modelId: 'google/gemini-2.5-flash' },
        'high',
        getOrchestratorPolicy(['gentle-orchestrator']) as any,
        {
          providers: [{
            id: 'google',
            models: {
              'gemini-2.5-flash': {
                capabilities: { reasoning: true },
                variants: { high: { reasoningEffort: 'high' } },
              },
            },
          }],
          effortPolicy: 'none',
        },
      );

      const profileWrite = writes.find(({ filePath }) => filePath.includes('/profiles/team.json.tmp-'));
      const persisted = JSON.parse(profileWrite!.content);
      expect(result.changed).toBe(true);
      expect(persisted.models).toEqual({ 'gentle-orchestrator': 'google/gemini-2.5-flash' });
      expect(persisted.configs).toEqual({ 'gentle-orchestrator': { reasoningEffort: 'high' } });
      expect(persisted.models['sdd-orchestrator']).toBeUndefined();
      expect(persisted.models['sdd-ORCHETATOR']).toBeUndefined();
      expect(persisted.configs['sdd-orchestrator']).toBeUndefined();
      expect(persisted.configs['sdd-ORCHETATOR']).toBeUndefined();
    });

    it('clears provider default without persisting its token or display label', () => {
      const writes: string[] = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-apply': 'openai/gpt-5' },
        configs: { 'sdd-apply': { reasoningEffort: 'high' } },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push(`${toPosix(filePath)}\n${String(content)}`);
      });

      const pending = { agentName: 'sdd-apply', field: 'primary', modelId: 'openai/gpt-5' } as const;
      const result = commitPendingModelSelection('/mock/profiles/team.json', pending, 'provider-default');

      expect(result.profile.configs).toBeUndefined();
      const profileWrite = writes.find((entry) => entry.includes('/profiles/team.json.tmp-'));
      expect(profileWrite).toBeDefined();
      expect(profileWrite).not.toContain('provider-default');
      expect(profileWrite).not.toContain('Predeterminado');
    });

    it('commits a fallback model and its suffixed reasoning effort in one versioned write', () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-apply': 'openai/old' },
        fallback: { 'sdd-apply': 'openai/old' },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: toPosix(filePath), content: String(content) });
      });

      const result = commitPendingModelSelection(
        '/mock/profiles/team.json',
        { agentName: 'sdd-apply', field: 'fallback', modelId: 'openai/gpt-5' },
        'high',
        undefined,
        { providers: [{ id: 'openai', models: { 'gpt-5': { capabilities: { reasoning: true }, variants: { high: { reasoningEffort: 'high' } } } } }], effortPolicy: 'none' },
      );

      expect(result.changed).toBe(true);
      expect(result.profile.fallback?.['sdd-apply']).toBe('openai/gpt-5');
      expect(result.profile.configs).toEqual({ 'sdd-apply-fallback': { reasoningEffort: 'high' } });
      expect(writes.filter(({ filePath }) => filePath.includes('/profile-versions/team.json/'))).toHaveLength(1);
      expect(writes.filter(({ filePath }) => filePath.includes('/profiles/team.json.tmp-'))).toHaveLength(1);
    });

    it('aborts before the profile write when snapshot creation fails', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: { 'sdd-apply': 'openai/old' },
      }));
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath).includes('/profile-versions/team.json/')) {
          throw new Error('snapshot write failed');
        }
      });

      expect(() => updateProfilePhaseModel(
        '/mock/profiles/team.json',
        'sdd-apply',
        'primary',
        'openai/new',
      )).toThrow('snapshot write failed');
      expect(vi.mocked(fs.writeFileSync).mock.calls.some(([filePath]) =>
        toPosix(filePath).includes('/profiles/team.json.tmp-')
      )).toBe(false);
    });

    it('renames matching profile version history with migrated snapshot metadata', () => {
      const files: Record<string, string> = {
        '/mock/profiles/old.json': '{"models":{"sdd-init":"live/model"}}',
        '/mock/config/profile-versions/old.json/2026-04-26T10-00-00-000Z-a.json': JSON.stringify({
          version: 1,
          id: 'old.json/2026-04-26T10-00-00-000Z-a.json',
          profileFile: 'old.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          operation,
          operationSummary: 'Bulk fill both',
          beforeRaw: '{"models":{"sdd-init":"old/model"}}',
          preview: { models: { 'sdd-init': 'old/model' }, fallback: {} }
        })
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const target = toPosix(filePath);
        if (target in files) return true;
        return Object.keys(files).some((existingPath) => existingPath.startsWith(`${target}/`));
      });
      vi.mocked(fs.readdirSync).mockImplementation((dirPath: any) => {
        const target = `${toPosix(dirPath)}/`;
        return Object.keys(files)
          .filter((filePath) => filePath.startsWith(target))
          .map((filePath) => filePath.slice(target.length))
          .filter((entry) => !entry.includes('/')) as any;
      });
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => files[toPosix(filePath)]);
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        files[toPosix(filePath)] = String(content);
      });
      vi.mocked(fs.renameSync).mockImplementation((fromPath: any, toPath: any) => {
        const from = toPosix(fromPath);
        const to = toPosix(toPath);

        if (from in files) {
          files[to] = files[from];
          delete files[from];
          return;
        }

        const prefix = `${from}/`;
        for (const filePath of Object.keys(files)) {
          if (!filePath.startsWith(prefix)) continue;
          const nextPath = `${to}/${filePath.slice(prefix.length)}`;
          files[nextPath] = files[filePath];
          delete files[filePath];
        }
      });

      renameProfileFile('old.json', 'new.json');

      const versions = listProfileVersions('new.json');
      const read = readProfileVersion('new.json/2026-04-26T10-00-00-000Z-a.json');

      expect(versions).toEqual([
        {
          version: 1,
          id: 'new.json/2026-04-26T10-00-00-000Z-a.json',
          profileFile: 'new.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          source: PROFILE_VERSION_SOURCE.BULK,
          operation: {
            source: PROFILE_VERSION_SOURCE.BULK,
            target: BULK_ASSIGNMENT_TARGET.BOTH,
            mode: BULK_ASSIGNMENT_MODE.FILL_ONLY,
          },
          operationSummary: 'Bulk fill both',
          preview: { models: { 'sdd-init': 'old/model' }, fallback: {} }
        }
      ]);
      expect(read.id).toBe('new.json/2026-04-26T10-00-00-000Z-a.json');
      expect(read.profileFile).toBe('new.json');
      expect(vi.mocked(fs.renameSync).mock.calls.some(([from, to]) =>
        toPosix(from) === '/mock/profiles/old.json' && toPosix(to) === '/mock/profiles/new.json'
      )).toBe(true);
      expect(vi.mocked(fs.renameSync).mock.calls.some(([from, to]) =>
        toPosix(from) === '/mock/config/profile-versions/old.json' && toPosix(to) === '/mock/config/profile-versions/new.json'
      )).toBe(true);
    });

    it('renames the profile and preserves corrupt version files without blocking valid snapshot migration', () => {
      const files: Record<string, string> = {
        '/mock/profiles/old.json': '{"models":{"sdd-init":"live/model"}}',
        '/mock/config/profile-versions/old.json/2026-04-26T10-00-00-000Z-good.json': JSON.stringify({
          version: 1,
          id: 'old.json/2026-04-26T10-00-00-000Z-good.json',
          profileFile: 'old.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          operation,
          operationSummary: 'Bulk fill both',
          beforeRaw: '{"models":{"sdd-init":"old/model"}}',
          preview: { models: { 'sdd-init': 'old/model' }, fallback: {} }
        }),
        '/mock/config/profile-versions/old.json/2026-04-26T11-00-00-000Z-bad.json': '{invalid json'
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const target = toPosix(filePath);
        if (target in files) return true;
        return Object.keys(files).some((existingPath) => existingPath.startsWith(`${target}/`));
      });
      vi.mocked(fs.readdirSync).mockImplementation((dirPath: any) => {
        const target = `${toPosix(dirPath)}/`;
        return Object.keys(files)
          .filter((filePath) => filePath.startsWith(target))
          .map((filePath) => filePath.slice(target.length))
          .filter((entry) => !entry.includes('/')) as any;
      });
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => files[toPosix(filePath)]);
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        files[toPosix(filePath)] = String(content);
      });
      vi.mocked(fs.renameSync).mockImplementation((fromPath: any, toPath: any) => {
        const from = toPosix(fromPath);
        const to = toPosix(toPath);

        if (from in files) {
          files[to] = files[from];
          delete files[from];
          return;
        }

        const prefix = `${from}/`;
        for (const filePath of Object.keys(files)) {
          if (!filePath.startsWith(prefix)) continue;
          const nextPath = `${to}/${filePath.slice(prefix.length)}`;
          files[nextPath] = files[filePath];
          delete files[filePath];
        }
      });

      renameProfileFile('old.json', 'new.json');

      expect(listProfileVersions('new.json')).toEqual([
        {
          version: 1,
          id: 'new.json/2026-04-26T10-00-00-000Z-good.json',
          profileFile: 'new.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          source: PROFILE_VERSION_SOURCE.BULK,
          operation: {
            source: PROFILE_VERSION_SOURCE.BULK,
            target: BULK_ASSIGNMENT_TARGET.BOTH,
            mode: BULK_ASSIGNMENT_MODE.FILL_ONLY,
          },
          operationSummary: 'Bulk fill both',
          preview: { models: { 'sdd-init': 'old/model' }, fallback: {} }
        }
      ]);
      expect(files['/mock/config/profile-versions/new.json/2026-04-26T11-00-00-000Z-bad.json']).toBe('{invalid json');
      expect(files['/mock/config/profile-versions/new.json/2026-04-26T10-00-00-000Z-good.json']).toContain('"id": "new.json/2026-04-26T10-00-00-000Z-good.json"');
    });

    it('rolls back the profile rename if version history rename fails', () => {
      const files: Record<string, string> = {
        '/mock/profiles/old.json': '{"models":{"sdd-init":"live/model"}}',
        '/mock/config/profile-versions/old.json/2026-04-26T10-00-00-000Z-a.json': JSON.stringify({
          version: 1,
          id: 'old.json/2026-04-26T10-00-00-000Z-a.json',
          profileFile: 'old.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          operation,
          operationSummary: 'Bulk fill both',
          beforeRaw: '{"models":{"sdd-init":"old/model"}}',
          preview: { models: { 'sdd-init': 'old/model' }, fallback: {} }
        })
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const target = toPosix(filePath);
        if (target in files) return true;
        return Object.keys(files).some((existingPath) => existingPath.startsWith(`${target}/`));
      });
      vi.mocked(fs.readdirSync).mockImplementation((dirPath: any) => {
        const target = `${toPosix(dirPath)}/`;
        return Object.keys(files)
          .filter((filePath) => filePath.startsWith(target))
          .map((filePath) => filePath.slice(target.length))
          .filter((entry) => !entry.includes('/')) as any;
      });
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => files[toPosix(filePath)]);
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        files[toPosix(filePath)] = String(content);
      });
      vi.mocked(fs.renameSync).mockImplementation((fromPath: any, toPath: any) => {
        const from = toPosix(fromPath);
        const to = toPosix(toPath);

        if (from === '/mock/config/profile-versions/old.json' && to === '/mock/config/profile-versions/new.json') {
          throw new Error('version rename failed');
        }

        if (from in files) {
          files[to] = files[from];
          delete files[from];
          return;
        }

        const prefix = `${from}/`;
        for (const filePath of Object.keys(files)) {
          if (!filePath.startsWith(prefix)) continue;
          const nextPath = `${to}/${filePath.slice(prefix.length)}`;
          files[nextPath] = files[filePath];
          delete files[filePath];
        }
      });

      expect(() => renameProfileFile('old.json', 'new.json')).toThrow('version rename failed');
      expect(files['/mock/profiles/old.json']).toBe('{"models":{"sdd-init":"live/model"}}');
      expect(files['/mock/profiles/new.json']).toBeUndefined();
    });

    it('rolls back rewritten version metadata if migration fails mid-rewrite', () => {
      const files: Record<string, string> = {
        '/mock/profiles/old.json': '{"models":{"sdd-init":"live/model"}}',
        '/mock/config/profile-versions/old.json/2026-04-26T10-00-00-000Z-a.json': JSON.stringify({
          version: 1,
          id: 'old.json/2026-04-26T10-00-00-000Z-a.json',
          profileFile: 'old.json',
          createdAt: '2026-04-26T10:00:00.000Z',
          operation,
          operationSummary: 'Bulk fill both',
          beforeRaw: '{"models":{"sdd-init":"old/model"}}',
          preview: { models: { 'sdd-init': 'old/model' }, fallback: {} }
        }),
        '/mock/config/profile-versions/old.json/2026-04-26T11-00-00-000Z-b.json': JSON.stringify({
          version: 1,
          id: 'old.json/2026-04-26T11-00-00-000Z-b.json',
          profileFile: 'old.json',
          createdAt: '2026-04-26T11:00:00.000Z',
          operation,
          operationSummary: 'Bulk fill both again',
          beforeRaw: '{"models":{"sdd-init":"older/model"}}',
          preview: { models: { 'sdd-init': 'older/model' }, fallback: {} }
        })
      };

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => {
        const target = toPosix(filePath);
        if (target in files) return true;
        return Object.keys(files).some((existingPath) => existingPath.startsWith(`${target}/`));
      });
      vi.mocked(fs.readdirSync).mockImplementation((dirPath: any) => {
        const target = `${toPosix(dirPath)}/`;
        return Object.keys(files)
          .filter((filePath) => filePath.startsWith(target))
          .map((filePath) => filePath.slice(target.length))
          .filter((entry) => !entry.includes('/')) as any;
      });
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => files[toPosix(filePath)]);
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        files[toPosix(filePath)] = String(content);
      });
      vi.mocked(fs.renameSync).mockImplementation((fromPath: any, toPath: any) => {
        const from = toPosix(fromPath);
        const to = toPosix(toPath);

        if (from.includes('2026-04-26T11-00-00-000Z-b.json.tmp-') && to.endsWith('/2026-04-26T11-00-00-000Z-b.json')) {
          throw new Error('version rewrite failed');
        }

        if (from in files) {
          files[to] = files[from];
          delete files[from];
          return;
        }

        const prefix = `${from}/`;
        for (const filePath of Object.keys(files)) {
          if (!filePath.startsWith(prefix)) continue;
          const nextPath = `${to}/${filePath.slice(prefix.length)}`;
          files[nextPath] = files[filePath];
          delete files[filePath];
        }
      });

      expect(() => renameProfileFile('old.json', 'new.json')).toThrow('version rewrite failed');
      expect(files['/mock/profiles/old.json']).toBe('{"models":{"sdd-init":"live/model"}}');
      expect(files['/mock/profiles/new.json']).toBeUndefined();
      const directVersionWrites = vi.mocked(fs.writeFileSync).mock.calls
        .map(([filePath]) => toPosix(filePath))
        .filter((filePath) => filePath.startsWith('/mock/config/profile-versions/new.json/') && filePath.endsWith('.json'));
      expect(directVersionWrites).toEqual([]);

      const firstVersion = readProfileVersion('old.json/2026-04-26T10-00-00-000Z-a.json');
      const secondVersion = readProfileVersion('old.json/2026-04-26T11-00-00-000Z-b.json');

      expect(firstVersion.id).toBe('old.json/2026-04-26T10-00-00-000Z-a.json');
      expect(firstVersion.profileFile).toBe('old.json');
      expect(secondVersion.id).toBe('old.json/2026-04-26T11-00-00-000Z-b.json');
      expect(secondVersion.profileFile).toBe('old.json');
      expect(files['/mock/config/profile-versions/new.json/2026-04-26T10-00-00-000Z-a.json']).toBeUndefined();
    });

    it('reports invalid profile version data when version file JSON is corrupt', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{invalid json');

      expect(() => readProfileVersion('team.json/2026-04-26T10-00-00-000Z-a.json')).toThrow('Invalid profile version data');
    });

    it('deletes matching profile version history with the profile file', () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => toPosix(filePath) === '/mock/config/profile-versions/team.json');

      deleteProfileFile('team.json');

      expect(toPosix(vi.mocked(fs.unlinkSync).mock.calls[0][0])).toBe('/mock/profiles/team.json');
      expect(toPosix(vi.mocked(fs.rmSync).mock.calls[0][0])).toBe('/mock/config/profile-versions/team.json');
      expect(vi.mocked(fs.rmSync).mock.calls[0][1]).toEqual({ recursive: true, force: true });
    });
  });

  describe('persisted profile maps and custom preservation (T04-T09, T21, T22)', () => {
    it('T04: covers approved fallback persistence and runtime eligibility filtering', () => {
      const fallback = Object.fromEntries([
        'sdd-ORCHETATOR',
        'sdd-propose',
        'sdd-design',
        'sdd-apply',
        'sdd-verify',
        'sdd-spec',
        'sdd-onboard',
        'sdd-explore',
        'sdd-init',
        'sdd-tasks',
        'sdd-archive',
        'jd-judge-a',
        'jd-judge-b',
        'jd-fix-agent',
        'review-readability',
        'review-reliability',
        'review-resilience',
        'review-validator',
        'review-refuter',
        'review-risk',
        'gentle-ai-windows-validator',
        'compaction',
        'summary',
        'title',
      ].map((name) => [name, `fallback/${name}`]));
      const profile = { models: { 'sdd-apply': 'primary/model' }, fallback } as ProfileData;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(profile));

      expect(readProfileData('/mock/profiles/all-fallbacks.json').fallback).toEqual(fallback);
      writeProfileData('/mock/profiles/all-fallbacks.json', profile);
      expect(JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1])).fallback).toEqual(fallback);

      const synced = syncSddFallbackAgents({
        agent: {
          'sdd-apply': { model: 'primary/model' },
          'gentle-ai-windows-validator': { model: 'validator/model' },
          compaction: { model: 'compaction/model' },
          summary: { model: 'summary/model' },
          title: { model: 'title/model' },
        },
      }, fallback);

      expect(synced.agent['sdd-apply-fallback']?.model).toBe('fallback/sdd-apply');
      expect(synced.agent['gentle-ai-windows-validator-fallback']?.model).toBe('fallback/gentle-ai-windows-validator');
      expect(synced.agent['compaction-fallback']).toBeUndefined();
      expect(synced.agent['summary-fallback']).toBeUndefined();
      expect(synced.agent['title-fallback']).toBeUndefined();
      expect(synced.agent['sdd-ORCHETATOR-fallback']).toBeUndefined();
    });

    it('T04: preserves an existing runtime-ineligible fallback while refusing to synthesize it', () => {
      const currentConfig = {
        agent: {
          compaction: { model: 'runtime/compaction' },
          'compaction-fallback': { model: 'runtime/old-compaction', custom: true },
        },
      };

      const synced = syncSddFallbackAgents(currentConfig, {
        compaction: 'profile/compaction',
      });

      expect(synced.agent['compaction-fallback']).toEqual(currentConfig.agent['compaction-fallback']);
      expect(synced.agent['compaction-fallback']?.model).toBe('runtime/old-compaction');
    });

    it('T04: validates runtime-eligible catalog fallbacks without rejecting stored-only catalog intent', () => {
      const errors = validateProfileFallbackMapping({
        agent: {
          'gentle-ai-windows-validator': { model: 'runtime/validator' },
        },
      }, {
        'gentle-ai-windows-validator': 'profile/validator',
        'sdd-ORCHETATOR': 'profile/orchestrator',
        compaction: 'profile/compaction',
        summary: 'profile/summary',
        title: 'profile/title',
      });

      expect(errors).toEqual([]);
      expect(validateProfileFallbackMapping({ agent: { 'sdd-apply': { model: 'runtime/apply' } } }, {
        'sdd-apply': 'profile/apply',
        compaction: 'profile/compaction',
      })).toEqual([]);
    });

    it('T09: syncSddFallbackAgents never synthesizes fallback for ineligible/custom primaries', () => {
      const synced = syncSddFallbackAgents({ agent: { 'my-agent': { model: 'p/m' }, 'sdd-init': { model: 'p/m' } } }, {});
      expect(synced.agent['sdd-init-fallback']).toBeDefined();
      expect(synced.agent['my-agent-fallback']).toBeUndefined();
    });

    it('T17: updateProfilePhaseModel validates fallback eligibility and stores profileKey', () => {
      const profilePath = '/mock/profiles/test.json';
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ models: { 'sdd-apply': 'old/m' } }));

      const resBase = updateProfilePhaseModel(profilePath, 'sdd-apply', 'fallback', 'provider/apply-fb');
      expect(resBase.profile.fallback?.['sdd-apply']).toBe('provider/apply-fb');
      expect(resBase.profile.fallback?.['sdd-apply-fallback']).toBeUndefined();

      const resFuture = updateProfilePhaseModel(profilePath, 'sdd-future', 'fallback', 'provider/future-fb');
      expect(resFuture.profile.fallback?.['sdd-future']).toBe('provider/future-fb');

      expect(() => updateProfilePhaseModel(profilePath, 'model-audit', 'fallback', 'p/fb')).toThrow(/not eligible/);
      expect(() => updateProfilePhaseModel(profilePath, 'sdd-orchestrator', 'fallback', 'p/fb')).toThrow();
      expect(() => updateProfilePhaseModel(profilePath, 'my-agent', 'fallback', 'p/fb')).toThrow();
    });

    it('T34: syncSddFallbackAgents requires an explicit model-audit override and excludes auxiliaries/custom agents', () => {
      const config = {
        agent: {
          'sdd-init': { model: 'p/init' },
          'sdd-future': { model: 'p/future' },
          'model-audit': { model: 'p/audit', description: 'Review provider output' },
          'my-agent': { model: 'p/custom' },
          compaction: { model: 'p/compaction' },
          summary: { model: 'p/summary' },
          title: { model: 'p/title' },
        }
      };
      const fallbackWithoutModelAuditOverride = {
        'sdd-init': 'p/init-fb',
        'sdd-future': 'p/future-fb',
      };
      const withoutModelAuditOverride = syncSddFallbackAgents(config, fallbackWithoutModelAuditOverride);
      expect(withoutModelAuditOverride.agent['model-audit-fallback']).toBeUndefined();

      const retainedWithoutModelAuditOverride = syncSddFallbackAgents({
        agent: {
          ...config.agent,
          'model-audit-fallback': { model: 'p/audit-existing', description: 'Preserve this definition' },
        }
      }, fallbackWithoutModelAuditOverride);
      expect(retainedWithoutModelAuditOverride.agent['model-audit-fallback']).toEqual({
        model: 'p/audit-existing',
        description: 'Preserve this definition',
      });

      const fallback = {
        'sdd-init': 'p/init-fb',
        'sdd-future': 'p/future-fb',
        'model-audit': 'p/audit-fb',
        'my-agent': 'p/custom-fb',
        compaction: 'p/compaction-fb',
        summary: 'p/summary-fb',
        title: 'p/title-fb',
      };
      const synced = syncSddFallbackAgents(config, fallback);
      expect(synced.agent['sdd-init-fallback'].model).toBe('p/init-fb');
      expect(synced.agent['sdd-future-fallback'].model).toBe('p/future-fb');
      expect(synced.agent['model-audit-fallback']).toEqual({
        model: 'p/audit-fb',
        description: 'Review provider output',
      });
      expect(synced.agent['my-agent-fallback']).toBeUndefined();
      expect(synced.agent['compaction-fallback']).toBeUndefined();
      expect(synced.agent['summary-fallback']).toBeUndefined();
      expect(synced.agent['title-fallback']).toBeUndefined();
    });

    it('T34: applyProfileDataToConfig and activation preserves explicit future pairs and external agents', () => {
      const currentConfig = {
        agent: {
          'external-agent': { model: 'ext/m', provider: 'other' },
          'sdd-init': { model: 'old/init' },
        }
      };
      const profile: ProfileData = {
        models: { 'sdd-init': 'new/init', 'sdd-future': 'new/future' },
        fallback: { 'sdd-init': 'new/init-fb', 'sdd-future': 'new/future-fb' },
      };
      const next = applyProfileDataToConfig(currentConfig, profile);
      expect(next.agent['external-agent']).toEqual(currentConfig.agent['external-agent']);
      expect(next.agent['sdd-init'].model).toBe('new/init');
      expect(next.agent['sdd-init-fallback'].model).toBe('new/init-fb');
      expect(next.agent['sdd-future'].model).toBe('new/future');
      expect(next.agent['sdd-future-fallback'].model).toBe('new/future-fb');
    });

    it('T21: bulk assignment updates only managed primary and eligible fallback agents', () => {
      const profile: ProfileData = {
        models: { 'sdd-init': 'old/m', 'sdd-future': 'old/m', 'model-audit': 'old/m', 'my-agent': 'old/m' },
        fallback: { 'sdd-init': 'old/fb', 'sdd-future': 'old/fb', 'model-audit': 'old/fb', 'my-agent': 'old/fb' }
      };
      const res = applyBulkProfilePhaseAssignment(
        profile,
        ['sdd-init', 'sdd-future', 'model-audit', 'my-agent'],
        'bulk/new',
        { target: BULK_ASSIGNMENT_TARGET.BOTH, mode: BULK_ASSIGNMENT_MODE.OVERWRITE }
      );
      expect(res.profile.models).toEqual({
        'sdd-init': 'bulk/new',
        'sdd-future': 'bulk/new',
        'model-audit': 'bulk/new',
        'my-agent': 'old/m',
      });
      expect(res.profile.fallback).toEqual({
        'sdd-init': 'bulk/new',
        'sdd-future': 'bulk/new',
        'model-audit': 'old/fb',
        'my-agent': 'old/fb',
      });
    });
    it('T05: normalizes legacy aliases idempotently without dropping unknown valid assignments', () => {
      const legacy = {
        models: {
          'sdd-orchestrator': ' legacy/orchestrator ',
          'security-auditor': ' custom/model ',
        },
        fallback: { 'security-auditor': ' custom/fallback ' },
        configs: { 'security-auditor': { reasoningEffort: ' high ' } },
        description: 'team defaults',
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacy));

      const normalized = readProfileData('/mock/profiles/legacy-custom.json');
      expect(normalized).toEqual({
        models: {
          'sdd-orchestrator': 'legacy/orchestrator',
          'security-auditor': 'custom/model',
        },
        fallback: { 'security-auditor': 'custom/fallback' },
        configs: { 'security-auditor': { reasoningEffort: 'high' } },
        description: 'team defaults',
      });

      writeProfileData('/mock/profiles/legacy-custom.json', normalized);
      const persisted = JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]));
      expect(persisted).toEqual(normalized);

      vi.clearAllMocks();
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(persisted));
      expect(readProfileData('/mock/profiles/legacy-custom.json')).toEqual(normalized);
    });

    it('T05: preserves unknown valid assignments in a legacy flat profile', () => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        'security-auditor': { model: ' custom/model ' },
        description: 'team defaults',
      }));

      expect(readProfileData('/mock/profiles/legacy-flat-custom.json')).toEqual({
        models: {
          'security-auditor': 'custom/model',
          description: 'team defaults',
        },
      });
    });

    it('T05: retains the catalog orchestrator alias in persisted intent while runtime sync excludes it', () => {
      const profile = {
        models: { 'sdd-ORCHETATOR': 'catalog/orchestrator' },
        fallback: { 'sdd-ORCHETATOR': 'catalog/fallback' },
      } as ProfileData;
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(profile));

      expect(readProfileData('/mock/profiles/catalog-alias.json')).toEqual({
        models: { 'sdd-orchestrator': 'catalog/orchestrator' },
        fallback: profile.fallback,
      });
      writeProfileData('/mock/profiles/catalog-alias.json', profile);
      expect(JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]))).toEqual(profile);

      const synced = syncSddFallbackAgents({ agent: {} }, profile.fallback || {});
      expect(synced.agent['sdd-ORCHETATOR-fallback']).toBeUndefined();
    });

    it.each([
      ['modern models', { models: { 'my-agent': 'provider/custom-model', 'sdd-init': 'provider/gpt-4' } }],
      ['legacy flat', { 'my-agent': 'provider/custom-model', 'sdd-init': 'provider/gpt-4' }],
      ['config agent', { agent: { 'my-agent': { model: 'provider/custom-model' }, 'sdd-init': { model: 'provider/gpt-4' } } }]
    ])('T04: preserves valid custom agent in %s format', (_, payload) => {
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(payload));
      const expected = { 'my-agent': 'provider/custom-model', 'sdd-init': 'provider/gpt-4' };
      expect(readProfileModels('/mock/p.json')).toEqual(expected);
      expect(readProfileData('/mock/p.json').models).toEqual(expected);
    });

    it('T05, T08: preserves valid and ineligible custom fallback models on read/write', () => {
      const payload: ProfileData = {
        models: { 'sdd-init': 'p/gpt-4' },
        fallback: { 'my-agent': 'p/custom-fb', 'sdd-init': 'p/gpt-3.5' }
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(payload));
      expect(readProfileFallbackModels('/mock/p.json')).toEqual(payload.fallback);
      expect(readProfileData('/mock/p.json').fallback).toEqual(payload.fallback);

      writeProfileData('/mock/p.json', payload);
      expect(JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1])).fallback).toEqual(payload.fallback);
    });

    it('T06: round-trips top-level extras with nested custom models and fallbacks', () => {
      const payload = {
        description: 'team defaults',
        customField: { active: true },
        models: { 'my-agent': 'p/custom', 'sdd-init': 'p/gpt-4' },
        fallback: { 'my-agent': 'p/custom-fb' }
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(payload));
      const read = readProfileData('/mock/p.json');
      expect(read).toMatchObject(payload);

      writeProfileData('/mock/p.json', read);
      expect(JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]))).toMatchObject(payload);
    });

    it('round-trips reasoning config for a custom primary agent', () => {
      const payload = {
        models: { 'security-auditor': 'openai/gpt-5' },
        configs: { 'security-auditor': { reasoningEffort: 'high' } },
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(payload));

      const profile = readProfileData('/mock/profiles/custom.json');
      expect(profile.configs).toEqual(payload.configs);

      writeProfileData('/mock/profiles/custom.json', profile);
      expect(JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1])).configs).toEqual(payload.configs);
    });

    it('T07: extractPersistedProfileExtras extracts only top-level extras and excludes containers/base', () => {
      const raw = {
        models: { 'my-agent': 'p/m' },
        fallback: { 'sdd-init': 'p/fb' },
        configs: { 'sdd-init': { reasoningEffort: 'high' } },
        agent: { 'sdd-init': { model: 'p/m' } },
        'sdd-init': 'legacy/model',
        'my-agent': 'top-level-value',
        description: 'team defaults'
      };
      expect(extractPersistedProfileExtras(raw)).toEqual({
        'my-agent': 'top-level-value',
        description: 'team defaults'
      });
    });

    it('T21: bulk assignment does not modify custom agent models in profile', () => {
      const profile: ProfileData = {
        models: { 'sdd-init': 'old/m', 'my-agent': 'custom/m' },
        fallback: { 'sdd-init': 'old/fb', 'my-agent': 'custom/fb' }
      };
      const res = applyBulkProfilePhaseAssignment(profile, ['sdd-init', 'my-agent'], 'new/m', {
        target: BULK_ASSIGNMENT_TARGET.BOTH,
        mode: BULK_ASSIGNMENT_MODE.OVERWRITE
      });
      expect(res.profile.models).toEqual({ 'sdd-init': 'new/m', 'my-agent': 'custom/m' });
      expect(res.profile.fallback).toEqual({ 'sdd-init': 'new/m', 'my-agent': 'custom/fb' });
    });

    it('T22: activation preserves unmentioned external agents in config', () => {
      const config = {
        agent: {
          'external-agent': { model: 'ext/m', provider: 'other', temperature: 0.7 },
          'sdd-init': { model: 'old/m' }
        }
      };
      const next = applyProfileDataToConfig(config, { models: { 'sdd-init': 'new/model' } });
      expect(next.agent['external-agent']).toEqual(config.agent['external-agent']);
      expect(next.agent['sdd-init'].model).toBe('new/model');
    });

    it('drops invalid agent keys on read and write', () => {
      const raw = {
        models: { '__proto__': 'bad', constructor: 'bad', 'a/b': 'bad', 'a b': 'bad', 'sdd-init': 'gpt-4', 'valid-custom': 'p/c' },
        fallback: { prototype: 'bad', ['a'.repeat(65)]: 'bad', 'sdd-init': 'gpt-3.5', 'valid-fb': 'p/fb' }
      };
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(raw));
      const data = readProfileData('/mock/invalid.json');
      const expected = {
        models: { 'sdd-init': 'gpt-4', 'valid-custom': 'p/c' },
        fallback: { 'sdd-init': 'gpt-3.5', 'valid-fb': 'p/fb' }
      };
      expect(data.models).toEqual(expected.models);
      expect(data.fallback).toEqual(expected.fallback);
      writeProfileData('/mock/invalid.json', data);
      const written = JSON.parse(String(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1]));
      expect(written.models).toEqual(expected.models);
      expect(written.fallback).toEqual(expected.fallback);
    });
  });

  describe('activateProfileFile', () => {
    it('discovers only complete installed definitions and reports unresolved profile agents', async () => {
      const discovery = discoverInstalledAgentDefinitions(
        { agent: { 'sdd-init': { model: 'old/init', file: './agents/init.md' } } },
        { agent: { summary: { model: 'old/summary', description: 'Installed auxiliary' } } },
        { 'sdd-init': 'new/init', summary: 'new/summary', missing: 'new/missing' },
      );

      expect(discovery.models).toEqual({ 'sdd-init': 'new/init', summary: 'new/summary' });
      expect(discovery.missing).toEqual(['missing']);
      expect(discovery.config.agent.summary).toEqual({ model: 'old/summary', description: 'Installed auxiliary' });
      expect(discovery.config.agent.missing).toBeUndefined();

      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => String(filePath) === '/mock/profiles/team.json'
        ? JSON.stringify({ models: { 'sdd-init': 'new/init', summary: 'new/summary', missing: 'new/missing' } })
        : JSON.stringify({ agent: { 'sdd-init': { model: 'old/init', file: './agents/init.md' } } }));
      const update = vi.fn().mockResolvedValue({ data: {} });
      const toast = vi.fn();
      const api = {
        state: { provider: [] },
        ui: { toast },
        client: { global: { config: { get: vi.fn().mockResolvedValue({ data: { agent: { summary: { model: 'old/summary', description: 'Installed auxiliary' } } } }), update } } },
      } as any;

      const result = await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      expect(result?.agent['sdd-init']).toEqual({ model: 'new/init', file: './agents/init.md' });
      expect(result?.agent.summary).toEqual({ model: 'new/summary', description: 'Installed auxiliary' });
      expect(result?.agent.missing).toBeUndefined();
      expect(toast).toHaveBeenCalledWith({ title: 'Activation Warning', message: 'Missing agent definitions: missing', variant: 'warning' });
    });

    it('eagerly migrates profile files on updated runtime policy at startup', () => {
      const writes: string[] = [];
      vi.mocked(fs.readdirSync).mockReturnValue(['team.json'] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: {
              'sdd-orchestrator': 'legacy/model',
              'sdd-init': 'phase/model',
            },
          });
        }
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push(String(content));
        return undefined as any;
      });

      const migrated = migrateProfilesForRuntimePolicy(getOrchestratorPolicy(['gentle-orchestrator', 'sdd-init']));

      expect(migrated).toEqual(['team.json']);
      expect(writes).toHaveLength(1);
      const persisted = JSON.parse(writes[0]!);
      expect(persisted.models['gentle-orchestrator']).toBe('legacy/model');
      expect(persisted.models['sdd-orchestrator']).toBeUndefined();
    });

    it('does not migrate profile files when runtime policy is legacy', () => {
      vi.mocked(fs.readdirSync).mockReturnValue(['team.json'] as any);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        models: {
          'sdd-orchestrator': 'legacy/model',
          'sdd-init': 'phase/model',
        },
      }));

      const migrated = migrateProfilesForRuntimePolicy(getOrchestratorPolicy(['sdd-orchestrator', 'sdd-init']));

      expect(migrated).toEqual([]);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('detects migrated profile as active after eager startup migration', () => {
      let profileRaw = JSON.stringify({
        models: {
          'sdd-orchestrator': 'legacy/model',
          'sdd-init': 'phase/model',
        },
      });
      vi.mocked(fs.readdirSync).mockReturnValue(['team.json'] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath) === '/mock/profiles/team.json') return profileRaw;
        return '{}';
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_filePath: any, content: any) => {
        profileRaw = String(content);
        return undefined as any;
      });

      migrateProfilesForRuntimePolicy(getOrchestratorPolicy(['gentle-orchestrator', 'sdd-init']));

      const api = {
        state: {
          config: {
            default_agent: 'gentle-orchestrator',
            agent: {
              'gentle-orchestrator': { model: 'legacy/model' },
              'sdd-init': { model: 'phase/model' },
            },
          },
        },
      } as any;

      expect(detectActiveProfileFile(['team.json'], api)).toBe('team.json');
    });

    it('matches legacy active profile during list detection without creating updated key side effects', () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath) === '/mock/profiles/legacy.json') {
          return JSON.stringify({ models: { 'sdd-orchestrator': 'legacy/model', 'sdd-init': 'phase/model' } });
        }
        return '{}';
      });

      const api = {
        state: {
          config: {
            default_agent: 'sdd-orchestrator',
            agent: {
              'sdd-orchestrator': { model: 'legacy/model' },
              'sdd-init': { model: 'phase/model' },
            },
          },
        },
      } as any;

      const active = detectActiveProfileFile(['legacy.json'], api);

      expect(active).toBe('legacy.json');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('marks profile active when profile primaries are a subset of active config models', () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath) === '/mock/profiles/subset.json') {
          return JSON.stringify({ models: { 'sdd-init': 'phase/model' } });
        }
        return '{}';
      });

      const api = {
        state: {
          config: {
            default_agent: 'sdd-orchestrator',
            agent: {
              'sdd-orchestrator': { model: 'runtime/model' },
              'sdd-init': { model: 'phase/model' },
              'sdd-apply': { model: 'extra/model' },
            },
          },
        },
      } as any;

      expect(detectActiveProfileFile(['subset.json'], api)).toBe('subset.json');
    });

    it('does not require exact key-count equality when all declared profile primaries match', () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({ models: { 'sdd-orchestrator': 'runtime/model', 'sdd-init': 'phase/model' } });
        }
        return '{}';
      });

      const api = {
        state: {
          config: {
            default_agent: 'sdd-orchestrator',
            agent: {
              'sdd-orchestrator': { model: 'runtime/model' },
              'sdd-init': { model: 'phase/model' },
              'sdd-apply': { model: 'apply/model' },
              'sdd-plan': { model: 'plan/model' },
            },
          },
        },
      } as any;

      expect(detectActiveProfileFile(['team.json'], api)).toBe('team.json');
    });

    it('uses fallback model comparison as tie-breaker when primaries match multiple profiles', () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath) === '/mock/profiles/alpha.json') {
          return JSON.stringify({
            models: { 'sdd-init': 'phase/model' },
            fallback: { 'sdd-init': 'fallback/a' },
          });
        }
        if (toPosix(filePath) === '/mock/profiles/beta.json') {
          return JSON.stringify({
            models: { 'sdd-init': 'phase/model' },
            fallback: { 'sdd-init': 'fallback/b' },
          });
        }
        return '{}';
      });

      const api = {
        state: {
          config: {
            default_agent: 'sdd-orchestrator',
            agent: {
              'sdd-orchestrator': { model: 'runtime/model' },
              'sdd-init': { model: 'phase/model' },
              'sdd-init-fallback': { model: 'fallback/b' },
            },
          },
        },
      } as any;

      expect(detectActiveProfileFile(['alpha.json', 'beta.json'], api)).toBe('beta.json');
    });

    it('returns undefined when tie remains unresolved after fallback comparison', () => {
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (toPosix(filePath) === '/mock/profiles/alpha.json') {
          return JSON.stringify({
            models: { 'sdd-init': 'phase/model' },
            fallback: { 'sdd-init': 'fallback/shared' },
          });
        }
        if (toPosix(filePath) === '/mock/profiles/beta.json') {
          return JSON.stringify({
            models: { 'sdd-init': 'phase/model' },
            fallback: { 'sdd-init': 'fallback/shared' },
          });
        }
        return '{}';
      });

      const api = {
        state: {
          config: {
            default_agent: 'sdd-orchestrator',
            agent: {
              'sdd-orchestrator': { model: 'runtime/model' },
              'sdd-init': { model: 'phase/model' },
              'sdd-init-fallback': { model: 'fallback/shared' },
            },
          },
        },
      } as any;

      expect(detectActiveProfileFile(['alpha.json', 'beta.json'], api)).toBeUndefined();
    });

    it('keeps sdd-orchestrator during activation in legacy runtime and does not create gentle-orchestrator', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: {
              'sdd-orchestrator': 'legacy/model',
              'sdd-init': 'phase/model',
            },
          });
        }

        return JSON.stringify({
          default_agent: 'sdd-orchestrator',
          agent: {
            'sdd-orchestrator': { model: 'legacy/old' },
            'sdd-init': { model: 'phase/old' },
          },
        });
      });

      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        ui: { toast: vi.fn() },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      const payload = update.mock.calls[0]?.[0]?.config;
      expect(payload.agent['sdd-orchestrator']?.model).toBe('legacy/model');
      expect(payload.agent['gentle-orchestrator']).toBeUndefined();
    });

    it('preserves canonical gentle-orchestrator across bulk update then activation in updated runtime', async () => {
      const writes: Array<{ filePath: string; content: string }> = [];
      const bulkOperation = {
        target: BULK_ASSIGNMENT_TARGET.BOTH,
        mode: BULK_ASSIGNMENT_MODE.FILL_ONLY,
      } as const;
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readdirSync).mockReturnValue([] as any);
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: {
              'sdd-orchestrator': 'legacy/model',
              'sdd-init': '',
            },
            fallback: {},
          });
        }

        return JSON.stringify({
          default_agent: 'gentle-orchestrator',
          agent: {
            'gentle-orchestrator': { model: 'runtime/old' },
            'sdd-init': { model: 'phase/old' },
          },
        });
      });
      vi.mocked(fs.writeFileSync).mockImplementation((filePath: any, content: any) => {
        writes.push({ filePath: String(filePath), content: String(content) });
      });

      const updatedPolicy = getOrchestratorPolicy(['gentle-orchestrator', 'sdd-init']);
      updateProfileWithBulkPhaseAssignment(
        '/mock/profiles/team.json',
        ['sdd-init'],
        'provider/model',
        bulkOperation,
        updatedPolicy as any,
      );

      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        ui: { toast: vi.fn() },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      const profileWrite = writes.find((write) => /^\/mock\/profiles\/team\.json\.tmp-[0-9a-f]{8}$/.test(write.filePath));
      expect(profileWrite).toBeDefined();
      const persistedProfile = JSON.parse(profileWrite!.content);
      expect(persistedProfile.models['gentle-orchestrator']).toBe('legacy/model');
      expect(persistedProfile.models['sdd-orchestrator']).toBeUndefined();

      const payload = update.mock.calls[0]?.[0]?.config;
      expect(payload.agent['gentle-orchestrator']?.model).toBe('legacy/model');
      expect(payload.agent['sdd-orchestrator']).toBeUndefined();
    });

    it('returns null and shows toast when on-disk global config JSON is invalid', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({ models: { 'sdd-init': 'gpt-4' } });
        }

        return '{invalid global config json';
      });

      const toast = vi.fn();
      const api = {
        ui: { toast },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update: vi.fn(),
            },
          },
        },
      } as any;

      const result = await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      expect(result).toBeNull();
      expect(api.client.global.config.update).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Activation Failed',
        variant: 'error',
      }));
    });

    it('activates profiles when on-disk global config has a leading UTF-8 BOM', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({ models: { 'sdd-init': 'gpt-4' } });
        }

        return `\uFEFF${JSON.stringify({
          agent: { 'sdd-init': { model: 'old/model' } },
        })}`;
      });

      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        ui: { toast: vi.fn() },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      const result = await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      expect(result?.agent['sdd-init']?.model).toBe('gpt-4');
      expect(update).toHaveBeenCalledWith({
        config: expect.objectContaining({
          agent: expect.objectContaining({
            'sdd-init': expect.objectContaining({ model: 'gpt-4' }),
          }),
        }),
      });
    });

    it('activates profiles when the profile JSON has a leading UTF-8 BOM', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return `\uFEFF${JSON.stringify({ models: { 'sdd-init': 'gpt-4' } })}`;
        }

        return JSON.stringify({
          agent: { 'sdd-init': { model: 'old/model' } },
        });
      });

      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        ui: { toast: vi.fn() },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      const result = await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      expect(result?.agent['sdd-init']?.model).toBe('gpt-4');
      expect(update).toHaveBeenCalledWith({
        config: expect.objectContaining({
          agent: expect.objectContaining({
            'sdd-init': expect.objectContaining({ model: 'gpt-4' }),
          }),
        }),
      });
    });

    it('shows sanitized config validation details when config update fails', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({ models: { 'sdd-init': 'gpt-4' } });
        }

        return JSON.stringify({
          theme: 'gentleman-kanagawa',
          agent: { 'sdd-init': { model: 'old/model' } },
          secretToken: 'do-not-show',
        });
      });

      const toast = vi.fn();
      const api = {
        state: { provider: [] },
        ui: { toast },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update: vi.fn().mockResolvedValue({
                error: {
                  name: 'ConfigInvalidError',
                  path: '~/.config/opencode/opencode.json',
                  issues: [
                    {
                      message: 'Unrecognized key: theme',
                      keys: ['theme'],
                      path: [],
                    },
                  ],
                },
              }),
            },
          },
        },
      } as any;

      const result = await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      expect(result).toBeNull();
      const message = toast.mock.calls[0]?.[0]?.message;
      expect(message).toContain('Failed to update global runtime configuration');
      expect(message).toContain('ConfigInvalidError');
      expect(message).toContain('~/.config/opencode/opencode.json');
      expect(message).toContain('Unrecognized key: theme');
      expect(message).toContain('keys: theme');
      expect(message).toContain('path: <root>');
      expect(message).not.toContain('secretToken');
      expect(message).not.toContain('do-not-show');
    });

    it('falls back to a generic config update error when no safe details are available', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({ models: { 'sdd-init': 'gpt-4' } });
        }

        return JSON.stringify({
          agent: { 'sdd-init': { model: 'old/model' } },
        });
      });

      const toast = vi.fn();
      const api = {
        state: { provider: [] },
        ui: { toast },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update: vi.fn().mockResolvedValue({
                error: {
                  config: { secretToken: 'do-not-show' },
                },
              }),
            },
          },
        },
      } as any;

      const result = await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      expect(result).toBeNull();
      expect(toast).toHaveBeenCalledWith({
        title: 'Activation Failed',
        message: 'Failed to update global runtime configuration',
        variant: 'error',
      });
    });

    it('applies valid primary reasoning effort and warns for stale saved values', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: { 'sdd-init': 'openai/gpt-5', 'sdd-apply': 'openai/gpt-5' },
            configs: {
              'sdd-init': { reasoningEffort: 'high' },
              'sdd-apply': { reasoningEffort: 'medium' },
              'sdd-init-fallback': { reasoningEffort: 'low' }
            }
          });
        }

        return JSON.stringify({
          default_agent: 'sdd-orchestrator',
          agent: {
            'sdd-orchestrator': { model: 'runtime/orch' },
            'sdd-init': { model: 'openai/gpt-5' },
            'sdd-apply': { model: 'openai/gpt-5' },
          },
        });
      });

      const toast = vi.fn();
      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        state: {
          provider: [
            {
              id: 'openai',
              models: {
                'gpt-5': {
                  capabilities: { reasoning: true },
                  variants: {
                    low: { reasoningEffort: 'low' },
                    high: { reasoningEffort: 'high' },
                  },
                },
              },
            },
          ],
        },
        ui: { toast },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      const payload = update.mock.calls[0]?.[0]?.config;
      expect(payload.agent['sdd-init']?.reasoningEffort).toBe('high');
      expect(payload.agent['sdd-apply']?.reasoningEffort).toBeUndefined();
      expect(payload.agent['sdd-init-fallback']?.reasoningEffort).toBeUndefined();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Activation Warning',
        variant: 'warning',
      }));
    });

    it('applies orchestrator reasoning effort for gentle-orchestrator in updated runtime', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: { 'sdd-orchestrator': 'openai/gpt-5' },
            configs: { 'sdd-orchestrator': { reasoningEffort: 'high' } }
          });
        }

        return JSON.stringify({
          default_agent: 'gentle-orchestrator',
          agent: {
            'gentle-orchestrator': { model: 'openai/gpt-5' },
          },
        });
      });

      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        state: {
          provider: [
            {
              id: 'openai',
              models: {
                'gpt-5': {
                  capabilities: { reasoning: true },
                  variants: {
                    low: { reasoningEffort: 'low' },
                    high: { reasoningEffort: 'high' },
                  },
                },
              },
            },
          ],
        },
        ui: { toast: vi.fn() },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      const payload = update.mock.calls[0]?.[0]?.config;
      expect(payload.agent['gentle-orchestrator']?.reasoningEffort).toBe('high');
      expect(payload.agent['sdd-orchestrator']).toBeUndefined();
    });

    it('applies orchestrator reasoning effort for sdd-orchestrator in legacy runtime', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: { 'gentle-orchestrator': 'openai/gpt-5' },
            configs: { 'gentle-orchestrator': { reasoningEffort: 'low' } }
          });
        }

        return JSON.stringify({
          default_agent: 'sdd-orchestrator',
          agent: {
            'sdd-orchestrator': { model: 'openai/gpt-5' },
          },
        });
      });

      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        state: {
          provider: [
            {
              id: 'openai',
              models: {
                'gpt-5': {
                  capabilities: { reasoning: true },
                  variants: {
                    low: { reasoningEffort: 'low' },
                    high: { reasoningEffort: 'high' },
                  },
                },
              },
            },
          ],
        },
        ui: { toast: vi.fn() },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      const payload = update.mock.calls[0]?.[0]?.config;
      expect(payload.agent['sdd-orchestrator']?.reasoningEffort).toBe('low');
      expect(payload.agent['gentle-orchestrator']).toBeUndefined();
    });

    it('warns and skips reasoning apply when runtime metadata is unavailable', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: { 'sdd-init': 'openai/gpt-5' },
            configs: { 'sdd-init': { reasoningEffort: 'high' } }
          });
        }

        return JSON.stringify({
          default_agent: 'sdd-init',
          agent: {
            'sdd-init': { model: 'openai/gpt-5', reasoningEffort: 'low' },
          },
        });
      });

      const toast = vi.fn();
      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        state: { provider: [] },
        ui: { toast },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      const payload = update.mock.calls[0]?.[0]?.config;
      expect(payload.agent['sdd-init']?.reasoningEffort).toBeUndefined();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Activation Warning',
        variant: 'warning',
        message: expect.stringContaining('missing runtime metadata')
      }));
    });

    it('clears stale runtime reasoning effort when saved effort is incompatible with current model', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: { 'sdd-init': 'openai/gpt-5' },
            configs: { 'sdd-init': { reasoningEffort: 'medium' } }
          });
        }

        return JSON.stringify({
          default_agent: 'sdd-init',
          agent: {
            'sdd-init': { model: 'openai/gpt-5', reasoningEffort: 'high' },
          },
        });
      });

      const toast = vi.fn();
      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        state: {
          provider: [
            {
              id: 'openai',
              models: {
                'gpt-5': {
                  capabilities: { reasoning: true },
                  variants: {
                    low: { reasoningEffort: 'low' },
                    high: { reasoningEffort: 'high' },
                  },
                },
              },
            },
          ],
        },
        ui: { toast },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      const payload = update.mock.calls[0]?.[0]?.config;
      expect(payload.agent['sdd-init']?.reasoningEffort).toBeUndefined();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Activation Warning',
        variant: 'warning',
        message: expect.stringContaining('incompatible')
      }));
    });

    it('clears stale runtime reasoning effort when activated profile omits configs', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: { 'sdd-init': 'openai/gpt-5' }
          });
        }

        return JSON.stringify({
          default_agent: 'sdd-init',
          agent: {
            'sdd-init': { model: 'openai/gpt-5', reasoningEffort: 'high', options: { reasoningEffort: 'high' } },
            'sdd-apply': { model: 'openai/gpt-5', reasoningEffort: 'low' },
          },
        });
      });

      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        state: { provider: [] },
        ui: { toast: vi.fn() },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      const payload = update.mock.calls[0]?.[0]?.config;
      expect(payload.agent['sdd-init']?.reasoningEffort).toBeUndefined();
      expect(payload.agent['sdd-init']?.options?.reasoningEffort).toBeUndefined();
      expect(payload.agent['sdd-apply']?.reasoningEffort).toBe('low');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/config/opencode.json',
        JSON.stringify(payload, null, 2)
      );
    });

    it('clears stale nested options reasoning effort when selected model is incompatible', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: { 'gentle-orchestrator': 'openai/gpt-5' },
            configs: { 'gentle-orchestrator': { reasoningEffort: 'medium' } }
          });
        }

        return JSON.stringify({
          default_agent: 'gentle-orchestrator',
          agent: {
            'gentle-orchestrator': {
              model: 'openai/gpt-5',
              reasoningEffort: 'xhigh',
              options: { reasoningEffort: 'xhigh' },
            },
          },
        });
      });

      const toast = vi.fn();
      const update = vi.fn().mockResolvedValue({ data: {} });
      const api = {
        state: {
          provider: [
            {
              id: 'openai',
              models: {
                'gpt-5': {
                  capabilities: { reasoning: true },
                  variants: {
                    low: { reasoningEffort: 'low' },
                    high: { reasoningEffort: 'high' },
                  },
                },
              },
            },
          ],
        },
        ui: { toast },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      const payload = update.mock.calls[0]?.[0]?.config;
      expect(payload.agent['gentle-orchestrator']?.reasoningEffort).toBeUndefined();
      expect(payload.agent['gentle-orchestrator']?.options?.reasoningEffort).toBeUndefined();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Activation Warning',
        variant: 'warning',
        message: expect.stringContaining('incompatible')
      }));
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/mock/config/opencode.json',
        JSON.stringify(payload, null, 2)
      );
    });

    it('returns the cleaned nextConfig even if runtime update data is stale', async () => {
      vi.mocked(fs.existsSync).mockImplementation((filePath: any) => String(filePath) === '/mock/config/opencode.json');
      vi.mocked(fs.readFileSync).mockImplementation((filePath: any) => {
        if (String(filePath) === '/mock/profiles/team.json') {
          return JSON.stringify({
            models: { 'gentle-orchestrator': 'openai/gpt-5' }
          });
        }

        return JSON.stringify({
          default_agent: 'gentle-orchestrator',
          agent: {
            'gentle-orchestrator': {
              model: 'openai/gpt-5',
              reasoningEffort: 'xhigh',
              options: { reasoningEffort: 'xhigh' },
            },
          },
        });
      });

      const update = vi.fn().mockResolvedValue({
        data: {
          agent: {
            'gentle-orchestrator': {
              model: 'openai/gpt-5',
              reasoningEffort: 'xhigh',
              options: { reasoningEffort: 'xhigh' },
            },
          },
        },
      });
      const api = {
        state: { provider: [] },
        ui: { toast: vi.fn() },
        client: {
          global: {
            config: {
              get: vi.fn(),
              update,
            },
          },
        },
      } as any;

      const result = await activateProfileFile(api, '/mock/profiles/team.json', 'team');

      expect(result?.agent['gentle-orchestrator']?.reasoningEffort).toBeUndefined();
      expect(result?.agent['gentle-orchestrator']?.options?.reasoningEffort).toBeUndefined();
    });
  });
});

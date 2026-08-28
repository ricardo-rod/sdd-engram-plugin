# Architecture

Suite de Agentes is deliberately sibling-shaped, lightweight, and SDD-independent.

---

## 1. Module Boundaries

- **`src/core`**: Pure business logic and domain boundaries:
  - Custom agent registry and owned seed-plus-custom catalog (`buildSuiteDeAgentesCatalog`).
  - Seed inventory (`general`, `build`, `plan`, `explore`, `compaction`, `title`, `summary`, `agent-github`) with compatibility normalization kept behind the persistence boundary.
  - Atomic configuration persistence (`suites.json`) with strict schema validation.
  - Runtime model discovery and variant/effort mapping.
  - Markdown agent definition generator (`~/.config/opencode/agent/<agent-id>.md`).
  - Session consent ledger and task dispatch policy.
  - Internal memory agents (`compaction`, `title`, `summary`) and read-only git command allowlist enforcement.
- **`src/server`**: OpenCode plugin lifecycle integration:
  - `chat.message` hook: captures current-turn user consent and produces native `AgentPart` tokens.
  - `tool.execute.before` hook: acts as the sole enforcement authority for `task` execution when `gentle-orchestrator` is the active session agent.
  - `config` hook: applies in-memory task permission hardening (`transformTaskPermission`) to runtime configuration.
- **`src/tui`**: Terminal user interface built with OpenTUI and Solid:
  - `Alt+S` shortcut and `/agent-suite` command registration.
  - Searchable catalog with real-time query filtering, pagination, and continuous cross-page arrow navigation.
  - Read-only agent inspection screens.
  - Interactive provider, model, and effort assignment workflow.
  - Session grant inspection and revocation.
  - Graceful fallback and error isolation.

---

## 2. Trust & Consent Model

The user message event is the authoritative source of consent. OpenCode 1.18.5 delivers the current message ID through `chat.message`, while `tool.execute.before` exposes `sessionID` and `callID`.

- **Ledger Keying**: Consent is tracked per `(sessionID, messageID, agentID)`.
- **Native Part Materialization**: When a canonical grant (`usa también agente: <agent-id>`) is parsed from the active message, the server hook appends a schema-valid native `AgentPart`. This allows OpenCode's `SessionPrompt` to evaluate `bypassAgentCheck` safely for that message.
- **Per-Target Gate Authority**: The server hook verifies the specific target `subagent_type` before TaskTool execution. A bypass for agent A cannot authorize agent B.
- **Fail-Closed Lifecycle**: Grants expire at the end of the turn and are never carried over to subsequent messages. Ambiguous text, static configuration, or UI selections cannot grant execution authority.

### Internal System Allowlist
The internal Gentle-AI orchestrator boundary is hardcoded in `src/core/policy.ts` as an exact allowlist:
- `sdd-init`, `sdd-explore`, `sdd-onboard`, `sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`, `sdd-archive` (and their `-fallback` counterparts).
- `review-readability`, `review-refuter`, `review-reliability`, `review-resilience`, `review-risk` (and their `-fallback` counterparts).
- `jd-fix-agent`, `jd-judge-a`, `jd-judge-b` (and their `-fallback` counterparts).

Authorization checks exact set membership rather than prefix matching; unvetted names (such as `sdd-evil`) remain blocked. `general`, `build`, `plan`, `explore`, `agent-github`, and custom agents always require explicit current-turn consent when dispatched from `gentle-orchestrator`.

---

## 3. Persistence & Materialization

- **Registry JSON**: Configuration is saved to `~/.config/opencode/agent-suite/suites.json`. It stores `version`, `customAgents`, `modelAssignments`, `variantAssignments`, `baseOverrides`, `builtInOverrides`, `disabledAgents`, and `advancedOverrides`. Writes use a temporary file, restrictive permissions (`0600`), and atomic rename.
- **Global Agent Markdown**: Custom agents materialized globally are written to `~/.config/opencode/agent/<agent-id>.md` only after explicit confirmation. Agent IDs must be lowercase kebab-case, and path traversal attempts are rejected.

---

## 4. Configuration Hardening

The `transformTaskPermission()` function generates a hardened policy: `*` is denied, exact internal agents are allowed, and user agents are denied by default.

The server hook injects this policy into the in-memory runtime configuration:
1. Top-level `permission.task` map.
2. `agent["gentle-orchestrator"].permission.task` map (which takes precedence in OpenCode).

Unrelated configuration and permission fields are preserved, and no files on disk are modified during this transformation.

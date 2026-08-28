# Suite de Agentes

[![version](https://img.shields.io/badge/version-1.1.0-blue.svg)](package.json)
[![node](https://img.shields.io/badge/node-%3E%3D24%20%3C25-brightgreen.svg)](package.json)
[![opencode](https://img.shields.io/badge/opencode-%3E%3D1.18.5-blueviolet.svg)](package.json)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Suite de Agentes** (`opencode-agent-suite`) is an independent OpenCode plugin providing a native OpenTUI agent catalog, per-agent AI model and effort assignment, and strict per-turn consent controls for multi-agent workflows.

---

## Why Suite de Agentes?

When running complex AI agent workflows, managing model assignments and maintaining strict security boundaries can be challenging. Suite de Agentes solves these challenges by providing:

- **Centralized Agent Catalog**: A fast, keyboard-driven OpenTUI interface to inspect registered built-in and custom agents, their skills, and operational prompts.
- **Dynamic Model & Effort Assignment**: Change providers, models, and reasoning effort tiers per agent directly from the terminal without manual JSON editing.
- **Strict Security & Per-Turn Consent**: Prevents unauthorized sub-agent execution by enforcing an explicit allowlist for internal orchestrators and requiring per-turn user consent for external or custom agents.
- **Clean Sibling Architecture**: Decoupled from internal orchestrator lifecycles, ensuring lightweight execution and safe fallback.
- **Portable Distribution**: Clean public distribution with zero personal agents hardcoded into the baseline; includes self-contained installation automation for Windows and POSIX.

---

## Visual Tour

Explore the OpenTUI interface directly inside OpenCode:

### 1. Agent Catalog (`Catálogo`)
Browse, search, and navigate across all available seed and custom agents.

![Agent Catalog Overview](docs/images/catalog-overview.png)
*Figure 1: Fast, searchable agent catalog with real-time filtering, pagination, and continuous arrow navigation.*

### 2. Agent Details & Configuration
Inspect agent status, capabilities, and assignment options.

![Agent Details](docs/images/agent-details.png)
*Figure 2: Comprehensive agent details showing membership, operational status, and management actions.*

### 3. Model, Skills, and Prompt Directives
View assigned reasoning models, registered skills, and operation instructions.

![Agent Capabilities & Prompt](docs/images/agent-model-skills.png)
*Figure 3: Detailed view of model configuration, effort level, registered skills, and prompt instructions.*

### 4. Interactive Provider & Model Selection
Assign AI providers and models discovered directly from the active OpenCode runtime.

![AI Provider Selection](docs/images/provider-selection.png)
*Figure 4: Select an active AI provider, model, and effort tier in a few keystrokes.*

---

## Key Features

- **Native OpenTUI Terminal Interface**: Built with Solid and OpenTUI for smooth, zero-latency rendering.
- **Continuous Keyboard Navigation**: Arrow keys (`↑` / `↓`) navigate continuously across page boundaries; `PageUp` / `PageDown` switch pages; `/` jumps straight to search.
- **Runtime Provider Discovery**: Reads available AI models directly from OpenCode runtime state.
- **Isolated Atomic Persistence**: Stores configurations in `~/.config/opencode/agent-suite/suites.json` with restricted permissions (`0600`) and atomic temporary-file replacement.
- **Hardened Task Permissions**: Applies `*` deny policy with exact allowlists for internal orchestration agents (`sdd-*`, `review-*`, `jd-*`).
- **Session Consent Ledger**: Tracks per-turn user authorization grants (`usa también agente: <agent-id>`) that fail closed and never leak across turns.
- **Clean 7 Built-In Public Baseline**: Includes strictly the standard OpenCode built-ins (`build`, `plan`, `general`, `explore`, `compaction`, `title`, `summary`). Specialist agents are opt-in user configurations.

---

## Quick Start & Installation

### Option A: Install from GitHub Release (Recommended)

1. Download `suite-de-agentes-v1.1.0.zip` (Windows) or `suite-de-agentes-v1.1.0.tar.gz` (Linux/macOS) from the [Releases](https://github.com/RamonsDka/suite-de-agentes/releases) page.
2. Extract the archive into any temporary location.
3. Run the portable installer:

**Windows (PowerShell):**
```powershell
Expand-Archive -Path suite-de-agentes-v1.1.0.zip -DestinationPath .\suite-installer
Set-Location -LiteralPath .\suite-installer
.\install.ps1
```

**Linux / macOS (Bash / Sh):**
```sh
tar -xzf suite-de-agentes-v1.1.0.tar.gz
cd suite-de-agentes-v1.1.0
./install.sh
```

The installer will:
- Copy the pre-built release package into `~/.config/opencode/plugins/suite-de-agentes/`
- Install required production runtime dependencies
- Register server plugin in `~/.config/opencode/opencode.json`
- Register TUI plugin in `~/.config/opencode/tui.json`
- Preserve and backup all existing OpenCode configurations

**Installer Options:**
- `--dry-run`: Preview planned file copies and configuration changes without mutating files.
- `--uninstall`: Remove Suite de Agentes plugin entries from OpenCode configuration.
- `--target-dir <path>`: Specify a custom plugin installation directory.
- `--config-dir <path>`: Specify a custom OpenCode configuration directory.

---

### Option B: Build from Source

```sh
# 1. Clone repository
git clone https://github.com/RamonsDka/suite-de-agentes.git
cd suite-de-agentes

# 2. Install dependencies & build
npm ci
npm run build

# 3. Install locally
./install.sh   # On Windows: .\install.ps1
```

---

## Launching Suite de Agentes

After installation, restart OpenCode and open the interface using any of the following:
- Press **`Alt+S`**
- Run **`/agent-suite`** in the chat prompt
- Select **Suite de Agentes** from the command palette

For detailed platform setup, see the [Local Installation Guide](docs/local-install.md).

---

## Keyboard Navigation Reference

| Key | Context | Action |
|---|---|---|
| `Alt+S` | Global | Toggle Suite de Agentes |
| `/agent-suite` | Chat prompt | Open Suite de Agentes |
| `↑` / `↓` (or `←` / `→`) | Catalog | Move selection continuously across pages |
| `PageUp` / `PageDown` | Catalog | Move one page backward / forward |
| `/` | Catalog | Focus search input field |
| `Enter` | Catalog | Open details for the selected agent |
| `g` | Catalog | View active session grants |
| `Esc` | Search focused | Return focus to catalog results |
| `Esc` | Catalog | Close Suite de Agentes |
| `Esc` | Details / Sub-screen | Return to previous view |
| `F10` | Catalog | Quick exit to OpenCode |

For a complete walkthrough of all interface screens and workflows, see the [UI & Interaction Guide](docs/ui-guide.md).

---

## Security & Consent Model

When `gentle-orchestrator` is the active session agent:
1. **Internal Allowlist**: Internal system agents (`sdd-*`, `review-*`, `jd-*`) are permanently authorized to execute tasks.
2. **Explicit User Consent**: External and custom agents require an explicit, current-turn consent line:
   ```text
   usa también agente: <agent-id>
   ```
3. **Fail-Closed Verification**: Grants are bound to the specific `sessionID` and message ID. They do not persist across turns and cannot be granted via static configuration or prompt injection.
4. **Runtime Hardening**: The server `config` hook applies `transformTaskPermission()` to restrict task execution to authorized targets.

For complete architectural details and security boundaries, see [Architecture Documentation](docs/architecture.md).

---

## Documentation Map

- **[UI & Interaction Guide](docs/ui-guide.md)**: Visual walkthrough, screen breakdowns, and interaction patterns.
- **[Local Installation Guide](docs/local-install.md)**: Windows (PowerShell) and POSIX installation steps and configuration examples.
- **[Architecture & Trust Model](docs/architecture.md)**: Deep dive into module boundaries, consent verification, and persistence.
- **[Contributing Guide](CONTRIBUTING.md)**: Issue-first workflow, commit standards, and local development gates.

---

## Development & Packaging

```sh
# Install dependencies
npm ci

# Run test suite
npm test

# Run strict TypeScript checks
npm run typecheck

# Build bundle
npm run build

# Generate deterministic release archives (.zip, .tar.gz, SHA256SUMS.txt)
npm run package
```

---

## License

This project is licensed under the [MIT License](LICENSE).

# Local Installation

Suite de Agentes is designed as a local OpenCode plugin. You can install it using the automated installer or by manually configuring OpenCode.

---

## Automated Installation (Recommended)

Run the included installer script from the root of the extracted release archive or repository:

### Windows (PowerShell)
```powershell
.\install.ps1
```

### Linux / macOS (Bash / Sh)
```sh
./install.sh
```

The installer will:
1. Copy plugin files to `~/.config/opencode/plugins/suite-de-agentes/`
2. Install production dependencies with `npm install --omit=dev`
3. Back up and register the server plugin in `~/.config/opencode/opencode.json`
4. Back up and register the TUI plugin in `~/.config/opencode/tui.json`

**Options:**
- `--dry-run`: Preview planned actions without writing any files.
- `--uninstall`: Remove plugin registrations from OpenCode configuration files.
- `--target-dir <path>`: Custom destination for the plugin files.
- `--config-dir <path>`: Custom directory for OpenCode configuration.

---

## Manual Installation

### 1. Build the Plugin

```sh
npm install
npm run build
```

### 2. Configure OpenCode

Add the server entry to your user configuration in `~/.config/opencode/opencode.json`:

```json
{
  "plugin": [
    "/absolute/path/to/suite-de-agentes/dist/server.js"
  ]
}
```

Add the TUI entry to `~/.config/opencode/tui.json`:

```json
{
  "plugin": [
    "/absolute/path/to/suite-de-agentes/dist/tui.js"
  ]
}
```

*(On Windows, use paths such as `C:/Users/<username>/.config/opencode/plugins/suite-de-agentes/dist/server.js`.)*

---

## Using the TUI

Restart OpenCode after updating configuration.

1. Press **`Alt+S`**, type **`/agent-suite`**, or select **Suite de Agentes** from the command palette.
2. The window opens directly to the searchable **Catálogo de Agentes**.
3. Use arrow keys (`↑` / `↓` / `←` / `→`) to navigate across agents, `PageUp` / `PageDown` to switch pages, or `/` to search.
4. Press `Enter` on any agent to inspect its details or configure AI provider, model, and reasoning effort.
5. For a complete visual walkthrough, see the [UI & Interaction Guide](ui-guide.md).

---

## Runtime Authorization Boundary

After OpenCode loads the plugin, the server `config` hook replaces the in-memory top-level and `agent["gentle-orchestrator"].permission.task` maps with a strict `*`: `deny` policy plus exact allows for configured internal Gentle-AI agents (`sdd-*`, `review-*`, `jd-*`).

External and custom agents require an explicit, current-turn consent grant:

```text
usa también agente: <agent-id>
```

The hook preserves unrelated configuration and permission fields and never modifies user credentials or unrelated global configurations.

# Suite de Agentes — UI & Interaction Guide

This guide provides a detailed visual walkthrough of the **Suite de Agentes** OpenTUI interface in OpenCode.

---

## 1. Opening Suite de Agentes

Suite de Agentes runs directly inside your OpenCode terminal session via OpenTUI. You can open the interface at any time using:

- **Keyboard Shortcut**: Press `Alt+S`
- **Slash Command**: Type `/agent-suite` in the chat prompt and press `Enter`
- **Command Palette**: Select `Suite de Agentes` from the OpenCode command list

The interface launches in a focused overlay directly over your terminal session.

---

## 2. Catalog View (`Catálogo`)

When opened, Suite de Agentes displays the **Catálogo de Agentes**, which lists all available seed and custom agents.

![Agent Catalog Overview](images/catalog-overview.png)
*Figure 1: The Catálogo view with real-time search, pagination, and keyboard navigation.*

### Key Features of the Catalog
- **Search Bar (`Buscar agente`)**: Filter agents instantly by typing in the search box. Press `/` from the list to focus the search bar immediately.
- **Page Information**: Displays current page position and density (for example, `Página 1/2 · 6 filas por página`).
- **Smooth Cursor Navigation**: Use `↑` / `↓` (or `←` / `→`) to move through items. When reaching the top or bottom of a page, cursor movement automatically transitions to the previous or next page.
- **Direct Pagination**: Use `PageUp` or `PageDown` to jump across entire pages.
- **Selection**: Press `Enter` on any highlighted agent to open its **Información del Agente** detail screen.
- **Session Grants**: Press `g` to inspect active current-session grants.
- **Exit**: Press `Esc` or `F10` from the catalog to close Suite de Agentes and return to your OpenCode session.

---

## 3. Agent Details View (`Información del Agente`)

Selecting an agent from the catalog opens its detailed configuration and inspection view.

![Agent Details](images/agent-details.png)
*Figure 2: Agent identification, operational status, and available management actions.*

![Agent Capabilities & Prompt](images/agent-model-skills.png)
*Figure 3: Active AI model, effort level, registered skills, and operation prompt directives.*

### Details Breakdown
- **Identity & Membership**: Displays the canonical agent ID (such as `agent-github` or `general`) and whether it is a built-in `seed` agent or a user `custom` agent.
- **Status**: Indicates whether the agent is materialized and active in the runtime (`disponible` / `no materializado`).
- **Model & Variant**: Displays the currently assigned AI model and effort tier (for example, `default`, `low`, `medium`, `high`).
- **Skills**: Lists all capabilities registered for this agent (e.g., `github-review-orchestration`, `issue-creation`, `branch-pr`, `chained-pr`).
- **Operations & Prompt Directives**: Shows the agent's baseline or custom operational instructions.
- **Actions Menu**:
  - **`Cambiar modelo y esfuerzo`**: Launches the interactive model assignment wizard.
  - **`Gestionar habilidades`**: Inspects assigned skills.
  - **`Gestionar operaciones`**: Inspects operational prompts.
  - **`Volver al catálogo`**: Returns to the catalog list (or press `Esc`).

---

## 4. Model and Effort Assignment Workflow

Suite de Agentes allows configuring the AI provider, model, and reasoning effort for any agent without editing configuration files manually.

![Provider Selection](images/provider-selection.png)
*Figure 4: Selecting an active AI provider from the runtime provider catalog.*

### Step-by-Step Assignment
1. Open the agent's details from the catalog.
2. Select **`Cambiar modelo y esfuerzo`** and press `Enter`.
3. **Select Provider**: Choose from discovered runtime providers (such as Anthropic, OpenAI, Google, etc.).
4. **Select Model**: Choose a model supported by the selected provider.
5. **Select Effort**: Choose an effort/variant level supported by the model.
6. The selection is saved atomically to `~/.config/opencode/agent-suite/suites.json` and applied to the in-memory runtime immediately.

---

## 5. Session Grants Management

Pressing `g` from the catalog opens the **Permisos de Sesión** screen.

- Shows all active grants issued during the current OpenCode session.
- Displays the requester, target agent, grant ID, and scope.
- Highlight any active grant and press `Enter` to revoke it immediately.
- Press `Esc` to return to the catalog.

---

## 6. Keyboard Shortcuts Reference

| Shortcut / Key | Context | Action |
|---|---|---|
| `Alt+S` | Global (OpenCode) | Open or toggle Suite de Agentes |
| `/agent-suite` | Chat prompt | Open Suite de Agentes |
| `↑` / `↓` (or `←` / `→`) | Catalog | Move agent selection (crosses page boundaries automatically) |
| `PageUp` / `PageDown` | Catalog | Move one page backward / forward |
| `/` | Catalog | Focus the search input field |
| `Enter` | Catalog | Open details for the selected agent |
| `g` | Catalog | Open Session Grants screen |
| `Esc` | Search focused | Return focus to catalog results |
| `Esc` | Catalog (unfocused) | Close Suite de Agentes |
| `Esc` | Sub-screen / Dialog | Return to previous view |
| `F10` | Catalog | Quick exit to OpenCode |
| `↑` / `↓` | Menus & Dialogs | Move focus between options |
| `Enter` | Menus & Dialogs | Confirm selection / execute action |

---

## 7. Design & Terminal Compatibility

- **OpenTUI Integration**: Built directly with Solid and OpenTUI primitives for low-latency terminal rendering.
- **Theme Awareness**: Adapts automatically to light, dark, and custom OpenCode themes.
- **Safe Fallback**: If terminal capabilities or layout constraints prevent rendering, Suite de Agentes fails gracefully without crashing the OpenCode server session.

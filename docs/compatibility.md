# Host Compatibility & Graceful Degradation

## Packaged Plugin Assets

After `npm run build`, `node scripts/smoke-plugins.ts` changes to a temporary
directory outside the repository and verifies the packaged Task Manager HTML,
Suite offline help, and both provenance records from `dist/plugins/`.

## Host API Support Matrix

The plugin interacts with the OpenCode TUI host through safe compatibility helpers:

| Host API Capability | Plugin Helper | Behavior when Available | Graceful Fallback |
|---|---|---|---|
| `api.ui.dialog.setSize` | `safeSetDialogSize` | Dynamically sets dialog dimensions (`medium`, `large`, `xlarge`) | No-op; logs warning on exception; host default sizing applies |
| `api.ui.Dialog*` | `safeSlotRender` | Renders Solid-based TUI dialogs | Disables slot if renderer is missing; logs single warning |
| Synchronous host hooks | `safeHostAction` | Executes synchronous host operations safely | Catches error, logs warning, returns provided fallback value |
| Asynchronous host hooks | `safeHostAsyncAction` | Awaits asynchronous host operations safely | Catches error, logs warning, returns provided fallback value |

---

## Degradation Strategies

1. **Older Host Versions**: If the host TUI does not expose `api.ui.dialog.setSize`, `safeSetDialogSize` degrades silently without throwing or disrupting navigation.
2. **Throwing Host Calls**: If `setSize` throws an error, the error is caught, logged to the plugin debug logger, and execution continues cleanly.
3. **Narrow Viewports (<80 columns)**: On constrained terminals, the host TUI clamps dialog dimensions to available terminal columns while `wrapDisplayText` prevents content clipping.

---

## Manual Narrow-Terminal Evidence (<80 cols)

Non-mutating verification record for constrained terminal environments:

### 1. Viewport Width 70 Environment Evidence
- **Observed**: OpenCode host starts and remains stable in a 70-column pane; no crash observed during startup or pane resizing.
- **Automated**: Test suites `T25`–`T31` and `safeSetDialogSize` unit tests prove tier assignment (`xlarge`/`large`/`medium`), safe host degradation guards, dynamic word wrapping, and no-leak reset loops.
- **Not Visually Confirmed**: Visual rendering of the `xlarge` plugin dialog (e.g. `showProfileDetail`) inside the 70-column pane, including scrollability and actionability under host clamp, could not be verified automatically due to Windows Terminal shortcut/input interception during isolated synthetic session testing.

### 2. Pending Manual Human Verification Procedure
To visually confirm `xlarge` dialog behavior on narrow terminals after interactive installation:
1. Launch OpenCode in a terminal window or pane resized to 70 columns (`stty cols 70` or window resize).
2. Trigger the plugin using `Alt + K` (or `/sdd-model`).
3. Select **Manage SDD Profiles** (`showProfileList`, `medium`) and navigate into any profile detail screen (`showProfileDetail`, `xlarge`).
4. Verify that:
   - The host clamps the dialog container within the 70-column viewport without visual overflow.
   - Long agent identifiers and descriptions are readable or scrollable.
   - Pressing `Esc` or selecting `← Back` resets the container cleanly to `medium` without graphical artifacts.

### 3. Automated & Harness Evidence Reference
- **Adaptive Text Wrapping**: Verified by unit test suites `T29`, `T30`, and `T31` in `src/dialogs.test.ts`.
- **Examples Harness**: `npm run examples` exits 0 across all 3 fixture tests.

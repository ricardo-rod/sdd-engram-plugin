# Dialog UX & Sizing Tiers

## Overview

The `opencode-sdd-engram-manage` plugin implements screen-aware, tiered dialog sizing to provide optimal readability for large catalogs, detailed memory observations, and structured confirmation flows while degrading gracefully on constrained terminals.

---

## 23-Dialog Sizing Tier Map (§6)

The table below defines the full runtime tier matrix across all 23 dialog entry points:

| Dialog / Function | Tier | Trigger / Screen | Reset / Return Target |
|---|---|---|---|
| `showProfileDetail` | `xlarge` | Profile detail hub navigation | `showProfileList` (medium) |
| `showMemoryDetail` | `xlarge` | Memory observation selection | `showProjectMemoriesMenu` (large) |
| `showModelPickerForBulkProfilePhases` | `xlarge` | Model picker for bulk phase assignment | `showProviderPickerForBulkProfilePhases` (large) |
| `showModelPickerForAgent` | `xlarge` | Model picker for individual agent/fallback | `showProviderPickerForAgent` (large) |
| `showProfileDetailSubmenuPrimary` | `large` | Primary models submenu | `showProfileDetail` (xlarge) |
| `showProfileDetailSubmenuReasoning` | `large` | Reasoning effort submenu | `showProfileDetail` (xlarge) |
| `showProfileDetailSubmenuFallback` | `large` | Fallback models submenu | `showProfileDetail` (xlarge) |
| `showReasoningEffortPicker` | `large` | Reasoning effort options picker | Submenu origin (`hub` or `reasoning`) |
| `showBulkProfileActions` | `large` | Bulk actions menu | `showProfileDetail` (xlarge) |
| `showProviderPickerForBulkProfilePhases` | `large` | Provider picker for bulk phases | `showBulkProfileActions` (large) |
| `showProfileVersions` | `large` | Version history list | `showProfileDetail` (xlarge) |
| `showProfileVersionPreview` | `large` | Version preview screen | `showProfileVersions` (large) |
| `showProviderPickerForAgent` | `large` | Provider selection for individual agent | Submenu origin (`hub`, `primary`, `fallback`) |
| `showProjectMemoriesMenu` | `large` | Project memory observation list | `showProfilesMenu` (medium) |
| `showProfilesMenu` | `medium` | Main plugin root menu | Root / Close |
| `showProfileList` | `medium` | Saved profile list | `showProfilesMenu` (medium) |
| `showCreateProfile` | `medium` | Create new profile prompt | `showProfilesMenu` (medium) |
| `showRenameProfile` | `medium` | Rename profile prompt | `showProfileDetail` (xlarge) |
| `showDeleteProfile` | `medium` | Delete profile confirm dialog | `showProfileDetail` (xlarge) or `showProfileList` (medium) |
| `showConfirmBulkProfileOverride` | `medium` | Bulk overwrite confirmation dialog | `showBulkProfileActions` (large) |
| `showConfirmRestoreProfileVersion` | `medium` | Version restore confirmation dialog | `showProfileVersionPreview` (large) |
| `handleActivateProfile` | `medium` | Profile activation confirm dialog | Root / Clear |
| `showDeleteMemory` | `medium` | Delete memory confirmation dialog | `showMemoryDetail` (xlarge) or `showProjectMemoriesMenu` (large) |

---

## Reset Lifecycle & State Isolation

Every dialog entry point calls `safeSetDialogSize(api, tier)` immediately before replacing the active dialog.

- **Cross-Tier Transitions**: Transitioning between tiers (`xlarge` hub ↔ `large` submenu ↔ `medium` confirmation) resets the container size explicitly.
- **Back & Cancel Guards**: Every `__back__` selection and `onCancel` handler re-enters a sized screen, preventing size leaks across navigation loops.
- **State Isolation**: Subdialog returns (`returnToProfileDetailTarget`) dynamically route to the caller's origin tier without lingering modal state.

---

## Text Wrapping & Adaptive Layout

- **Memory Detail (xlarge)**: Formatted memory text splits lines via `wrapDisplayText(line, 80)` to leverage wider display width without horizontal clipping.
- **Standard Widths (52-col)**: Narrower submenus wrap text dynamically at 52 columns.
- **Word Preservation**: Unbroken words longer than the column limit are preserved without truncation or artificial ellipsis.

import type { KeyEvent } from "@opencode-ai/plugin/tui";

export function isSubmitKey(key: Pick<KeyEvent, "name">): boolean {
  return key.name === "return" || key.name === "linefeed" || key.name === "kpenter";
}

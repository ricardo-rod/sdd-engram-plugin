import { describe, expect, it } from "vitest";
import { classifyTaskManagerHtml, currentTaskManagerMeta } from "./task-manager-classifier";

describe("Task Manager template classifier", () => {
  it("distinguishes a current managed template from an old recognized version", () => {
    const current = `<script id="tm-state">${JSON.stringify(currentTaskManagerMeta())}</script>`;
    const old = `<script id="tm-state">${JSON.stringify({ ...currentTaskManagerMeta(), templateVersion: "0.9.0" })}</script>`;

    expect(classifyTaskManagerHtml(current)).toBe("current");
    expect(classifyTaskManagerHtml(old)).toBe("old");
  });

  it("blocks files without the stable signature and treats absent files as missing", () => {
    expect(classifyTaskManagerHtml(undefined)).toBe("missing");
    expect(classifyTaskManagerHtml('<script id="tm-state">{"schemaVersion":"1.0"}</script>')).toBe("unrecognized");
  });

  it("recognizes an earlier host plugin version as an old managed template", () => {
    const earlierPlugin = `<script id="tm-state">${JSON.stringify({ ...currentTaskManagerMeta(), pluginVersion: "1.6.0" })}</script>`;

    expect(classifyTaskManagerHtml(earlierPlugin)).toBe("old");
  });

  it("blocks a signed state that omits a required plugin version", () => {
    const incompleteVersionState = { ...currentTaskManagerMeta() } as Record<string, unknown>;
    delete incompleteVersionState.pluginVersion;

    expect(classifyTaskManagerHtml(`<script id="tm-state">${JSON.stringify(incompleteVersionState)}</script>`)).toBe("unrecognized");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildTaskManagerConsentNotice,
  createTaskManagerConsentStore,
  resolveTaskManagerRoot,
} from "./task-manager-root";

describe("Task Manager root and consent", () => {
  it("prefers a canonical Git root over a nested manifest directory without confirmation", () => {
    const identity = resolveTaskManagerRoot({
      cwd: "C:\\work\\app\\packages\\web",
      gitRoot: "C:\\work\\app",
      manifestRoot: "C:\\work\\app\\packages\\web",
    });

    expect(identity).toEqual({
      root: "C:/work/app",
      canonicalRoot: "C:/work/app",
      key: "c:/work/app",
      confirmed: true,
    });
  });

  it("requires explicit confirmation for an unmarked directory and keys consent by canonical identity", async () => {
    const identity = resolveTaskManagerRoot({ cwd: "C:\\work\\scratch\\..\\scratch" });
    const consent = createTaskManagerConsentStore();

    expect(identity.confirmed).toBe(false);
    expect(buildTaskManagerConsentNotice(identity)).toContain("C:/work/scratch");
    expect(buildTaskManagerConsentNotice(identity)).toContain("actualización asíncrona");
    expect(await consent.get(identity)).toBeUndefined();

    await consent.accept({ ...identity, confirmed: true });

    expect(await consent.get({ ...identity, root: "C:/work/scratch/", canonicalRoot: "C:/work/scratch", confirmed: true })).toEqual({ consent: true, enabled: true });
  });

  it("discloses consent, background enrichment, and the browser path before activation", () => {
    const identity = resolveTaskManagerRoot({ cwd: "C:\\work\\scratch" });

    expect(buildTaskManagerConsentNotice(identity)).toContain("consentimiento");
    expect(buildTaskManagerConsentNotice(identity)).toContain("actualización asíncrona");
    expect(buildTaskManagerConsentNotice(identity)).toContain("navegador");
  });
});

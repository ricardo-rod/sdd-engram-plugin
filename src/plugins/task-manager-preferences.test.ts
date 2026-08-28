import { describe, expect, it } from "vitest";
import { createTaskManagerConsentStore } from "./task-manager-root";
import { deleteManagedTaskManagerFile, openTaskManagerResult } from "./task-manager-coordinator";

describe("Task Manager opt-out, deletion, and browser fallback", () => {
  it("makes opt-out reversible without deleting the existing HTML", async () => {
    const preferences = createTaskManagerConsentStore();
    const project = { key: "c:/work/app" };
    await preferences.accept(project);
    await preferences.optOut(project);
    expect(await preferences.get(project)).toEqual({ consent: true, enabled: false });
    await preferences.accept(project);
    expect(await preferences.get(project)).toEqual({ consent: true, enabled: true });
  });

  it("deletes only confirmed managed HTML and gives a Spanish path for headless browsers", () => {
    expect(deleteManagedTaskManagerFile({ confirmed: false, classification: "current", path: "C:/work/app/Task-Manager-Portable.html" })).toEqual({ deleted: false, message: "Confirma la ruta y la pérdida de datos antes de eliminar." });
    expect(deleteManagedTaskManagerFile({ confirmed: true, classification: "unrecognized", path: "C:/work/app/Task-Manager-Portable.html" })).toEqual({ deleted: false, message: "El archivo no es un Task Manager gestionado." });
    expect(openTaskManagerResult("C:/work/app/Task-Manager-Portable.html", false)).toEqual({ opened: false, method: "none", path: "C:/work/app/Task-Manager-Portable.html", error: "No se pudo abrir el navegador. Abre esta ruta manualmente." });
  });

  it("refuses to delete a different file even when a caller mislabels it as managed", () => {
    const deleted: string[] = [];

    expect(deleteManagedTaskManagerFile({
      confirmed: true,
      classification: "current",
      path: "C:/work/app/notes.md",
      unlink: (file) => deleted.push(file),
    })).toEqual({ deleted: false, message: "La ruta no corresponde al archivo Task Manager gestionado." });
    expect(deleted).toEqual([]);
  });
});

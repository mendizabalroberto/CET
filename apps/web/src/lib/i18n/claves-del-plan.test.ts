/**
 * Las claves que la segunda ronda del plan de estudio necesita en los dos
 * diccionarios. © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `en.ts` es la fuente del tipo `Dictionary`, así que el tipado ya garantiza
 * la paridad entre idiomas. Lo que el tipado NO garantiza es que una clave
 * exista: este test es la lista de las que la pantalla del plan, el login y el
 * panel del tutor van a leer. Si falta una, la interfaz enseñaría `undefined`.
 */
import { describe, expect, it } from "vitest";

import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";

function leer(raiz: unknown, ruta: string): unknown {
  return ruta.split(".").reduce<unknown>((nodo, parte) => {
    if (nodo === null || typeof nodo !== "object") return undefined;
    return (nodo as Record<string, unknown>)[parte];
  }, raiz);
}

const CLAVES = [
  "tutor.child.plan.success.planBoletinExtraido",
  "tutor.child.plan.success.planBoletinConfirmado",
  "tutor.child.plan.success.planPropuesto",
  "tutor.child.plan.success.planCreado",
  "tutor.child.plan.success.planCancelado",
  "tutor.child.plan.success.boletinDescartado",
  "tutor.child.plan.success.planGenerado",
  "tutor.child.plan.success.planEditado",
  "tutor.child.plan.retryButton",
  "tutor.child.plan.intro",
  "tutor.child.plan.uploadButton",
  "tutor.child.plan.uploadAnotherTitle",
  "tutor.child.plan.analyzingTitle",
  "tutor.child.plan.analyzingHelp",
  "tutor.child.plan.gradesSave",
  "tutor.child.plan.weightsSum",
  "tutor.child.plan.editButton",
  "tutor.child.plan.editSave",
  "tutor.child.plan.editCancel",
  "tutor.child.plan.regenerateButton",
  "tutor.child.plan.regenerating",
  "tutor.child.plan.deleteTitle",
  "tutor.child.plan.deleteBody",
  "tutor.child.plan.deleteButton",
  "tutor.child.plan.deleteConfirm",
  "tutor.child.plan.deleteKeep",
  "tutor.child.plan.deleting",
  "tutor.child.plan.noPlanBody",
  "tutor.child.plan.analyzingRobotLabel",
  "tutor.child.plan.analyzingHint",
  "tutor.child.plan.lastReportTitle",
  "tutor.child.plan.lastReportLine",
  "tutor.child.plan.commentLabel",
  "tutor.child.plan.commentPlaceholder",
  "tutor.child.plan.commentHelp",
  "tutor.child.plan.newPlanButton",
  "tutor.child.plan.uploadNewButton",
  "tutor.child.plan.uploadNewHelp",
  "tutor.child.plan.choosePdf",
  "tutor.child.plan.noFileChosen",
  "tutor.child.plan.prioritiesTitle",
  "tutor.child.plan.prioritiesNote",
  "tutor.child.plan.prioritiesRead",
  "tutor.child.plan.prioritiesPractice",
  "tutor.child.plan.examsTitle",
  "tutor.child.plan.examsIntro",
  "tutor.child.plan.examsEmpty",
  "tutor.child.plan.examsGeneral",
  "tutor.child.plan.examsFromDocument",
  "tutor.child.plan.examsDelete",
  "tutor.child.plan.examsDate",
  "tutor.child.plan.examsSubject",
  "tutor.child.plan.examsNote",
  "tutor.child.plan.examsNotePlaceholder",
  "tutor.child.plan.examsAdd",
  "tutor.child.plan.examsAdding",
  "tutor.child.plan.examsUploadButton",
  "tutor.child.plan.examsUploadHelp",
  "tutor.child.plan.examsUploadSubmit",
  "tutor.child.plan.examsAnalyzing",
  "tutor.child.plan.subjects.math",
  "tutor.child.plan.success.examenAnadido",
  "tutor.child.plan.success.examenBorrado",
  "tutor.child.plan.success.examenesLeidos",
  "tutor.errors.examenInvalido",
  "tutor.errors.examenPasado",
  "tutor.errors.examenRepetido",
  "tutor.errors.examenesNoLeidos",
  "tutor.errors.examenesTodosPasados",
  "tutor.child.plan.weekTitle",
  "tutor.child.plan.weekPrevious",
  "tutor.child.plan.weekNext",
  "tutor.child.plan.weekOf",
  "tutor.child.plan.weekFree",
  "tutor.child.plan.weekOutside",
  "tutor.child.plan.weekLesson",
  "tutor.child.plan.weekPractice",
  "tutor.child.plan.weekStudied",
  "tutor.child.plan.weekDone",
  "tutor.child.plan.activeMinutesShort",
  "tutor.child.plan.cancelTitle",
  "tutor.child.plan.cancelBody",
  "tutor.child.plan.cancelButton",
  "tutor.child.plan.cancelConfirm",
  "tutor.child.plan.cancelKeep",
  "tutor.child.plan.cancelling",
  "tutor.child.plan.discardButton",
  "tutor.child.plan.discarding",
  "tutor.child.plan.discardHelp",
  "tutor.child.plan.historyTitle",
  "tutor.child.plan.historyEmpty",
  "tutor.child.plan.historyLine",
  "tutor.child.plan.historyCurrent",
  "tutor.child.plan.historyTermUnknown",
  "tutor.child.plan.calendarTitle",
  "tutor.child.plan.calendarEmpty",
  "tutor.child.plan.calendarRange",
  "tutor.child.plan.calendarDay",
  "tutor.child.plan.calendarTypes.feriado",
  "tutor.child.plan.calendarTypes.sin_clases",
  "tutor.child.plan.calendarTypes.examenes_finales",
  "tutor.child.plan.calendarTypes.vacaciones",
  "tutor.child.plan.calendarTypes.fin_trimestre",
  "tutor.child.plan.calendarTypes.hito_cambridge",
  "tutor.errors.planNoActivo",
  "tutor.errors.planBoletinConfirmadoNoSeDescarta",
  "auth.chooseRole.staff",
  "auth.chooseRole.staffHint",
  "auth.sesionCaducada.title",
  "auth.sesionCaducada.body",
  "auth.sesionCaducada.button",
] as const;

describe("claves de la segunda ronda del plan", () => {
  for (const clave of CLAVES) {
    it(`${clave} existe en es y en en, con texto`, () => {
      const valorEs = leer(es, clave);
      const valorEn = leer(en, clave);
      expect(typeof valorEs, `es: ${clave}`).toBe("string");
      expect(typeof valorEn, `en: ${clave}`).toBe("string");
      expect((valorEs as string).trim().length).toBeGreaterThan(0);
      expect((valorEn as string).trim().length).toBeGreaterThan(0);
    });
  }

  it("el login ya no presenta la entrada del personal como solo de profesores", () => {
    expect(String(leer(es, "auth.chooseRole.staff"))).toMatch(/familia/i);
    expect(String(leer(en, "auth.chooseRole.staff"))).toMatch(/parent/i);
  });

  it("los acuses con nombre interpolan {name}", () => {
    for (const idioma of [es, en]) {
      expect(String(leer(idioma, "tutor.child.plan.success.planCreado"))).toContain("{name}");
      expect(String(leer(idioma, "tutor.child.plan.success.planCancelado"))).toContain("{name}");
      expect(String(leer(idioma, "tutor.child.plan.cancelBody"))).toContain("{name}");
    }
  });
});

import { resolveI18n, type I18nText, type Locale } from "@cet/shared";

/**
 * De filas de `plan_tareas` a tarjetas de hoy.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Función pura: recibe filas desconocidas, valida y descarta las que no se
 * pueden presentar, resuelve los nombres al idioma y construye el destino.
 * El orden de `ord` se respeta: la salida queda ordenada como el plan.
 */

export interface TareaDeHoy {
  readonly id: string;
  readonly ord: number;
  readonly subjectCode: string;
  readonly href: string;
  readonly tipo: "leccion" | "practica";
  readonly minutos: number | null;
  readonly titulo: string;
}

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0;
}

function esI18n(valor: unknown): valor is I18nText {
  if (!esRegistro(valor)) return false;
  return esTexto(valor.en) && esTexto(valor.es);
}

function relacionUnica(valor: unknown): Record<string, unknown> | null {
  if (Array.isArray(valor)) {
    if (valor.length !== 1) return null;
    const [unica] = valor;
    return esRegistro(unica) ? unica : null;
  }
  return esRegistro(valor) ? valor : null;
}

function aTarea(fila: unknown, locale: Locale): TareaDeHoy | null {
  if (!esRegistro(fila)) return null;

  const { id, ord, tipo, minutos, subjects, lessons, skills } = fila;
  if (!esTexto(id)) return null;
  if (typeof ord !== "number" || !Number.isFinite(ord)) return null;
  if (tipo !== "leccion" && tipo !== "practica") return null;

  const materia = relacionUnica(subjects);
  if (materia === null) return null;
  const { code: subjectCode } = materia;
  if (!esTexto(subjectCode)) return null;

  let duracion: number | null = null;
  if (minutos !== null && minutos !== undefined) {
    if (typeof minutos !== "number" || !Number.isFinite(minutos)) return null;
    duracion = minutos;
  }

  if (tipo === "leccion") {
    const { lesson_id } = fila;
    const leccion = relacionUnica(lessons);
    if (!esTexto(lesson_id) || leccion === null) return null;
    const { title } = leccion;
    if (!esI18n(title)) return null;
    return {
      id,
      ord,
      tipo,
      minutos: duracion,
      subjectCode,
      href: `/learn/${lesson_id}`,
      titulo: resolveI18n(title, locale),
    };
  }

  const habilidad = relacionUnica(skills);
  if (habilidad === null) return null;
  const { code: skillCode, name: skillName } = habilidad;
  if (!esTexto(skillCode) || !esI18n(skillName)) return null;
  return {
    id,
    ord,
    tipo,
    minutos: duracion,
    subjectCode,
    href: `/practice/${skillCode}`,
    titulo: resolveI18n(skillName, locale),
  };
}

export function presentarTareas(filas: readonly unknown[], locale: Locale): TareaDeHoy[] {
  const tareas: TareaDeHoy[] = [];
  for (const fila of filas) {
    const tarea = aTarea(fila, locale);
    if (tarea !== null) tareas.push(tarea);
  }
  tareas.sort((a, b) => a.ord - b.ord);
  return tareas;
}

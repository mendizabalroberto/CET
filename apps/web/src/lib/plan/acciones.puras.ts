/**
 * Parte pura de las acciones del plan de estudio.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Sin base ni red: las Server Actions de `acciones.ts` las usan y
 * `acciones.test.ts` las prueba. Viven en un fichero aparte porque
 * `acciones.ts` es un fichero "use server" y en el solo caben acciones async.
 */
import type { EventoCalendario } from "@cet/engine";

import { bandaDeNota } from "./boletin";
import type { NotaGuardada } from "./consultas";
import { sumarDias } from "./fecha";
import { MATERIAS_CON_CONTENIDO, type CodigoMateria } from "./tipos";

const CODIGOS_DE_MATERIA = new Set<string>(MATERIAS_CON_CONTENIDO);

/**
 * El hito de la ventana: la proxima fecha de `examenes_finales` o de
 * `hito_cambridge` posterior a `hoy`. Si no hay, la ventana se estira a
 * `hoy + 70 días`.
 */
export function hitoMasCercano(
  calendario: readonly EventoCalendario[],
  hoy: string,
): { hasta: string; hito: string } {
  const candidatos = calendario
    .filter(
      (evento) =>
        evento.desde > hoy &&
        (evento.tipo === "examenes_finales" || evento.tipo === "hito_cambridge"),
    )
    .sort((a, b) => a.desde.localeCompare(b.desde));

  const elegido = candidatos[0];
  if (elegido === undefined) return { hasta: sumarDias(hoy, 70), hito: "" };
  return { hasta: elegido.desde, hito: elegido.tipo };
}

/**
 * Rehace las notas del boletin con las correcciones del tutor. Cada fila
 * llega en el FormData como `nota:<indice>`; si alguna no es un entero
 * 0..100 devuelve null y la accion no toca la base.
 */
export function leerNotasCorregidas(
  fd: FormData,
  notasActuales: readonly NotaGuardada[],
): NotaGuardada[] | null {
  const corregidas: NotaGuardada[] = [];
  for (let indice = 0; indice < notasActuales.length; indice += 1) {
    const actual = notasActuales[indice];
    if (actual === undefined) return null;
    const valor = fd.get(`nota:${indice}`);
    const nota = typeof valor === "string" ? Number(valor) : Number.NaN;
    if (!Number.isInteger(nota) || nota < 0 || nota > 100) return null;
    corregidas.push({
      materia: actual.materia,
      code: actual.code,
      subject_id: actual.subject_id,
      nota,
      banda: bandaDeNota(nota),
    });
  }
  return corregidas;
}

/**
 * Valida el JSON de pesos que manda la UI en `fijarPlan`: solo materias con
 * contenido publicado, pesos positivos y suma 1 ± 0,01.
 */
export function leerPesos(texto: string): Partial<Record<CodigoMateria, number>> | null {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto) as unknown;
  } catch {
    return null;
  }
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return null;

  const pesos: Partial<Record<CodigoMateria, number>> = {};
  let suma = 0;
  for (const [clave, valor] of Object.entries(crudo as Record<string, unknown>)) {
    if (!CODIGOS_DE_MATERIA.has(clave)) return null;
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return null;
    pesos[clave as CodigoMateria] = valor;
    suma += valor;
  }
  if (Math.abs(suma - 1) > 0.01) return null;
  return pesos;
}

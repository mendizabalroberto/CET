/**
 * Materia: Social Studies (Year 6 Social Studies Exam Trainer).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Estructura gemela de ICT (ver `topic-keyed.ts`). Es el trainer con más
 * material interactivo de los seis: tres laboratorios completos (montañas,
 * mapas, ríos) que este pipeline NO puede convertir en contenido estático y que
 * se declaran explícitamente como huecos.
 */

import { extractTopicKeyed } from "./topic-keyed.ts";
import { SOCIALS_SKILLS } from "../skills.ts";
import type { ContentPack } from "../schema.ts";

export const SOCIALS_FILE = "Y6A/Socials/Year 6 Social Studies Exam Trainer.html";

export function extractSocials(html: string): ContentPack {
  return extractTopicKeyed(html, {
    file: SOCIALS_FILE,
    subject: { code: "socials", name: { en: "Social Studies" }, icon: "🌍", color: "#0e9488", ord: 4 },
    courseCode: "socials.y6",
    courseName: { en: "Social Studies — Year 6" },
    skills: SOCIALS_SKILLS,
    moduleTitle: "The six exam topics",
    moduleDescription:
      "The Amazon River, river pollution, mountains and maps, how mountains form, the growth of cities and capital cities.",
    blueprintCode: "socials.y6.mock",
    blueprintTitle: "Mock exam — 30 questions",
    blueprintDescription: "30 questions from all six topics, in the style of the real paper.",
    planTitle: "A 6-day plan to be ready",
    gaps: [
      {
        area: "Mountain Lab",
        symbol: "MT_TEXT / MTYPES",
        reason:
          "animaciones SVG de los tres tipos de formación de montañas (plegamiento, bloque, volcánica). El texto explicativo sí está en las lecciones; la animación necesita un componente propio.",
      },
      {
        area: "Map Lab",
        symbol: "C_COLS / R_BANDS / RV / PGI",
        reason:
          "curvas de nivel, pendientes y mapa de relieve generados con SVG y escalas de color. Es una actividad de exploración, no un bloque de contenido.",
      },
      {
        area: "River Lab",
        symbol: "LBL de partes del río / AR",
        reason: "etiquetado interactivo de las partes de un río; formato `hotspot`, aún no soportado.",
      },
      {
        area: "juegos",
        symbol: "PAIRS / ORD / CAPS",
        reason:
          "emparejar causa/daño/cura, ordenar los pasos de la lluvia ácida y el juego de capitales. Formatos `matching` y `ordering` fuera del alcance actual.",
      },
    ],
  });
}

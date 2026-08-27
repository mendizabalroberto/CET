/**
 * Materia: ICT (Year 6 ICT Exam Trainer).
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Estructura gemela de Socials (ver `topic-keyed.ts`).
 */

import { extractTopicKeyed } from "./topic-keyed.ts";
import { ICT_SKILLS } from "../skills.ts";
import type { ContentPack } from "../schema.ts";

export const ICT_FILE = "Y6A/ICT/Year 6 ICT Exam Trainer.html";

export function extractIct(html: string): ContentPack {
  return extractTopicKeyed(html, {
    file: ICT_FILE,
    subject: { code: "ict", name: { en: "ICT" }, icon: "💻", color: "#6d4bd6", ord: 5 },
    courseCode: "ict.y6",
    courseName: { en: "ICT — Year 6" },
    skills: ICT_SKILLS,
    moduleTitle: "The five exam topics",
    moduleDescription:
      "Hardware and software, Scratch, digital content, data transfer, and spreadsheets.",
    blueprintCode: "ict.y6.mock",
    blueprintTitle: "Mock exam — 25 questions",
    blueprintDescription: "25 questions from all five topics, in the style of the real paper.",
    planTitle: "Study plan",
    gaps: [
      {
        area: "Scratch Lab",
        symbol: "PRED / PATHS",
        reason:
          "simulador de bloques de Scratch: el alumno predice el recorrido del sprite. Necesita un intérprete de bloques y un lienzo; no es contenido estático.",
      },
      {
        area: "Data Lab (Excel)",
        symbol: "UNITS / DITEMS",
        reason:
          "hoja de cálculo interactiva con fórmulas. La parte teórica está en las lecciones; la práctica requiere un componente de hoja de cálculo.",
      },
      {
        area: "juegos",
        symbol: "PAIRS / DITEMS",
        reason: "emparejar y clasificar; formatos `matching` y `drag_drop` aún no soportados.",
      },
    ],
  });
}

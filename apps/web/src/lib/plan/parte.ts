import { sumarDias } from "@/lib/plan/fecha";

export interface PendienteDelDia {
  materia: string;
  minutos: number;
}

export interface DatosDelParte {
  nombre: string;
  fecha: string;
  minutosPrevistos: number;
  minutosMedidos: number;
  itemsRespondidos: number;
  aciertos: number;
  pendientes: PendienteDelDia[];
}

function fechaLarga(fecha: string): string {
  const partes = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).formatToParts(new Date(`${fecha}T00:00:00.000Z`));

  let diaSemana = "";
  let dia = "";
  let mes = "";
  for (const parte of partes) {
    if (parte.type === "weekday") diaSemana = parte.value;
    else if (parte.type === "day") dia = parte.value;
    else if (parte.type === "month") mes = parte.value;
  }
  return `${diaSemana} ${dia} de ${mes}`;
}

export function textoDelParte(d: DatosDelParte): string {
  const lineas = [
    `${d.nombre} — ${fechaLarga(d.fecha)}`,
    `Previsto ${d.minutosPrevistos} min · estudiado ${Math.round(d.minutosMedidos)} min`,
    `${d.itemsRespondidos} ítems, ${d.aciertos} aciertos`,
  ];
  if (d.pendientes.length > 0) {
    const resumen = d.pendientes
      .map((p) => `${p.materia} (${p.minutos} min)`)
      .join(", ");
    lineas.push(`Pendiente de hoy: ${resumen}`);
  }
  return lineas.join("\n");
}

export function ventanaDelDia(fecha: string): { desde: string; hasta: string } {
  return {
    desde: `${fecha}T00:00:00-04:00`,
    hasta: `${sumarDias(fecha, 1)}T00:00:00-04:00`,
  };
}

export function esViolacionDeUnicidad(
  error: { code?: string | null } | null | undefined,
): boolean {
  return error?.code === "23505";
}

export function pendientesDelDia(
  tareas: readonly {
    subjectId: string;
    materia: string;
    tipo: "leccion" | "practica";
    lessonId: string | null;
    skillId: string | null;
    minutos: number;
  }[],
  eventos: readonly {
    event_type: string;
    lesson_id: string | null;
    skill_id: string | null;
  }[],
): PendienteDelDia[] {
  const pendientes: PendienteDelDia[] = [];
  for (const tarea of tareas) {
    const hecha =
      tarea.tipo === "leccion"
        ? tarea.lessonId !== null &&
          eventos.some(
            (e) =>
              e.event_type === "lesson_completed" &&
              e.lesson_id === tarea.lessonId,
          )
        : tarea.skillId !== null &&
          eventos.some(
            (e) =>
              e.event_type === "answer_submitted" &&
              e.skill_id === tarea.skillId,
          );
    if (hecha) {
      continue;
    }
    const previa = pendientes.find((p) => p.materia === tarea.materia);
    if (previa) {
      previa.minutos += tarea.minutos;
    } else {
      pendientes.push({ materia: tarea.materia, minutos: tarea.minutos });
    }
  }
  return pendientes;
}

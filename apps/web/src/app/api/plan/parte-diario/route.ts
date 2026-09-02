import { NextResponse } from "next/server";

import { hoyEnZona } from "@/lib/plan/fecha";
import {
  esViolacionDeUnicidad,
  pendientesDelDia,
  textoDelParte,
  ventanaDelDia,
} from "@/lib/plan/parte";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensaje, igualEnTiempoConstante } from "@/lib/telegram/bot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ErrorDePlan = { plan_id?: string; code?: string | null; message?: string };
type PlanActivo = { id: string; student_id: string };
type TareaPlan = {
  subject_id: string | null;
  tipo: string | null;
  lesson_id: string | null;
  skill_id: string | null;
  minutos: number | null;
};
type EventoPlan = {
  event_type: string | null;
  lesson_id: string | null;
  skill_id: string | null;
};
type Materia = {
  id: string;
  code: string | null;
  name: { es?: string; en?: string } | null;
};

function nombreDePila(completo: string | null | undefined): string | null {
  const primero = (completo ?? "").trim().split(/\s+/)[0] ?? "";
  return primero.length > 0 ? primero : null;
}

function nombreDeMateria(materia: Materia): string {
  return materia.name?.es ?? materia.name?.en ?? materia.code ?? materia.id;
}

export async function GET(request: Request): Promise<NextResponse> {
  const esperado = process.env.CRON_SECRET;
  if (esperado === undefined || esperado.trim() === "") {
    console.error("[parte-diario] CRON_SECRET sin configurar; se rechaza");
    return NextResponse.json({ error: "no configurado" }, { status: 503 });
  }

  const cabecera = request.headers.get("authorization") ?? "";
  const presentado = cabecera.startsWith("Bearer ")
    ? cabecera.slice("Bearer ".length)
    : "";
  if (!igualEnTiempoConstante(presentado, esperado)) {
    console.error("[parte-diario] secreto de cron incorrecto");
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const hoy = hoyEnZona();
  const ventana = ventanaDelDia(hoy);
  const admin = createAdminClient(
    "Parte diario: cron sin sesion; plan_partes y chat_id exigen service_role",
  );

  const { data: planesData, error: errorPlanes } = await admin
    .from("planes_de_estudio")
    .select("id, student_id")
    .eq("activo", true);
  if (errorPlanes) {
    console.error("[parte-diario] planes_de_estudio", errorPlanes.code, errorPlanes.message);
    return NextResponse.json({ error: "error al leer planes" }, { status: 500 });
  }
  const planes = (planesData ?? []) as PlanActivo[];

  let procesados = 0;
  let enviados = 0;
  let repetidos = 0;
  const errores: ErrorDePlan[] = [];

  for (const plan of planes) {
    try {
      const { data: perfilData, error: errorPerfil } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", plan.student_id)
        .maybeSingle();
      if (errorPerfil) throw errorPerfil;
      const nombre = nombreDePila(
        (perfilData as { full_name?: string | null } | null)?.full_name,
      );
      if (nombre === null) throw new Error("perfil sin full_name");

      const { data: tareasData, error: errorTareas } = await admin
        .from("plan_tareas")
        .select("subject_id, tipo, lesson_id, skill_id, minutos")
        .eq("plan_id", plan.id)
        .eq("fecha", hoy);
      if (errorTareas) throw errorTareas;
      const tareas = (tareasData ?? []) as TareaPlan[];

      const subjectIds = [
        ...new Set(
          tareas
            .map((t) => t.subject_id)
            .filter((id): id is string => id !== null),
        ),
      ];
      const materias = new Map<string, Materia>();
      if (subjectIds.length > 0) {
        const { data: materiasData, error: errorMaterias } = await admin
          .from("subjects")
          .select("id, code, name")
          .in("id", subjectIds);
        if (errorMaterias) throw errorMaterias;
        for (const materia of (materiasData ?? []) as Materia[]) {
          materias.set(materia.id, materia);
        }
      }

      const { data: eventosData, error: errorEventos } = await admin
        .from("learning_events")
        .select("event_type, lesson_id, skill_id")
        .eq("student_id", plan.student_id)
        .gte("server_ts", ventana.desde)
        .lt("server_ts", ventana.hasta)
        .in("event_type", ["lesson_completed", "answer_submitted"]);
      if (errorEventos) throw errorEventos;
      const eventos = (eventosData ?? []) as EventoPlan[];

      const { data: serieData, error: errorSerie } = await admin.rpc(
        "informe_alumno_serie_diaria",
        {
          p_student_id: plan.student_id,
          p_desde: ventana.desde,
          p_hasta: ventana.hasta,
        },
      );
      if (errorSerie) throw errorSerie;
      const serie = (serieData ?? []) as {
        minutos_estudio?: number | null;
      }[];
      const minutosMedidos = Number(serie[0]?.minutos_estudio ?? 0);

      const { data: logroData, error: errorLogro } = await admin.rpc(
        "informe_alumno_logro_diario",
        {
          p_student_id: plan.student_id,
          p_desde: ventana.desde,
          p_hasta: ventana.hasta,
        },
      );
      if (errorLogro) throw errorLogro;
      const logro = (logroData ?? []) as {
        items_respondidos?: number | null;
        aciertos?: number | null;
      }[];
      const itemsRespondidos = Number(logro[0]?.items_respondidos ?? 0);
      const aciertos = Number(logro[0]?.aciertos ?? 0);

      const minutosPrevistos = tareas.reduce(
        (suma, t) => suma + (t.minutos ?? 0),
        0,
      );

      const tareasConMateria = tareas.map((t) => {
        const materia = materias.get(t.subject_id ?? "");
        if (materia === undefined) {
          throw new Error(`subject_id ${String(t.subject_id)} sin materia`);
        }
        const tipo: "leccion" | "practica" =
          t.tipo === "practica" ? "practica" : "leccion";
        return {
          subjectId: t.subject_id ?? "",
          materia: nombreDeMateria(materia),
          tipo,
          lessonId: t.lesson_id,
          skillId: t.skill_id,
          minutos: t.minutos ?? 0,
        };
      });

      const pendientes = pendientesDelDia(
        tareasConMateria,
        eventos.map((e) => ({
          event_type: e.event_type ?? "",
          lesson_id: e.lesson_id,
          skill_id: e.skill_id,
        })),
      );

      const texto = textoDelParte({
        nombre,
        fecha: hoy,
        minutosPrevistos,
        minutosMedidos,
        itemsRespondidos,
        aciertos,
        pendientes,
      });

      const { error: errorParte } = await admin.from("plan_partes").insert({
        plan_id: plan.id,
        student_id: plan.student_id,
        fecha: hoy,
        minutos_previstos: minutosPrevistos,
        minutos_medidos: minutosMedidos,
        items_respondidos: itemsRespondidos,
        aciertos,
      });
      if (errorParte) {
        if (esViolacionDeUnicidad(errorParte)) {
          repetidos += 1;
          continue;
        }
        throw errorParte;
      }
      procesados += 1;

      const { data: vinculosData, error: errorVinculos } = await admin
        .from("guardian_students")
        .select("guardian_id")
        .eq("student_id", plan.student_id)
        .is("revoked_at", null);
      if (errorVinculos) throw errorVinculos;
      const guardianes = (vinculosData ?? []) as { guardian_id: string }[];

      let algunEnviado = false;
      if (guardianes.length > 0) {
        const guardianIds = [
          ...new Set(guardianes.map((g) => g.guardian_id)),
        ];
        const { data: chatsData, error: errorChats } = await admin
          .from("telegram_de_tutor")
          .select("guardian_id, chat_id")
          .in("guardian_id", guardianIds)
          .not("chat_id", "is", null);
        if (errorChats) throw errorChats;

        const chats = ((chatsData ?? []) as {
          guardian_id: string;
          chat_id: number;
        }[]).map((c) => ({
          guardian_id: c.guardian_id,
          chat_id: Number(c.chat_id),
        }));

        for (const chat of chats) {
          const ok = await enviarMensaje(chat.chat_id, texto);
          if (ok) algunEnviado = true;
        }
      }

      if (algunEnviado) {
        const { error: errorEnvio } = await admin
          .from("plan_partes")
          .update({ enviado_at: new Date().toISOString() })
          .eq("plan_id", plan.id)
          .eq("fecha", hoy);
        if (errorEnvio) throw errorEnvio;
        enviados += 1;
      }
    } catch (causa) {
      const err = causa as { code?: string | null; message?: string };
      errores.push({
        plan_id: plan.id,
        code: err.code ?? null,
        message: err.message ?? "error procesando el plan",
      });
    }
  }

  return NextResponse.json({
    fecha: hoy,
    procesados,
    enviados,
    repetidos,
    errores,
  });
}

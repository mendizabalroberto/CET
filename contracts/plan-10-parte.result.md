# Resultado - plan-10-parte
- Contrato: `contracts/plan-10-parte.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 4 de 4
- Rama: `deepseek/plan-10-parte`
- Duracion: 617.9 s
## Diff

~~~diff
diff --git a/apps/web/src/app/api/plan/parte-diario/route.test.ts b/apps/web/src/app/api/plan/parte-diario/route.test.ts
new file mode 100644
index 0000000..b80d88f
--- /dev/null
+++ b/apps/web/src/app/api/plan/parte-diario/route.test.ts
@@ -0,0 +1,72 @@
+import { afterEach, describe, expect, it, vi } from "vitest";
+
+import { GET } from "./route";
+
+const mocks = vi.hoisted(() => ({ from: vi.fn() }));
+
+vi.mock("server-only", () => ({}));
+
+vi.mock("@/lib/supabase/admin", () => ({
+  createAdminClient: vi.fn(() => ({ from: mocks.from })),
+}));
+
+function cadenaQueResuelve(resultado: unknown) {
+  const eq = vi.fn().mockResolvedValue(resultado);
+  const select = vi.fn().mockReturnValue({ eq });
+  return { select };
+}
+
+describe("GET /api/plan/parte-diario", () => {
+  afterEach(() => {
+    vi.unstubAllEnvs();
+    vi.clearAllMocks();
+  });
+
+  it("sin CRON_SECRET responde 503 y no toca la base", async () => {
+    vi.stubEnv("CRON_SECRET", "");
+    const respuesta = await GET(
+      new Request("http://localhost/api/plan/parte-diario"),
+    );
+
+    expect(respuesta.status).toBe(503);
+    expect(mocks.from).not.toHaveBeenCalled();
+  });
+
+  it("con la cabecera incorrecta responde 401 y no toca la base", async () => {
+    vi.stubEnv("CRON_SECRET", "secreto-del-cron");
+    const respuesta = await GET(
+      new Request("http://localhost/api/plan/parte-diario", {
+        headers: { authorization: "Bearer secreto-incorrecto" },
+      }),
+    );
+
+    expect(respuesta.status).toBe(401);
+    expect(mocks.from).not.toHaveBeenCalled();
+  });
+
+  it("con cero planes activos responde 200 y procesados 0", async () => {
+    vi.stubEnv("CRON_SECRET", "secreto-del-cron");
+    mocks.from.mockReturnValue(cadenaQueResuelve({ data: [], error: null }));
+
+    const respuesta = await GET(
+      new Request("http://localhost/api/plan/parte-diario", {
+        headers: { authorization: "Bearer secreto-del-cron" },
+      }),
+    );
+
+    expect(respuesta.status).toBe(200);
+    const cuerpo = (await respuesta.json()) as {
+      fecha: string;
+      procesados: number;
+      enviados: number;
+      repetidos: number;
+      errores: unknown[];
+    };
+    expect(cuerpo.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
+    expect(cuerpo.procesados).toBe(0);
+    expect(cuerpo.enviados).toBe(0);
+    expect(cuerpo.repetidos).toBe(0);
+    expect(cuerpo.errores).toEqual([]);
+    expect(mocks.from).toHaveBeenCalledWith("planes_de_estudio");
+  });
+});
diff --git a/apps/web/src/app/api/plan/parte-diario/route.ts b/apps/web/src/app/api/plan/parte-diario/route.ts
new file mode 100644
index 0000000..9e142ba
--- /dev/null
+++ b/apps/web/src/app/api/plan/parte-diario/route.ts
@@ -0,0 +1,281 @@
+import { NextResponse } from "next/server";
+
+import { hoyEnZona } from "@/lib/plan/fecha";
+import {
+  esViolacionDeUnicidad,
+  pendientesDelDia,
+  textoDelParte,
+  ventanaDelDia,
+} from "@/lib/plan/parte";
+import { createAdminClient } from "@/lib/supabase/admin";
+import { enviarMensaje, igualEnTiempoConstante } from "@/lib/telegram/bot";
+
+export const dynamic = "force-dynamic";
+export const runtime = "nodejs";
+
+type ErrorDePlan = { plan_id?: string; code?: string | null; message?: string };
+type PlanActivo = { id: string; student_id: string };
+type TareaPlan = {
+  subject_id: string | null;
+  tipo: string | null;
+  lesson_id: string | null;
+  skill_id: string | null;
+  minutos: number | null;
+};
+type EventoPlan = {
+  event_type: string | null;
+  lesson_id: string | null;
+  skill_id: string | null;
+};
+type Materia = {
+  id: string;
+  code: string | null;
+  name: { es?: string; en?: string } | null;
+};
+
+function nombreDePila(completo: string | null | undefined): string | null {
+  const primero = (completo ?? "").trim().split(/\s+/)[0] ?? "";
+  return primero.length > 0 ? primero : null;
+}
+
+function nombreDeMateria(materia: Materia): string {
+  return materia.name?.es ?? materia.name?.en ?? materia.code ?? materia.id;
+}
+
+export async function GET(request: Request): Promise<NextResponse> {
+  const esperado = process.env.CRON_SECRET;
+  if (esperado === undefined || esperado.trim() === "") {
+    console.error("[parte-diario] CRON_SECRET sin configurar; se rechaza");
+    return NextResponse.json({ error: "no configurado" }, { status: 503 });
+  }
+
+  const cabecera = request.headers.get("authorization") ?? "";
+  const presentado = cabecera.startsWith("Bearer ")
+    ? cabecera.slice("Bearer ".length)
+    : "";
+  if (!igualEnTiempoConstante(presentado, esperado)) {
+    console.error("[parte-diario] secreto de cron incorrecto");
+    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
+  }
+
+  const hoy = hoyEnZona();
+  const ventana = ventanaDelDia(hoy);
+  const admin = createAdminClient(
+    "Parte diario: cron sin sesion; plan_partes y chat_id exigen service_role",
+  );
+
+  const { data: planesData, error: errorPlanes } = await admin
+    .from("planes_de_estudio")
+    .select("id, student_id")
+    .eq("activo", true);
+  if (errorPlanes) {
+    console.error("[parte-diario] planes_de_estudio", errorPlanes.code, errorPlanes.message);
+    return NextResponse.json({ error: "error al leer planes" }, { status: 500 });
+  }
+  const planes = (planesData ?? []) as PlanActivo[];
+
+  let procesados = 0;
+  let enviados = 0;
+  let repetidos = 0;
+  const errores: ErrorDePlan[] = [];
+
+  for (const plan of planes) {
+    try {
+      const { data: perfilData, error: errorPerfil } = await admin
+        .from("profiles")
+        .select("full_name")
+        .eq("id", plan.student_id)
+        .maybeSingle();
+      if (errorPerfil) throw errorPerfil;
+      const nombre = nombreDePila(
+        (perfilData as { full_name?: string | null } | null)?.full_name,
+      );
+      if (nombre === null) throw new Error("perfil sin full_name");
+
+      const { data: tareasData, error: errorTareas } = await admin
+        .from("plan_tareas")
+        .select("subject_id, tipo, lesson_id, skill_id, minutos")
+        .eq("plan_id", plan.id)
+        .eq("fecha", hoy);
+      if (errorTareas) throw errorTareas;
+      const tareas = (tareasData ?? []) as TareaPlan[];
+
+      const subjectIds = [
+        ...new Set(
+          tareas
+            .map((t) => t.subject_id)
+            .filter((id): id is string => id !== null),
+        ),
+      ];
+      const materias = new Map<string, Materia>();
+      if (subjectIds.length > 0) {
+        const { data: materiasData, error: errorMaterias } = await admin
+          .from("subjects")
+          .select("id, code, name")
+          .in("id", subjectIds);
+        if (errorMaterias) throw errorMaterias;
+        for (const materia of (materiasData ?? []) as Materia[]) {
+          materias.set(materia.id, materia);
+        }
+      }
+
+      const { data: eventosData, error: errorEventos } = await admin
+        .from("learning_events")
+        .select("event_type, lesson_id, skill_id")
+        .eq("student_id", plan.student_id)
+        .gte("server_ts", ventana.desde)
+        .lt("server_ts", ventana.hasta)
+        .in("event_type", ["lesson_completed", "answer_submitted"]);
+      if (errorEventos) throw errorEventos;
+      const eventos = (eventosData ?? []) as EventoPlan[];
+
+      const { data: serieData, error: errorSerie } = await admin.rpc(
+        "informe_alumno_serie_diaria",
+        {
+          p_student_id: plan.student_id,
+          p_desde: ventana.desde,
+          p_hasta: ventana.hasta,
+        },
+      );
+      if (errorSerie) throw errorSerie;
+      const serie = (serieData ?? []) as {
+        minutos_estudio?: number | null;
+      }[];
+      const minutosMedidos = Number(serie[0]?.minutos_estudio ?? 0);
+
+      const { data: logroData, error: errorLogro } = await admin.rpc(
+        "informe_alumno_logro_diario",
+        {
+          p_student_id: plan.student_id,
+          p_desde: ventana.desde,
+          p_hasta: ventana.hasta,
+        },
+      );
+      if (errorLogro) throw errorLogro;
+      const logro = (logroData ?? []) as {
+        items_respondidos?: number | null;
+        aciertos?: number | null;
+      }[];
+      const itemsRespondidos = Number(logro[0]?.items_respondidos ?? 0);
+      const aciertos = Number(logro[0]?.aciertos ?? 0);
+
+      const minutosPrevistos = tareas.reduce(
+        (suma, t) => suma + (t.minutos ?? 0),
+        0,
+      );
+
+      const tareasConMateria = tareas.map((t) => {
+        const materia = materias.get(t.subject_id ?? "");
+        if (materia === undefined) {
+          throw new Error(`subject_id ${String(t.subject_id)} sin materia`);
+        }
+        const tipo: "leccion" | "practica" =
+          t.tipo === "practica" ? "practica" : "leccion";
+        return {
+          subjectId: t.subject_id ?? "",
+          materia: nombreDeMateria(materia),
+          tipo,
+          lessonId: t.lesson_id,
+          skillId: t.skill_id,
+          minutos: t.minutos ?? 0,
+        };
+      });
+
+      const pendientes = pendientesDelDia(
+        tareasConMateria,
+        eventos.map((e) => ({
+          event_type: e.event_type ?? "",
+          lesson_id: e.lesson_id,
+          skill_id: e.skill_id,
+        })),
+      );
+
+      const texto = textoDelParte({
+        nombre,
+        fecha: hoy,
+        minutosPrevistos,
+        minutosMedidos,
+        itemsRespondidos,
+        aciertos,
+        pendientes,
+      });
+
+      const { error: errorParte } = await admin.from("plan_partes").insert({
+        plan_id: plan.id,
+        student_id: plan.student_id,
+        fecha: hoy,
+        minutos_previstos: minutosPrevistos,
+        minutos_medidos: minutosMedidos,
+        items_respondidos: itemsRespondidos,
+        aciertos,
+      });
+      if (errorParte) {
+        if (esViolacionDeUnicidad(errorParte)) {
+          repetidos += 1;
+          continue;
+        }
+        throw errorParte;
+      }
+      procesados += 1;
+
+      const { data: vinculosData, error: errorVinculos } = await admin
+        .from("guardian_students")
+        .select("guardian_id")
+        .eq("student_id", plan.student_id)
+        .is("revoked_at", null);
+      if (errorVinculos) throw errorVinculos;
+      const guardianes = (vinculosData ?? []) as { guardian_id: string }[];
+
+      let algunEnviado = false;
+      if (guardianes.length > 0) {
+        const guardianIds = [
+          ...new Set(guardianes.map((g) => g.guardian_id)),
+        ];
+        const { data: chatsData, error: errorChats } = await admin
+          .from("telegram_de_tutor")
+          .select("guardian_id, chat_id")
+          .in("guardian_id", guardianIds)
+          .not("chat_id", "is", null);
+        if (errorChats) throw errorChats;
+
+        const chats = ((chatsData ?? []) as {
+          guardian_id: string;
+          chat_id: number;
+        }[]).map((c) => ({
+          guardian_id: c.guardian_id,
+          chat_id: Number(c.chat_id),
+        }));
+
+        for (const chat of chats) {
+          const ok = await enviarMensaje(chat.chat_id, texto);
+          if (ok) algunEnviado = true;
+        }
+      }
+
+      if (algunEnviado) {
+        const { error: errorEnvio } = await admin
+          .from("plan_partes")
+          .update({ enviado_at: new Date().toISOString() })
+          .eq("plan_id", plan.id)
+          .eq("fecha", hoy);
+        if (errorEnvio) throw errorEnvio;
+        enviados += 1;
+      }
+    } catch (causa) {
+      const err = causa as { code?: string | null; message?: string };
+      errores.push({
+        plan_id: plan.id,
+        code: err.code ?? null,
+        message: err.message ?? "error procesando el plan",
+      });
+    }
+  }
+
+  return NextResponse.json({
+    fecha: hoy,
+    procesados,
+    enviados,
+    repetidos,
+    errores,
+  });
+}
diff --git a/apps/web/src/lib/plan/parte.test.ts b/apps/web/src/lib/plan/parte.test.ts
new file mode 100644
index 0000000..6aad272
--- /dev/null
+++ b/apps/web/src/lib/plan/parte.test.ts
@@ -0,0 +1,87 @@
+import { describe, expect, it } from "vitest";
+
+import {
+  esViolacionDeUnicidad,
+  pendientesDelDia,
+  textoDelParte,
+  ventanaDelDia,
+} from "./parte";
+
+describe("textoDelParte", () => {
+  it("formatea el parte con pendiente", () => {
+    expect(
+      textoDelParte({
+        nombre: "Leo",
+        fecha: "2026-09-02",
+        minutosPrevistos: 45,
+        minutosMedidos: 12,
+        itemsRespondidos: 8,
+        aciertos: 5,
+        pendientes: [{ materia: "English", minutos: 25 }],
+      }),
+    ).toBe(
+      [
+        "Leo — miércoles 2 de septiembre",
+        "Previsto 45 min · estudiado 12 min",
+        "8 ítems, 5 aciertos",
+        "Pendiente de hoy: English (25 min)",
+      ].join("\n"),
+    );
+  });
+
+  it("omite la línea de pendientes", () => {
+    expect(
+      textoDelParte({
+        nombre: "Leo",
+        fecha: "2026-09-02",
+        minutosPrevistos: 45,
+        minutosMedidos: 12,
+        itemsRespondidos: 8,
+        aciertos: 5,
+        pendientes: [],
+      }),
+    ).toBe(
+      [
+        "Leo — miércoles 2 de septiembre",
+        "Previsto 45 min · estudiado 12 min",
+        "8 ítems, 5 aciertos",
+      ].join("\n"),
+    );
+  });
+});
+
+describe("ventanaDelDia", () => {
+  it("devuelve la ventana de La Paz", () => {
+    expect(ventanaDelDia("2026-09-02")).toEqual({
+      desde: "2026-09-02T00:00:00-04:00",
+      hasta: "2026-09-03T00:00:00-04:00",
+    });
+  });
+});
+
+describe("esViolacionDeUnicidad", () => {
+  it("distingue 23505", () => {
+    expect(esViolacionDeUnicidad({ code: "23505" })).toBe(true);
+    expect(esViolacionDeUnicidad({ code: "23514" })).toBe(false);
+    expect(esViolacionDeUnicidad(null)).toBe(false);
+    expect(esViolacionDeUnicidad(undefined)).toBe(false);
+  });
+});
+
+describe("pendientesDelDia", () => {
+  it("mezcla una lección hecha, una lección pendiente y una práctica respondida", () => {
+    const tareas: Parameters<typeof pendientesDelDia>[0] = [
+      { subjectId: "s1", materia: "English", tipo: "leccion", lessonId: "l1", skillId: null, minutos: 10 },
+      { subjectId: "s1", materia: "English", tipo: "leccion", lessonId: "l2", skillId: null, minutos: 25 },
+      { subjectId: "s2", materia: "Math", tipo: "practica", lessonId: null, skillId: "sk1", minutos: 15 },
+    ];
+    const eventos = [
+      { event_type: "lesson_completed", lesson_id: "l1", skill_id: null },
+      { event_type: "answer_submitted", lesson_id: null, skill_id: "sk1" },
+    ];
+
+    expect(pendientesDelDia(tareas, eventos)).toEqual([
+      { materia: "English", minutos: 25 },
+    ]);
+  });
+});
diff --git a/apps/web/src/lib/plan/parte.ts b/apps/web/src/lib/plan/parte.ts
new file mode 100644
index 0000000..60062bd
--- /dev/null
+++ b/apps/web/src/lib/plan/parte.ts
@@ -0,0 +1,107 @@
+import { sumarDias } from "@/lib/plan/fecha";
+
+export interface PendienteDelDia {
+  materia: string;
+  minutos: number;
+}
+
+export interface DatosDelParte {
+  nombre: string;
+  fecha: string;
+  minutosPrevistos: number;
+  minutosMedidos: number;
+  itemsRespondidos: number;
+  aciertos: number;
+  pendientes: PendienteDelDia[];
+}
+
+function fechaLarga(fecha: string): string {
+  const partes = new Intl.DateTimeFormat("es-ES", {
+    weekday: "long",
+    day: "numeric",
+    month: "long",
+    timeZone: "UTC",
+  }).formatToParts(new Date(`${fecha}T00:00:00.000Z`));
+
+  let diaSemana = "";
+  let dia = "";
+  let mes = "";
+  for (const parte of partes) {
+    if (parte.type === "weekday") diaSemana = parte.value;
+    else if (parte.type === "day") dia = parte.value;
+    else if (parte.type === "month") mes = parte.value;
+  }
+  return `${diaSemana} ${dia} de ${mes}`;
+}
+
+export function textoDelParte(d: DatosDelParte): string {
+  const lineas = [
+    `${d.nombre} — ${fechaLarga(d.fecha)}`,
+    `Previsto ${d.minutosPrevistos} min · estudiado ${Math.round(d.minutosMedidos)} min`,
+    `${d.itemsRespondidos} ítems, ${d.aciertos} aciertos`,
+  ];
+  if (d.pendientes.length > 0) {
+    const resumen = d.pendientes
+      .map((p) => `${p.materia} (${p.minutos} min)`)
+      .join(", ");
+    lineas.push(`Pendiente de hoy: ${resumen}`);
+  }
+  return lineas.join("\n");
+}
+
+export function ventanaDelDia(fecha: string): { desde: string; hasta: string } {
+  return {
+    desde: `${fecha}T00:00:00-04:00`,
+    hasta: `${sumarDias(fecha, 1)}T00:00:00-04:00`,
+  };
+}
+
+export function esViolacionDeUnicidad(
+  error: { code?: string | null } | null | undefined,
+): boolean {
+  return error?.code === "23505";
+}
+
+export function pendientesDelDia(
+  tareas: readonly {
+    subjectId: string;
+    materia: string;
+    tipo: "leccion" | "practica";
+    lessonId: string | null;
+    skillId: string | null;
+    minutos: number;
+  }[],
+  eventos: readonly {
+    event_type: string;
+    lesson_id: string | null;
+    skill_id: string | null;
+  }[],
+): PendienteDelDia[] {
+  const pendientes: PendienteDelDia[] = [];
+  for (const tarea of tareas) {
+    const hecha =
+      tarea.tipo === "leccion"
+        ? tarea.lessonId !== null &&
+          eventos.some(
+            (e) =>
+              e.event_type === "lesson_completed" &&
+              e.lesson_id === tarea.lessonId,
+          )
+        : tarea.skillId !== null &&
+          eventos.some(
+            (e) =>
+              e.event_type === "answer_submitted" &&
+              e.skill_id === tarea.skillId,
+          );
+    if (hecha) {
+      continue;
+    }
+    const previa = pendientes.find((p) => p.materia === tarea.materia);
+    if (previa) {
+      previa.minutos += tarea.minutos;
+    } else {
+      pendientes.push({ materia: tarea.materia, minutos: tarea.minutos });
+    }
+  }
+  return pendientes;
+}
diff --git a/apps/web/vercel.json b/apps/web/vercel.json
index f31af24..aae906b 100644
--- a/apps/web/vercel.json
+++ b/apps/web/vercel.json
@@ -1,5 +1,11 @@
 {
   "$schema": "https://openapi.vercel.sh/vercel.json",
+  "crons": [
+    {
+      "path": "/api/plan/parte-diario",
+      "schedule": "0 1 * * *"
+    }
+  ],
   "headers": [
     {
       "source": "/(.*)",

~~~

## Salida final de `pnpm --filter @cet/web typecheck && pnpm --filter @cet/web exec eslint src/app/api/plan src/lib/plan && pnpm --filter @cet/web exec vitest run src/lib/plan/parte src/app/api/plan`

~~~

> @cet/web@0.1.0 typecheck D:\.cet-worktrees\plan-10-parte\apps\web
> tsc --noEmit


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/plan-10-parte/apps/web[39m

 [32m✓[39m src/lib/plan/parte.test.ts [2m([22m[2m5 tests[22m[2m)[22m[90m 12[2mms[22m[39m
 [32m✓[39m src/app/api/plan/parte-diario/route.test.ts [2m([22m[2m3 tests[22m[2m)[22m[90m 16[2mms[22m[39m

[2m Test Files [22m [1m[32m2 passed[39m[22m[90m (2)[39m
[2m      Tests [22m [1m[32m8 passed[39m[22m[90m (8)[39m
[2m   Start at [22m 13:10:59
[2m   Duration [22m 483ms[2m (transform 57ms, setup 308ms, collect 87ms, tests 28ms, environment 0ms, prepare 119ms)[22m

[90mstderr[2m | src/app/api/plan/parte-diario/route.test.ts[2m > [22m[2mGET /api/plan/parte-diario[2m > [22m[2msin CRON_SECRET responde 503 y no toca la base
[22m[39m[parte-diario] CRON_SECRET sin configurar; se rechaza

[90mstderr[2m | src/app/api/plan/parte-diario/route.test.ts[2m > [22m[2mGET /api/plan/parte-diario[2m > [22m[2mcon la cabecera incorrecta responde 401 y no toca la base
[22m[39m[parte-diario] secreto de cron incorrecto


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.
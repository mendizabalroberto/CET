/**
 * Vista previa de desarrollo de la pestaña «Su plan» del tutor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Hermana de `/dev/informe-preview` y con su misma regla: sirve para MIRAR la
 * pantalla —acuse, cancelar, descartar, histórico, próximas fechas— sin entrar
 * con la cuenta de ningún tutor. Los datos son fabricados y tienen la forma
 * EXACTA que devuelven `boletinesDeHijo`, `planActivoDeHijo` y
 * `eventosProximos`; el componente es el de producción.
 *
 * Las acciones (`cancelarPlan`, `descartarBoletin`…) son Server Actions de
 * verdad: aquí no hay sesión de tutor, así que devuelven «no encontrado». Es
 * deliberado: la vista previa enseña el camino de la interfaz, no escribe.
 *
 * `notFound()` en cuanto `NODE_ENV` no es `development`.
 */
import { notFound } from "next/navigation";

import { PlanDeEstudio } from "@/components/tutor/PlanDeEstudio";
import { RobotLector } from "@/components/tutor/RobotLector";
import { getServerDictionary } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
import type { BoletinResumen, EventoProximo, PlanResumen } from "@/lib/plan/consultas";

const STUDENT_ID = "00000000-0000-4000-8000-000000000001";

const boletinConfirmado: BoletinResumen = {
  id: "00000000-0000-4000-8000-0000000000b2",
  gestion: 2026,
  trimestre: 2,
  estado: "confirmado",
  notas: [
    { materia: "Matemática", code: "math", subject_id: "s-math", nota: 78, banda: "good" },
    { materia: "Inglés", code: "english", subject_id: "s-eng", nota: 91, banda: "outstanding" },
    { materia: "Ciencias", code: "science", subject_id: "s-sci", nota: 64, banda: "satisfactory" },
    { materia: "Música", code: null, subject_id: null, nota: 88, banda: "well_done" },
  ],
  createdAt: "2026-08-20T14:00:00Z",
  confirmadoAt: "2026-08-21T09:30:00Z",
};

const boletinAnterior: BoletinResumen = {
  id: "00000000-0000-4000-8000-0000000000b1",
  gestion: 2026,
  trimestre: 1,
  estado: "confirmado",
  notas: [
    { materia: "Matemática", code: "math", subject_id: "s-math", nota: 71, banda: "good" },
    { materia: "Inglés", code: "english", subject_id: "s-eng", nota: 85, banda: "well_done" },
    { materia: "Ciencias", code: "science", subject_id: "s-sci", nota: 58, banda: "needs_improvement" },
  ],
  createdAt: "2026-05-10T14:00:00Z",
  confirmadoAt: "2026-05-11T09:30:00Z",
};

const boletinExtraido: BoletinResumen = {
  ...boletinConfirmado,
  id: "00000000-0000-4000-8000-0000000000b3",
  trimestre: 3,
  estado: "extraido",
  confirmadoAt: null,
  createdAt: "2026-09-01T16:00:00Z",
};

const planActivo: PlanResumen = {
  id: "00000000-0000-4000-8000-0000000000p1",
  boletinId: boletinConfirmado.id,
  desde: "2026-08-24",
  hasta: "2026-11-13",
  minutosPorDia: 40,
  reparto: {
    pesos: { math: 0.45, science: 0.35, english: 0.2 },
    techos: [
      { subjectId: "s-sci", code: "science", minutosPedidos: 1120, minutosDisponibles: 640 },
    ],
  },
  recomendaciones: [
    "Empezar cada sesión con cinco minutos de repaso de fracciones.",
    "Leer en inglés diez minutos antes de dormir.",
  ],
  createdAt: "2026-08-23T18:00:00Z",
  tareas: 96,
  partes: [
    { fecha: "2026-09-01", minutosPrevistos: 40, minutosMedidos: 38, itemsRespondidos: 22, aciertos: 17, enviadoAt: "2026-09-02T01:00:00Z" },
    { fecha: "2026-08-31", minutosPrevistos: 40, minutosMedidos: 12, itemsRespondidos: 6, aciertos: 4, enviadoAt: "2026-09-01T01:00:00Z" },
    { fecha: "2026-08-30", minutosPrevistos: 40, minutosMedidos: 0, itemsRespondidos: 0, aciertos: 0, enviadoAt: null },
  ],
};

const eventos: EventoProximo[] = [
  { desde: "2026-09-24", hasta: "2026-09-24", tipo: "feriado", yearLevels: [] },
  { desde: "2026-10-05", hasta: "2026-10-09", tipo: "vacaciones", yearLevels: [] },
  { desde: "2026-10-17", hasta: "2026-10-17", tipo: "hito_cambridge", yearLevels: [4] },
  { desde: "2026-10-31", hasta: "2026-10-31", tipo: "fin_trimestre", yearLevels: [] },
];

interface Caso {
  readonly titulo: string;
  readonly nota: string;
  readonly boletines: readonly BoletinResumen[];
  readonly plan: PlanResumen | null;
  readonly eventos: readonly EventoProximo[];
}

const CASOS: readonly Caso[] = [
  {
    titulo: "Con plan activo, un boletín anterior y fechas por delante",
    nota: "Lo que ve un padre a mitad de trimestre. Pulsa «Borrar el plan»: tiene que aparecer la confirmación en la misma tarjeta, nunca un diálogo del navegador. «Editar el plan» despliega minutos y reparto en porcentajes enteros. El hito de Movers (Y4) va apagado porque el hijo es de Y6.",
    boletines: [boletinConfirmado, boletinAnterior],
    plan: planActivo,
    eventos,
  },
  {
    titulo: "Boletín guardado, sin plan todavía",
    nota: "Las notas son editables y «Guardar notas y regenerar el plan» dispara la propuesta de la IA. Como no hay sesión real, cualquier envío en esta vista vuelve con un error de «no encontrado»: es entonces cuando se ve el acuse arriba con «Volver a intentar» si el error trae el boletinId, o el botón «Generar otro plan» de la tarjeta «Todavía no hay plan». También se puede descartar este boletín porque aún no tiene plan.",
    boletines: [boletinExtraido, boletinConfirmado, boletinAnterior],
    plan: null,
    eventos: [],
  },
  {
    titulo: "Sin nada",
    nota: "Primera visita: ni boletín, ni plan, ni fechas en dos meses.",
    boletines: [],
    plan: null,
    eventos: [],
  },
];

export default async function PlanPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const { locale, t } = await getServerDictionary();

  return (
    <LocaleProvider locale={locale} dictionary={t}>
      <main className="mx-auto flex max-w-2xl flex-col gap-12 px-4 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-ink">Su plan — vista previa</h1>
          <p className="max-w-prose text-sm text-muted">
            La pestaña <code>/tutor/hijos/[id]/plan</code> con datos fabricados de la forma exacta
            que devuelven las consultas. Las acciones no escriben: sin sesión de tutor devuelven
            «no encontrado», y eso también se ve aquí.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            Analizando: el robot que lee el boletín
          </h2>
          <p className="max-w-prose text-sm text-muted">
            Lo que se ve mientras `generarPlan` trabaja. Los pasos avanzan por tiempo estimado; el
            último no se cierra nunca aquí. Tócalo: asiente y cambia de frase. Con
            «reducir movimiento» activado en el sistema, todo queda quieto y sigue leyéndose.
          </p>
          <div className="border-line bg-card rounded-2xl border-2 p-5">
            <RobotLector
              titulo={t.tutor.child.plan.analyzingTitle}
              pasos={t.tutor.child.plan.analyzingSteps}
              ayuda={t.tutor.child.plan.analyzingHelp}
              bocadillos={t.tutor.child.plan.analyzingBubbles}
              etiquetaRobot={t.tutor.child.plan.analyzingRobotLabel}
              pista={t.tutor.child.plan.analyzingHint}
            />
          </div>
        </section>

        {CASOS.map((caso) => (
          <section key={caso.titulo} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{caso.titulo}</h2>
            <p className="max-w-prose text-sm text-muted">{caso.nota}</p>
            <PlanDeEstudio
              studentId={STUDENT_ID}
              boletin={caso.boletines[0] ?? null}
              boletines={caso.boletines}
              plan={caso.plan}
              nombre="Leo"
              eventos={caso.eventos}
              yearLevel={6}
            />
          </section>
        ))}
      </main>
    </LocaleProvider>
  );
}

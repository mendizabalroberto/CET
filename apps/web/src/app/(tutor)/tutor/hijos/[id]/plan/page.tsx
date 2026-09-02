/**
 * /tutor/hijos/[id]/plan — la pestaña «Su plan» del área de un hijo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `alcanceDeHijo()` devuelve null si el id no es de un hijo del tutor, y esta
 * página responde 404 antes de leer nada. Las lecturas viven aquí, en el
 * servidor; `PlanDeEstudio` solo escribe a través de las cuatro acciones.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlanDeEstudio } from "@/components/tutor/PlanDeEstudio";
import { getServerDictionary } from "@/lib/i18n/server";
import { boletinesDeHijo, planActivoDeHijo } from "@/lib/plan/consultas";
import { alcanceDeHijo } from "@/lib/tutor/queries";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

/** «Leo Mendizabal García» -> «Leo». */
function nombreDePila(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.child.plan.cardTitle };
}

export default async function PlanDeHijoPage({ params }: PageProps) {
  const { id } = await params;

  const hijo = await alcanceDeHijo(id);
  if (hijo === null) notFound();

  const [boletines, plan] = await Promise.all([
    boletinesDeHijo(hijo.id),
    planActivoDeHijo(hijo.id),
  ]);

  return (
    <PlanDeEstudio
      studentId={hijo.id}
      boletin={boletines[0] ?? null}
      plan={plan}
      nombre={nombreDePila(hijo.nombre)}
    />
  );
}

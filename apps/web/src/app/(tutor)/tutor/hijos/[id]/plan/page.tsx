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
import { boletinesDeHijo, eventosProximos, planActivoDeHijo } from "@/lib/plan/consultas";
import { hoyEnZona } from "@/lib/plan/fecha";
import { createClient } from "@/lib/supabase/server";
import { alcanceDeHijo } from "@/lib/tutor/queries";

// Dos llamadas a DeepSeek (hasta 60 s cada una) más el PDF: el límite por
// defecto de la función no basta para `generarPlan`/`regenerarPlan`.
export const maxDuration = 300;

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

/** «Leo Mendizabal García» -> «Leo». */
function nombreDePila(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

/**
 * El curso del hijo, solo para marcar en gris un hito Cambridge que no es
 * suyo (§6 del encargo). `alcanceDeHijo` no lo trae —solo decide el catálogo
 * de contenido, no el calendario— así que se lee aparte, con la misma sesión
 * del tutor y la RLS que ya cubre `students`. `null` si algo falla: el
 * componente entonces pinta todos los hitos igual, en vez de romper la
 * pantalla por un dato que aquí es solo decorativo.
 */
async function yearLevelDeHijo(studentId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select("year_level")
    .eq("profile_id", studentId)
    .maybeSingle();
  if (error !== null || data === null) return null;
  const valor = (data as { year_level?: unknown }).year_level;
  return typeof valor === "number" ? valor : null;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.child.plan.cardTitle };
}

export default async function PlanDeHijoPage({ params }: PageProps) {
  const { id } = await params;

  const hijo = await alcanceDeHijo(id);
  if (hijo === null) notFound();

  const hoy = hoyEnZona();
  const gestionActual = Number(hoy.slice(0, 4));

  const [boletines, plan, eventos, yearLevel] = await Promise.all([
    boletinesDeHijo(hijo.id),
    planActivoDeHijo(hijo.id),
    eventosProximos(gestionActual, hoy, 60),
    yearLevelDeHijo(hijo.id),
  ]);

  return (
    <PlanDeEstudio
      studentId={hijo.id}
      boletin={boletines[0] ?? null}
      boletines={boletines}
      plan={plan}
      nombre={nombreDePila(hijo.nombre)}
      eventos={eventos}
      yearLevel={yearLevel}
    />
  );
}

/**
 * /tutor/hijos/[id] — el enlace de un hijo y los aparatos que le recuerdan.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `detalleDeHijo()` consulta con la sesión del tutor, así que un id que no sea
 * de un hijo suyo no devuelve fila y esta página responde 404 — sin preguntarse
 * por qué y sin escribir aquí ninguna comprobación de pertenencia. La RLS es
 * quien decide; la UI refleja su alcance, nunca lo determina.
 *
 * Y 404 y no 403: un 403 confirmaría que ese id existe, que es información
 * sobre un menor ajeno.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Dispositivos } from "@/components/tutor/Dispositivos";
import { EnlaceDeAcceso } from "@/components/tutor/EnlaceDeAcceso";
import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { detalleDeHijo } from "@/lib/tutor/queries";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.home.title };
}

export default async function HijoPage({ params }: PageProps) {
  const { id } = await params;
  const { t } = await getServerDictionary();

  const hijo = await detalleDeHijo(id);
  if (hijo === null) notFound();

  const C = t.tutor.child;

  return (
    <section className="space-y-6">
      <Link href={ROUTES.tutorHome} className="text-sm font-semibold text-teal">
        ← {C.back}
      </Link>

      <h1 className="text-2xl font-bold text-ink">{hijo.nombre}</h1>

      <EnlaceDeAcceso studentId={hijo.id} yaTieneEnlace={hijo.enlaceActivo} />

      <Dispositivos dispositivos={hijo.dispositivos} />

      <section className="rounded-2xl border-2 border-line bg-card p-5">
        <h2 className="text-lg font-bold text-ink">{C.pinTitle}</h2>
        {/* No hay botón de "resetear PIN" separado, y es deliberado: crear un
            enlace nuevo YA es la forma de que el niño elija otro. Dos caminos
            para lo mismo obligarían al tutor a entender la diferencia entre un
            PIN provisional y un enlace, que es justo la distinción que este
            diseño eliminó. */}
        <p className="mt-2 text-muted">{C.pinBody}</p>
      </section>
    </section>
  );
}

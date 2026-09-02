/**
 * /tutor/hijos/[id] — cómo va un hijo, su enlace y los aparatos que le recuerdan.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * `detalleDeHijo()` consulta con la sesión del tutor, así que un id que no sea
 * de un hijo suyo no devuelve fila y esta página responde 404 — sin preguntarse
 * por qué y sin escribir aquí ninguna comprobación de pertenencia. La RLS es
 * quien decide; la UI refleja su alcance, nunca lo determina.
 *
 * Y 404 y no 403: un 403 confirmaría que ese id existe, que es información
 * sobre un menor ajeno.
 *
 * ===========================================================================
 * EL SEGUIMIENTO VA PRIMERO
 * ===========================================================================
 * Antes esta pantalla era administración pura —un enlace, unos aparatos, una
 * nota sobre el PIN— y no contestaba la pregunta que trae aquí a un padre:
 * «¿está estudiando?». Ahora el informe encabeza y lo demás queda debajo, que
 * es donde tiene que estar: crear un enlace se hace una vez, mirar cómo va su
 * hijo se hace muchas.
 *
 * SIN DATOS NO SE PINTA EL INFORME. `propsDeSeguimiento` devuelve `null`
 * cuando no hay ni una señal de vida, y entonces sale una frase que explica qué
 * falta. Nueve baldosas a cero, para el padre que acaba de dar de alta a su
 * hijo, serían el informe de un niño que nunca ha entrado — y la conclusión que
 * saca de ahí es que el producto no funciona.
 *
 * EL INFORME LO ENCABEZA EL NOMBRE DE PILA y no el nombre completo. El completo
 * ya es el `h1` de esta página, dos renglones más arriba; repetirlo entero
 * debajo no añade nada y deja dos títulos casi idénticos pegados. «Leo» debajo
 * de «Leo Mendizabal García» se lee como el principio de su informe, que es
 * justo lo que es. Es el mismo `nombreDePila` que ya usan el enlace y el
 * dispositivo en `lib/tutor/queries.ts`.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Dispositivos } from "@/components/tutor/Dispositivos";
import { EnlaceDeAcceso } from "@/components/tutor/EnlaceDeAcceso";
import { Seguimiento } from "@/components/tutor/Seguimiento";
import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { detalleDeHijo, seguimientoDeHijo } from "@/lib/tutor/queries";
import { rutasDeHijo } from "@/lib/tutor/rutas";
import { propsDeSeguimiento } from "@/lib/tutor/seguimiento";

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerDictionary();
  return { title: t.tutor.home.title };
}

/** «Leo Mendizabal García» -> «Leo». Ver la cabecera. */
function nombreDePila(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

export default async function HijoPage({ params }: PageProps) {
  const { id } = await params;
  const { locale, t } = await getServerDictionary();

  const hijo = await detalleDeHijo(id);
  if (hijo === null) notFound();

  const C = t.tutor.child;

  // Después del 404: no se consulta el informe de un id que ni siquiera es de
  // un hijo suyo. La función tiene su propio guardián dentro (la RLS decide),
  // pero pedirlo igualmente sería trabajo que se sabe inútil.
  const seguimiento = await seguimientoDeHijo(hijo.id);
  const scorecard = propsDeSeguimiento(seguimiento, nombreDePila(hijo.nombre), locale);

  return (
    <section className="space-y-6">
      <Link href={ROUTES.tutorHome} className="text-sm font-semibold text-teal">
        ← {C.back}
      </Link>

      <h1 className="text-2xl font-bold text-ink">{hijo.nombre}</h1>

      {scorecard === null ? (
        <section className="rounded-2xl border-2 border-line bg-card p-5">
          <h2 className="text-lg font-bold text-ink">{C.progress.emptyTitle}</h2>
          <p className="mt-2 text-muted">{C.progress.emptyBody}</p>
        </section>
      ) : (
        <Seguimiento locale={locale} scorecard={scorecard} />
      )}

      {/* «¿ESTUDIANDO QUÉ?» VA JUSTO DEBAJO DE «¿ESTÁ ESTUDIANDO?».
          El informe de arriba dice cuántos minutos y en qué lecciones, pero
          nombrarlas no es enseñarlas: un padre que lee «45 min en Fracciones»
          quiere abrir Fracciones. Este es el único sitio de la pantalla donde
          esa pregunta está viva; más abajo empieza la administración —enlace,
          aparatos, PIN—, que se hace una vez y no cada semana.

          Y va ANTES del enlace a propósito, aunque el enlace sea lo primero que
          usa un padre nuevo: quien vuelve a esta página ya tiene a su hijo
          dentro y viene a mirar, no a dar de alta. */}
      <Link
        href={rutasDeHijo(hijo.id).contenido}
        className="block rounded-2xl border-2 border-line bg-card p-5 transition-colors hover:border-teal"
      >
        <h2 className="text-lg font-bold text-ink">{C.content.cardTitle}</h2>
        <p className="mt-2 text-muted">{C.content.cardBody}</p>
        <span aria-hidden="true" className="mt-3 inline-block font-semibold text-teal">
          {C.content.open} →
        </span>
      </Link>

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

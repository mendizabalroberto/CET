/**
 * Layout de la zona de UN hijo: quién es, y qué hay de él.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ LA CABECERA SUBE AQUÍ
 * ===========================================================================
 * La ficha del hijo pintaba su propio «← Volver a mis hijos» y su propio `h1`
 * con el nombre. Mientras esa era la única pantalla del hijo, estaba bien. Con
 * las lecciones al lado ya no: o se copiaban las dos piezas en cuatro ficheros
 * —y el día que cambie el rótulo se queda alguna atrás— o el padre perdía el
 * nombre de su hijo en cuanto entraba a una lección.
 *
 * Ahora la identidad y la navegación son del ÁREA, no de una pantalla. Cada
 * página de dentro aporta su contenido y nada más.
 *
 * ===========================================================================
 * EL 404 SE DECIDE DOS VECES, Y ES CORRECTO
 * ===========================================================================
 * Este layout llama a `alcanceDeHijo()` y responde 404 si no hay fila; las
 * páginas de dentro vuelven a llamarlo y vuelven a decidir. No es una
 * redundancia por descuido: un layout no es una barrera de autorización —una
 * página puede acabar renderizándose bajo otro layout tras una refactorización,
 * y ese supuesto no debe ser lo único que protege los datos de un menor—. Es la
 * misma disciplina que ya aplica el layout de `(tutor)` repitiendo el
 * `requireRole` que el middleware ya hizo.
 *
 * Y no cuesta una consulta de más: `alcanceDeHijo` va envuelto en `cache()` de
 * React, así que layout y página comparten la misma lectura dentro de la misma
 * petición.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NavDelHijo, type DestinoDeHijo } from "@/components/tutor/NavDelHijo";
import { getServerDictionary } from "@/lib/i18n/server";
import { ROUTES } from "@/lib/routes";
import { alcanceDeHijo } from "@/lib/tutor/queries";
import { rutasDeHijo } from "@/lib/tutor/rutas";

interface LayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{ id: string }>;
}

export default async function HijoLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const { t } = await getServerDictionary();

  const hijo = await alcanceDeHijo(id);
  if (hijo === null) notFound();

  const C = t.tutor.child;
  const rutas = rutasDeHijo(hijo.id);

  const destinos: readonly DestinoDeHijo[] = [
    // `exacto`: la ficha es prefijo de todo lo demás. Ver `NavDelHijo`.
    { href: rutas.ficha, label: C.nav.progress, exacto: true },
    { href: rutas.contenido, label: C.nav.content },
  ];

  return (
    <div className="space-y-6">
      <Link href={ROUTES.tutorHome} className="text-sm font-semibold text-teal">
        ← {C.back}
      </Link>

      {/* EL NOMBRE COMPLETO, y una sola vez en toda el área. El informe de
          dentro encabeza con el nombre de pila —«Leo» debajo de «Leo Mendizabal
          García» se lee como el principio de su informe— y esa relación se
          conserva tal cual estaba. */}
      <h1 className="text-2xl font-bold text-ink">{hijo.nombre}</h1>

      <NavDelHijo label={C.nav.label} destinos={destinos} currentLabel={C.nav.current} />

      {children}
    </div>
  );
}

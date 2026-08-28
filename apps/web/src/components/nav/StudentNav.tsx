/**
 * Barra de navegación del alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ EXISTE
 * ===========================================================================
 * El layout de alumno no tenía navegación. Ninguna. Entrar en una práctica era
 * entrar en un callejón sin salida: el único camino de vuelta era el botón
 * atrás del navegador, y en una tableta compartida eso no siempre está a mano.
 *
 * ===========================================================================
 * LA REGLA QUE MANDA AQUÍ: EL EXAMEN NO TIENE SALIDA
 * ===========================================================================
 * En `/exam/<id>/run` esta barra NO SE PINTA. Un examen cronometrado del que se
 * puede salir con un toque a "Aprender" deja de ser un examen: el reloj del
 * servidor sigue corriendo mientras el alumno consulta la lección que explica
 * justo lo que le están preguntando.
 *
 * La salida existe, pero la pone la propia pantalla de examen y es explícita y
 * consciente. Esta barra no le presta un atajo.
 *
 * Es una decisión de integridad, no de diseño: si mañana alguien añade una ruta
 * de examen nueva, `esModoExamen()` tiene que cubrirla. De ahí que la condición
 * viva en una función con nombre y con test, y no en un `&&` dentro del JSX.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono, type NombreDeIcono } from "@cet/ui";

import type { Dictionary } from "@/lib/i18n/dictionaries/en";
import { ROUTES } from "@/lib/routes";

/**
 * ¿Estamos dentro de un examen en curso?
 *
 * Solo `/exam/<algo>/run`. El índice de exámenes y la pantalla de resultado SÍ
 * llevan navegación: en el primero no ha empezado nada y en la segunda ya ha
 * terminado todo.
 *
 * Exportada para poder probarla sin montar un árbol de React. La lista de
 * caminos sin salida es exactamente la clase de cosa que se rompe en silencio
 * cuando alguien añade una ruta.
 */
export function esModoExamen(pathname: string): boolean {
  return /^\/exam\/[^/]+\/run\/?$/.test(pathname);
}

interface Destino {
  readonly href: string;
  readonly label: string;
  readonly icono: NombreDeIcono;
}

/**
 * Los tres dibujos del rail.
 *
 * Antes eran SVG escritos a mano aqui, con este razonamiento: «son cuatro, no
 * justifican una dependencia, y asi heredan `currentColor` sin configuracion».
 * Era cierto con cuatro. Con un icono en cada boton de la aplicacion ya no, y
 * veinte ficheros dibujando cada uno a su manera es peor que una dependencia.
 *
 * Las METAFORAS no cambian —libro abierto, circulos concentricos, documento con
 * marca— justamente para que nadie tenga que reaprender por donde se va a
 * Practicar. Lo que cambia es el trazo, que ahora es el mismo que el del resto
 * de la aplicacion. Y `aria-hidden` sigue puesto, porque lo pone `Icono`: el
 * nombre accesible lo da el texto de al lado, que SIEMPRE esta presente.
 */
const NOMBRE_DE_ICONO = {
  learn: "navAprender",
  practice: "navPracticar",
  exam: "navExamenes",
} as const satisfies Record<string, NombreDeIcono>;

export interface StudentNavProps {
  readonly t: Dictionary;
}

export function StudentNav({ t }: StudentNavProps) {
  const pathname = usePathname() ?? "";

  // El examen en curso no lleva navegación. Ver la cabecera de este fichero.
  if (esModoExamen(pathname)) return null;

  const N = t.studentNav;

  const destinos: readonly Destino[] = [
    { href: ROUTES.studentHome, label: N.learn, icono: NOMBRE_DE_ICONO.learn },
    { href: "/practice", label: N.practice, icono: NOMBRE_DE_ICONO.practice },
    { href: "/exam", label: N.exam, icono: NOMBRE_DE_ICONO.exam },
  ];

  /**
   * Una pestaña está activa también en sus subrutas: leyendo una lección sigues
   * "en Aprender". Si solo se marcara la coincidencia exacta, la pregunta
   * "¿dónde estoy?" se quedaría sin responder justo en las pantallas
   * profundas, que son las únicas donde uno se pierde.
   */
  const estaActivo = (href: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={N.label}
      className={[
        // Móvil y tableta: barra fija abajo, donde llega el pulgar.
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card",
        // `pb-safe`: en un iPad con barra de gestos, sin esto la fila de
        // pestañas queda debajo del indicador del sistema.
        "pb-[env(safe-area-inset-bottom)]",
        // Escritorio: la misma barra se convierte en un raíl lateral.
        "md:inset-y-0 md:right-auto md:left-0 md:w-56 md:border-r md:border-t-0 md:pb-0",
      ].join(" ")}
    >
      <ul className="mx-auto flex max-w-lg md:mt-20 md:max-w-none md:flex-col md:gap-1 md:px-3">
        {destinos.map((destino) => {
          const activo = estaActivo(destino.href);
          return (
            <li key={destino.href} className="flex-1">
              <Link
                href={destino.href}
                // El identificador sale del DESTINO, no de la etiqueta: la
                // etiqueta es el idioma del alumno y cambia; `/practice` no.
                data-cet-id={`nav${destino.href.replace(/\//g, ".")}`}
                // `aria-current` es lo que un lector de pantalla anuncia. El
                // color y el grosor son para quien ve; esto es para quien no.
                {...(activo ? { "aria-current": "page" as const } : {})}
                className={[
                  "relative flex flex-col items-center gap-1 px-2 py-2.5 text-xs font-semibold transition-colors",
                  // Blanco de toque de 44px, que es el mínimo cómodo para un
                  // dedo infantil. Sin esto la fila se pulsa a la primera solo
                  // con puntería de adulto.
                  "min-h-[44px] justify-center",
                  "md:flex-row md:justify-start md:gap-3 md:rounded-xl md:px-4 md:py-3 md:text-sm",
                  activo ? "text-teal" : "text-muted hover:text-ink",
                  activo ? "md:bg-teal/10" : "",
                ].join(" ")}
              >
                <Icono nombre={destino.icono} tamano={24} />
                <span>{destino.label}</span>
                {activo ? <span className="sr-only">({N.current})</span> : null}
                {/* La marca visual de "estás aquí". En móvil, una barra sobre la
                    pestaña; el color solo no basta para quien no lo distingue. */}
                <span
                  aria-hidden="true"
                  className={[
                    "absolute top-0 h-0.5 w-10 rounded-full md:hidden",
                    activo ? "bg-teal" : "bg-transparent",
                  ].join(" ")}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

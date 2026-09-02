/**
 * Navegación de la zona de UN hijo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ EXISTE
 * ===========================================================================
 * Las lecciones del hijo entraron en el producto colgando de una tarjeta dentro
 * de su ficha. Funcionaba —se llegaba— y aun así no estaban INTEGRADAS: había
 * que abrir la ficha, bajar hasta la tarjeta y pulsarla, y una vez dentro no
 * quedaba ni rastro de que existiera la ficha. Dos pantallas hermanas, y ningún
 * sitio donde se vieran las dos a la vez.
 *
 * Esta barra es ese sitio. Es la misma pregunta que resuelve `StudentNav` para
 * el alumno —«¿dónde estoy y qué más hay?»— acotada a un hijo concreto.
 *
 * ===========================================================================
 * LAS DOS REGLAS QUE MANDAN AQUÍ
 * ===========================================================================
 * 1. UNA PESTAÑA ESTÁ ACTIVA TAMBIÉN EN SUS SUBRUTAS. Leyendo una lección
 *    sigues en «Sus lecciones». Marcar solo la coincidencia exacta dejaría la
 *    pregunta «¿dónde estoy?» sin responder justo en las pantallas profundas,
 *    que son las únicas donde uno se pierde.
 *
 *    Y por eso el orden importa: `/tutor/hijos/<id>` es prefijo de TODO lo
 *    demás, así que si se comparase por prefijo saldría activa siempre. La
 *    ficha se compara por igualdad exacta y las otras por prefijo. Es la clase
 *    de detalle que se rompe en silencio al añadir una pestaña, así que
 *    `estaActivo` vive en una función con nombre y con test.
 *
 * 2. EL ACTIVO NO SE MARCA SOLO CON COLOR. Lleva `aria-current` para quien
 *    escucha y una barra bajo la pestaña para quien no distingue el teal.
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface DestinoDeHijo {
  readonly href: string;
  readonly label: string;
  /**
   * `true` cuando este destino solo está activo si la ruta coincide EXACTA.
   * Lo usa la ficha, que es prefijo de todas las demás pantallas del hijo.
   */
  readonly exacto?: boolean;
}

/**
 * ¿Es este el destino en el que estamos?
 *
 * Exportada para poder probarla sin montar un árbol de React.
 */
export function estaActivo(pathname: string, destino: DestinoDeHijo): boolean {
  if (destino.exacto === true) return pathname === destino.href;
  return pathname === destino.href || pathname.startsWith(`${destino.href}/`);
}

export interface NavDelHijoProps {
  /** Nombre accesible del `<nav>`, ya traducido. */
  readonly label: string;
  readonly destinos: readonly DestinoDeHijo[];
  /** «estás aquí», para el lector de pantalla. */
  readonly currentLabel: string;
}

export function NavDelHijo({ label, destinos, currentLabel }: NavDelHijoProps): ReactNode {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label={label} className="border-b border-line">
      <ul className="flex flex-wrap gap-1">
        {destinos.map((destino) => {
          const activo = estaActivo(pathname, destino);
          return (
            <li key={destino.href}>
              <Link
                href={destino.href}
                {...(activo ? { "aria-current": "page" as const } : {})}
                className={[
                  // 44px de alto: es el blanco cómodo para un dedo, y esta zona
                  // se lee tanto en el móvil del padre como en su portátil.
                  "relative flex min-h-11 items-center px-4 text-sm font-semibold transition-colors",
                  activo ? "text-teal" : "text-muted hover:text-ink",
                ].join(" ")}
              >
                {destino.label}
                {activo ? <span className="sr-only"> ({currentLabel})</span> : null}
                {/* La marca de «estás aquí» que no depende del color. Se apoya
                    en el borde inferior del `<nav>`, así que la pestaña activa
                    parece continuar hacia el contenido. */}
                <span
                  aria-hidden="true"
                  className={[
                    "absolute inset-x-2 -bottom-px h-0.5 rounded-full",
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

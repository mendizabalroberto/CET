/**
 * Migas de pan para las pantallas profundas del alumno.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ EXISTE
 * ===========================================================================
 * En `/learn/<id>` y `/practice/<tema>` el alumno no sabe dónde está: el curso
 * y el módulo se pintan como texto muerto y el único enlace dice «Volver a tus
 * lecciones» sin decir a dónde vuelve. El rail lateral responde «en qué
 * sección estoy»; esto responde «en qué pantalla estoy» dentro de esa sección.
 *
 * ===========================================================================
 * LAS REGLAS QUE MANDAN AQUÍ
 * ===========================================================================
 * 1. El último escalón NUNCA es un enlace, aunque traiga `href`: un enlace a
 *    la página en la que ya estás es un clic que no hace nada, y para un lector
 *    de pantalla es una promesa falsa.
 * 2. Un escalón intermedio sin `href` se pinta como texto, no desaparece: que
 *    un módulo todavía no tenga página propia no es motivo para ocultarle al
 *    alumno en qué módulo está.
 * 3. Los separadores van en `<span aria-hidden="true">` entre escalones, y no
 *    después del último: un lector no debe decir «mayor que» entre cada paso.
 * 4. `items` vacío devuelve `null`: un `<nav>` con una lista vacía es ruido
 *    para un lector de pantalla.
 */
"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface Miga {
  /** Rótulo ya resuelto al idioma del alumno. Nunca una clave de diccionario. */
  readonly label: string;
  /** Destino. Si falta, el escalón se pinta como texto y no como enlace. */
  readonly href?: string | undefined;
}

export interface MigasProps {
  /** Nombre accesible del `<nav>`, ya traducido. Ej.: "Ruta". */
  readonly label: string;
  /** De la raíz al sitio actual. El ÚLTIMO es siempre el sitio actual. */
  readonly items: readonly Miga[];
  readonly className?: string | undefined;
}

export function Migas({ label, items, className }: MigasProps): ReactNode {
  if (items.length === 0) return null;

  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((miga, indice) => {
          const esUltimo = indice === items.length - 1;
          const esEnlace = !esUltimo && miga.href !== undefined;

          return (
            <li key={`${miga.label}-${indice}`} className="flex items-center gap-1">
              {indice > 0 ? (
                <span aria-hidden="true" className="text-muted">
                  ›
                </span>
              ) : null}
              {esEnlace ? (
                <Link
                  href={miga.href}
                  className={[
                    "min-h-11 inline-flex items-center text-sm text-muted transition-colors",
                    "hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2",
                  ].join(" ")}
                >
                  {miga.label}
                </Link>
              ) : (
                <span
                  {...(esUltimo ? { "aria-current": "page" as const } : {})}
                  className={[
                    "min-h-11 inline-flex items-center text-sm",
                    esUltimo ? "font-semibold text-ink" : "text-muted",
                  ].join(" ")}
                >
                  {miga.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

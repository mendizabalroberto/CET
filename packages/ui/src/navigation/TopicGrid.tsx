"use client";

/**
 * @cet/ui — la rejilla de temas de practica.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE AQUI SI SE RESPETA EL ORDEN DE ENTRADA, AL REVES QUE `SubjectGrid`
 * ===========================================================================
 * `SubjectGrid` ordena ella porque el array de materias llega como lo devuelva
 * la consulta y cambia cuando el colegio activa un curso: si la rejilla lo
 * pintara tal cual, Matematicas amaneceria un martes en la tercera casilla.
 * Aqui la premisa es la contraria. Los temas salen del registro de generadores
 * de `@cet/engine`, que es una lista fija y pensada —de lo mas simple a lo mas
 * compuesto, con el sorteo al final—, y la aplicacion ya ha decidido el orden
 * antes de llamar. Reordenar aqui seria pisar esa decision con un criterio que
 * este paquete no tiene: no sabe de dificultad ni de dependencias entre temas.
 *
 * La memoria espacial se conserva igual de bien, que era el motivo de fondo:
 * lo que hace falta es que la casilla sea ESTABLE, no que la ordene la rejilla.
 *
 * ===========================================================================
 * POR QUE <ul> Y <li> Y NO DIVS EN REJILLA
 * ===========================================================================
 * Son N cosas navegables. Con lista, el lector de pantalla anuncia "lista de 10
 * elementos" antes de entrar y el alumno sabe cuanto hay sin recorrerlo; con
 * divs no hay forma de saberlo mas que llegando al final. El aspecto de rejilla
 * lo pone CSS, que no cambia el arbol de accesibilidad.
 */

import type { ReactNode } from "react";

import { cn } from "../lib/cn.js";

import { TopicCard, type TopicCardProps } from "./TopicCard.js";

export interface TopicGridProps {
  readonly topics: readonly TopicCardProps[];
  readonly className?: string | undefined;
}

/**
 * Rejilla de tarjetas de tema: 1 columna, 2 desde `sm`, 3 desde `lg`.
 *
 * Presentacional pura, sin estado: recibe las tarjetas ya resueltas (nombre y
 * pista en el idioma del alumno, `href` construido, nivel o `null`) y solo las
 * coloca. Las mismas medidas que `SubjectGrid` a proposito: con diez temas, dos
 * columnas fijas dejaban media pantalla vacia en el portatil del colegio.
 */
export function TopicGrid({ topics, className }: TopicGridProps): ReactNode {
  return (
    <ul
      className={cn(
        "m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {topics.map((topic) => (
        <li key={topic.href} className="m-0 flex">
          <TopicCard {...topic} className={cn("w-full", topic.className)} />
        </li>
      ))}
    </ul>
  );
}

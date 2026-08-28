"use client";

/**
 * @cet/ui — la rejilla de materias.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE ORDENA ELLA Y NO RESPETA EL ORDEN DE ENTRADA
 * ===========================================================================
 * El array llega como lo devuelva la consulta, y eso cambia cuando el colegio
 * activa o desactiva un curso. Si la rejilla lo pinta tal cual, Matematicas
 * amanece un martes en la tercera casilla y el alumno tiene que LEER seis
 * tarjetas para encontrar la suya. La memoria espacial es el segundo canal de
 * identificacion de una materia (el primero es el icono; el color no lo es, es
 * el mismo gris para todos en escala de grises), y solo funciona si la casilla
 * es estable. Por eso el orden lo manda `subjectIdentity(code).order`, que es
 * fijo, y a igualdad —las materias que este design system no conoce, todas con
 * el mismo `order`— el nombre, que es lo unico que las distingue.
 *
 * ===========================================================================
 * POR QUE <ul> Y <li> Y NO DIVS EN GRID
 * ===========================================================================
 * Son N cosas navegables. Con lista, el lector de pantalla anuncia "lista de 6
 * elementos" antes de entrar y el alumno sabe cuanto hay sin recorrerlo; con
 * divs, no hay forma de saberlo mas que llegando al final. El aspecto de rejilla
 * lo pone CSS, que no cambia el arbol de accesibilidad.
 */

import type { ReactNode } from "react";

import { cn } from "../lib/cn.js";

import { SubjectCard, type SubjectCardProps } from "./SubjectCard.js";
import { subjectIdentity } from "./subject-identity.js";

export interface SubjectGridProps {
  readonly subjects: readonly SubjectCardProps[];
  readonly className?: string | undefined;
}

/** Orden de rejilla: casilla fija y, a igualdad, alfabetico por nombre. */
function byGridPosition(a: SubjectCardProps, b: SubjectCardProps): number {
  const delta = subjectIdentity(a.code).order - subjectIdentity(b.code).order;
  if (delta !== 0) return delta;
  return a.name.localeCompare(b.name);
}

/**
 * Rejilla de tarjetas de materia: 1 columna, 2 desde `sm`, 3 desde `lg`.
 *
 * Presentacional pura, sin estado: recibe las tarjetas ya resueltas (nombre en
 * el idioma del alumno, `href` construido, cifras de avance o `null`) y solo
 * decide en que casilla cae cada una.
 */
export function SubjectGrid({ subjects, className }: SubjectGridProps): ReactNode {
  const ordered = [...subjects].sort(byGridPosition);

  return (
    <ul
      className={cn(
        "m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
    >
      {ordered.map((subject) => (
        <li key={subject.href} className="m-0 flex">
          <SubjectCard {...subject} className={cn("w-full", subject.className)} />
        </li>
      ))}
    </ul>
  );
}

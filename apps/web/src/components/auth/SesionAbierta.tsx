/**
 * «Ya has entrado como…» — el aviso que sustituye a una expulsión.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUE PROBLEMA RESUELVE
 * ===========================================================================
 * Las pantallas de acceso echaban a quien ya tenía sesión: `redirect` a su
 * portada, sin mensaje. Con la sesión del tutor viva, abrir `/login/staff` te
 * devolvía a `/tutor` antes de dejarte escribir nada, y la única salida era
 * adivinar que primero había que cerrar sesión.
 *
 * Esto lo cambia por lo que hace cualquier producto con cuentas múltiples: te
 * dice quién eres y te da las dos salidas. Seguir, o entrar con otra cuenta.
 *
 * ===========================================================================
 * POR QUE EL FORMULARIO SE SIGUE PINTANDO DEBAJO
 * ===========================================================================
 * Porque es la razón por la que la persona ha llegado aquí. Si hubiera querido
 * su portada, ya estaría en ella: ha escrito la dirección de una pantalla de
 * acceso, y lo natural es asumir que quiere acceder. Este aviso informa; no
 * decide por ella.
 *
 * ===========================================================================
 * «SALIR» Y NO «CAMBIAR DE CUENTA»
 * ===========================================================================
 * El enlace lleva a cerrar sesión, no a un conmutador. Un conmutador de cuentas
 * de verdad tendría que sostener dos sesiones vivas a la vez en el mismo
 * navegador, y eso es superficie nueva en un producto que maneja datos de
 * menores. Entrar con otra cuenta desde el formulario ya reemplaza la sesión,
 * así que el enlace de salir solo hace falta cuando alguien quiere dejar el
 * navegador limpio.
 *
 * ===========================================================================
 * «SALIR» ES UN FORMULARIO, NO UN <Link> A /logout
 * ===========================================================================
 * Lo fue, y CERRABA LA SESIÓN SIN QUE NADIE PULSARA NADA: Next prefetcha los
 * enlaces que entran en pantalla, y prefetchar `/logout` es ejecutarlo. La
 * secuencia medida en producción el 02/09/2026: abrir `/login` con sesión
 * viva, ver «Ya has entrado como…», pulsar «Continuar» y aterrizar en un 404
 * porque la cookie ya no existía. El layout del tutor cayó en la misma trampa
 * antes (ver su cabecera). Cerrar sesión va por POST con la Server Action
 * `signOut`, como en `(staff)`, `(student)` y `(tutor)`.
 */
import Link from "next/link";

import { signOut } from "@/lib/auth/actions";

export interface TextosDeSesionAbierta {
  /** «Ya has entrado como {name}.» */
  readonly yaDentro: string;
  /** «Continuar» */
  readonly continuar: string;
  /** «Salir» */
  readonly salir: string;
  /** «O entra con otra cuenta.» */
  readonly otraCuenta: string;
}

export interface SesionAbiertaProps {
  readonly nombre: string;
  /** A dónde lleva «Continuar»: la portada del rol que ya tiene. */
  readonly casa: string;
  readonly textos: TextosDeSesionAbierta;
}

export function SesionAbierta({ nombre, casa, textos }: SesionAbiertaProps) {
  return (
    <div
      // `status` y no `alert`: es contexto, no una interrupción. Un lector de
      // pantalla lo anuncia al llegar sin cortar lo que esté diciendo.
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4"
    >
      <p className="text-sm text-ink">{textos.yaDentro.replace("{name}", nombre)}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={casa}
          data-cet-id="sesion.continuar"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {textos.continuar}
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            data-cet-id="sesion.salir"
            className="text-sm font-medium text-muted underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {textos.salir}
          </button>
        </form>
      </div>

      {/* Separa el aviso del formulario que viene debajo y explica qué es ese
          formulario ahora: no «entra», sino «entra con OTRA cuenta». Sin esta
          frase, un formulario debajo de «ya has entrado» se lee como un error. */}
      <p className="text-sm text-muted">{textos.otraCuenta}</p>
    </div>
  );
}

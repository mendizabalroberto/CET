/**
 * UiInteractionScope — el recolector de actos de interfaz.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * LA DECISIÓN QUE DEFINE ESTE FICHERO
 * ===========================================================================
 * Registra **solo lo que lleva `data-cet-id`**, y ese identificador se pone a
 * mano, uno a uno, en los controles que importan.
 *
 * La alternativa —registrar todo clic sobre cualquier elemento, con su selector
 * CSS y su texto— cubre más sin tocar un componente, y por eso es la que se
 * elige casi siempre. Produce un dato inservible a los seis meses:
 *
 *   · el texto del botón es el idioma. Este repositorio acaba de traducir seis
 *     materias al español: un análisis por texto habría partido cada serie en
 *     dos, «Next» y «Siguiente», sin que nadie se enterara de que eran la misma;
 *   · el selector CSS es la maquetación. Envolver un botón en un `<div>` para
 *     centrarlo renombra el control y corta la serie histórica;
 *   · y lo peor: registra también lo que nadie decidió registrar. Un clic sobre
 *     el nombre del alumno, sobre un párrafo de la lección, sobre el fondo. Eso
 *     no es telemetría de aprendizaje de un menor: es vigilancia con más
 *     resolución que propósito.
 *
 * Un `data-cet-id` es una declaración: *esto lo queremos medir, y se va a
 * llamar así aunque cambie de sitio, de color y de idioma*.
 *
 * ===========================================================================
 * POR QUÉ ESCUCHA EN `document` Y NO EN UN ENVOLTORIO
 * ===========================================================================
 * Un `<div onClickCapture>` alrededor de los hijos no vería los diálogos: React
 * los monta en un PORTAL, fuera del árbol del DOM aunque estén dentro del árbol
 * de React. Justo el diálogo de entregar el examen —el control más cargado de
 * significado de toda la aplicación— quedaría sin medir.
 *
 * Escuchar en `document` no amplía el alcance: el componente solo está montado
 * dentro del layout de alumno, y el filtro sigue siendo `data-cet-id`.
 */
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { useTelemetry } from "@/lib/telemetry/provider";

/**
 * Superficie por defecto cuando el control no está bajo ningún
 * `data-cet-surface`. Se deriva de la ruta, no del componente: es lo único que
 * se sabe con certeza desde aquí.
 */
function superficieDeRuta(pathname: string): string {
  const primero = pathname.split("/").filter(Boolean)[0];
  return primero ?? "inicio";
}

/**
 * El valor RESULTANTE de un control, cuando lo tiene y es de un conjunto
 * cerrado.
 *
 * NUNCA texto escrito por el alumno. Un `<input type="text">` de una pregunta
 * contiene su respuesta, y la respuesta ya viaja en `answer_submitted`, que es
 * donde está pensada la retención y donde se puntúa. Duplicarla aquí la
 * metería en un evento de interfaz que nadie revisa con ese criterio.
 */
function valorDe(el: HTMLElement): string | number | boolean | undefined {
  const declarado = el.dataset.cetValue;
  if (declarado !== undefined) return declarado;

  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked;
    return undefined;
  }
  if (el instanceof HTMLSelectElement) return el.value;
  if (el instanceof HTMLButtonElement && el.getAttribute("aria-pressed") !== null) {
    return el.getAttribute("aria-pressed") === "true";
  }
  return undefined;
}

export function UiInteractionScope({ children }: { children: ReactNode }) {
  const { trackUi, trackNav } = useTelemetry();
  const pathname = usePathname();

  // La ruta se lee dentro de los manejadores, que se registran una sola vez.
  // Sin la referencia, el efecto tendría que volver a registrar los listeners en
  // cada navegación: más trabajo y una ventana —entre el desmontaje y el
  // registro— en la que un clic no se contaría.
  const rutaRef = useRef(pathname);
  rutaRef.current = pathname;
  const rutaAnteriorRef = useRef<string | null>(null);

  useEffect(() => {
    const alActuar = (event: Event, action: "click" | "change"): void => {
      const objetivo = event.target;
      if (!(objetivo instanceof Element)) return;

      const control = objetivo.closest<HTMLElement>("[data-cet-id]");
      if (!control) return;

      // Una casilla emite `click` Y `change`, y el `click` llega en fase de
      // captura ANTES de que el navegador cambie `checked`. Registrar los dos
      // daria dos actos por marca, uno con el valor de antes y otro con el de
      // despues: el doble de pulsaciones y la mitad de sentido. Manda el
      // `change`, que es el que trae el estado resultante.
      const esCasilla =
        control instanceof HTMLInputElement &&
        (control.type === "checkbox" || control.type === "radio");
      if (esCasilla && action === "click") return;

      const id = control.dataset.cetId;
      if (!id) return;

      const superficie =
        control.closest<HTMLElement>("[data-cet-surface]")?.dataset.cetSurface ??
        superficieDeRuta(rutaRef.current);

      trackUi({
        control: id,
        surface: superficie,
        action,
        value: valorDe(control),
      });
    };

    const alHacerClic = (e: Event) => alActuar(e, "click");
    const alCambiar = (e: Event) => alActuar(e, "change");

    // Fase de CAPTURA: un `stopPropagation()` en el manejador del componente
    // —que los diálogos y los menús usan constantemente— haría desaparecer el
    // evento antes de llegar a `document` en la fase de burbujeo. El control
    // seguiría funcionando y su medición se perdería en silencio, que es
    // exactamente la clase de fallo que este proyecto ya pagó una vez.
    document.addEventListener("click", alHacerClic, true);
    document.addEventListener("change", alCambiar, true);
    return () => {
      document.removeEventListener("click", alHacerClic, true);
      document.removeEventListener("change", alCambiar, true);
    };
  }, [trackUi]);

  useEffect(() => {
    const anterior = rutaAnteriorRef.current;
    rutaAnteriorRef.current = pathname;
    // La primera ruta no es una navegación: es la entrada. `session_context` ya
    // la cubre, y emitir aquí un `nav_route_changed` con `from` vacío metería
    // una transición falsa en el análisis de recorridos.
    if (anterior === null || anterior === pathname) return;
    trackNav(anterior, pathname);
  }, [pathname, trackNav]);

  return <>{children}</>;
}

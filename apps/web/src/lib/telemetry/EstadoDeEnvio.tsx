"use client";

/**
 * El aviso de que el trabajo del niño está a salvo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ ESTO EXISTE
 * ===========================================================================
 * La cola de telemetría guarda en el navegador lo que no ha podido enviar, lo
 * reintenta con backoff, lo rescata en el arranque siguiente y lo borra en
 * cuanto la base lo confirma. Todo eso es invisible.
 *
 * Y una tubería invisible que nadie puede observar es indistinguible de una
 * rota. Durante meses la ingesta respondió 403 y descartó cada lote en
 * silencio: no había bucle, ni error, ni filas, ni forma de notarlo desde la
 * pantalla. Este componente es lo que faltaba entonces.
 *
 * ===========================================================================
 * CALLA CUANDO NO HAY NADA QUE DECIR
 * ===========================================================================
 * Un indicador de sincronización permanente en la pantalla de un niño de once
 * años es ruido: le pide atención para algo sobre lo que no puede hacer nada.
 * Así que no se pinta nada mientras haya red y no quede nada pendiente.
 *
 * Aparece en tres casos, y los tres le importan a alguien:
 *
 *   sin conexión  El aviso que de verdad necesita: «sigue, no se pierde nada».
 *                 Sin él, un niño que ve fallar la red asume que su rato no
 *                 cuenta, y esa es la peor lectura posible.
 *   pendiente     Hay trabajo escrito aquí y aún no confirmado por la base.
 *   guardado      Confirmación breve al entregar, y se va sola. Es el paso que
 *                 cierra el ciclo: local -> base -> borrado de aquí.
 *
 * «Guardado» y no «enviado»: enviado lo sabe el cliente, guardado lo sabe la
 * base. Solo se dice después de que el servidor acepte el lote, que es el mismo
 * instante en que el depósito local se limpia.
 */
import { useEffect, useState } from "react";

import { useTelemetryQueue } from "./provider";
import type { EstadoDeCola } from "./client";

/** Cuánto se queda el «guardado» antes de irse solo. */
const CONFIRMACION_MS = 2_400;

type Cara = "oculto" | "sin_conexion" | "pendiente" | "guardado";

function cara(estado: EstadoDeCola, confirmando: boolean): Cara {
  if (estado.sinConexion) return "sin_conexion";
  if (estado.pendientes > 0) return "pendiente";
  if (confirmando) return "guardado";
  return "oculto";
}

export interface TextosDeEnvio {
  readonly sinConexion: string;
  readonly pendiente: string;
  readonly guardado: string;
}

export function EstadoDeEnvio({ textos }: { textos: TextosDeEnvio }) {
  const cola = useTelemetryQueue();
  const [estado, setEstado] = useState<EstadoDeCola | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!cola) return;
    return cola.suscribir(setEstado);
  }, [cola]);

  // El «guardado» se dispara con el instante del último envío aceptado, no con
  // el hecho de que la cola esté vacía: vacía está también antes de que el niño
  // haga nada, y entonces no hay nada que confirmar.
  useEffect(() => {
    if (estado?.ultimoEnvioMs == null) return;
    setConfirmando(true);
    const t = setTimeout(() => setConfirmando(false), CONFIRMACION_MS);
    return () => clearTimeout(t);
  }, [estado?.ultimoEnvioMs]);

  if (!estado) return null;
  const c = cara(estado, confirmando);
  if (c === "oculto") return null;

  const texto =
    c === "sin_conexion"
      ? textos.sinConexion
      : c === "pendiente"
        ? textos.pendiente
        : textos.guardado;

  return (
    <div
      data-cet-estado={c}
      // `status` y no `alert`: es información de fondo, no una interrupción.
      // `aria-live="polite"` espera a que el lector termine lo que está
      // diciendo en vez de cortarle a media frase mientras el niño lee.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-3 left-3 z-50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm"
      style={{
        background: "var(--color-surface, #fff)",
        borderColor: c === "sin_conexion" ? "var(--color-warn, #b45309)" : "var(--color-border, #d4d4d8)",
        color: c === "sin_conexion" ? "var(--color-warn, #b45309)" : "var(--color-muted, #52525b)",
      }}
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: "currentColor" }}
      />
      {texto}
    </div>
  );
}

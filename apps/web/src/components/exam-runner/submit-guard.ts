/**
 * Cerrojo de la entrega.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Es la PRIMERA de las tres capas contra el doble submit. Las otras dos son el
 * botón deshabilitado (cortesía visual) y el `SELECT … FOR UPDATE` del servidor
 * (la única que de verdad garantiza una sola entrega). Esta existe para que un
 * doble clic no genere dos peticiones y dos correcciones en carrera.
 *
 * Está fuera del componente por dos razones. Una: un `useState` se actualiza en
 * el render siguiente, y los dos clics de un doble clic caben de sobra en ese
 * hueco — el cerrojo tiene que ser síncrono. Dos: así se puede probar sin
 * montar React.
 *
 * REGLA QUE IMPORTA: al fallar, se ABRE otra vez. Un botón muerto con el examen
 * sin entregar es el peor final posible de esta pantalla.
 */
export class SubmitGuard {
  private inFlight: Promise<void> | null = null;
  private done = false;

  /** ¿Hay una entrega en curso o ya completada? */
  get busy(): boolean {
    return this.inFlight !== null || this.done;
  }

  get completed(): boolean {
    return this.done;
  }

  /**
   * Ejecuta `task` como máximo una vez con éxito.
   *
   * - Segunda llamada mientras la primera vuela: devuelve LA MISMA promesa, no
   *   una segunda petición.
   * - Llamada después de un éxito: no hace nada. El intento ya está entregado.
   * - Tras un fallo: se puede reintentar.
   */
  async run(task: () => Promise<void>): Promise<void> {
    if (this.done) return;
    if (this.inFlight) return this.inFlight;

    const promise = (async () => {
      try {
        await task();
        this.done = true;
      } finally {
        this.inFlight = null;
      }
    })();

    this.inFlight = promise;
    return promise;
  }

  /** Solo para el caso "ya estaba entregado": cierra el cerrojo sin ejecutar nada. */
  markCompleted(): void {
    this.done = true;
  }
}

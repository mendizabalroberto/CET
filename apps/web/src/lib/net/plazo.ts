/**
 * El único sitio de la aplicación donde se llama a `fetch`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUÉ EXISTE ESTE FICHERO
 * ===========================================================================
 * Un `fetch` sin `AbortSignal` **puede esperar para siempre**. No es teoría: es
 * lo que se midió el 27/08 en el examen. La red del colegio no se cayó —eso lo
 * gestionaba bien—, se quedó *colgada*: el TCP se estableció, la petición salió
 * y la respuesta no llegó nunca. Diez minutos simulados, un envío, cero
 * reintentos, cero avisos, y el niño mirando «Guardando» con el cronómetro
 * bajando. `docs/superpowers/specs/2026-08-27-tactil-y-red.md` §2.5.
 *
 * El navegador tiene su propio plazo, pero es del orden de minutos y no está
 * especificado: para un examen de veinticinco minutos, eso es infinito.
 *
 * ===========================================================================
 * POR QUÉ UN CUELLO DE BOTELLA Y NO «acuérdate de pasar el signal»
 * ===========================================================================
 * El fallo de hoy es de `exam-runner/api.ts`. El de mañana será de la siguiente
 * llamada que alguien escriba copiando el patrón, porque el patrón que se copia
 * es el que no tiene plazo. Por eso la regla no es «pon un plazo», es **«nadie
 * llama a `fetch` directamente»**, y `peticion-sin-plazo.test.ts` la vigila
 * recorriendo el código fuente entero.
 *
 * ===========================================================================
 * POR QUÉ NO `AbortSignal.timeout()`
 * ===========================================================================
 * Existe desde Node 17 y funcionaría en producción, pero su temporizador vive
 * en el runtime y **los relojes falsos de vitest no lo adelantan**. Un plazo
 * imposible de probar con `vi.advanceTimersByTimeAsync` es un plazo que nadie
 * volverá a comprobar. Un `setTimeout` sobre un `AbortController` hace lo mismo
 * y se puede examinar.
 */

/**
 * Plazos, en milisegundos. Cada uno responde a la pregunta 2 del spec de táctil
 * y el razonamiento está en el comentario, porque el número solo no lo explica.
 */

/**
 * Guardar una respuesta: **12 s**.
 *
 * Equivocarse aquí cuesta cero —la cola reintenta sola y el servidor es
 * idempotente por `(attempt_item, revision)`—, así que el plazo puede ser
 * agresivo. Pero no más: una red de colegio lenta pero VIVA entrega en dos o
 * tres segundos, y con 5 s convertiríamos guardados que iban a llegar en
 * reintentos, multiplicando el tráfico de treinta tabletas justo cuando la red
 * va justa. Doce segundos deja margen de sobra a lo lento y corta lo colgado
 * antes del siguiente barrido periódico (20 s), que es lo que hace que el
 * alumno vea «Reintentando» y no «Guardando».
 */
export const PLAZO_GUARDAR_MS = 12_000;

/**
 * Entregar el examen: **25 s**.
 *
 * El doble largo que guardar, y a propósito. La entrega corrige el intento
 * entero en el servidor: es la petición más cara del producto y la que más
 * legítimamente puede tardar. Y el coste de rendirse pronto NO es cero aquí —
 * es enseñarle un error a un niño cuya entrega estaba a punto de llegar—.
 * Veinticinco segundos son suficientes para que ninguna entrega sana falle, y
 * lo bastante poco para que el niño no se quede mirando un botón muerto: lo que
 * vio en la medición fue infinito.
 */
export const PLAZO_ENTREGAR_MS = 25_000;

/**
 * Arrancar el intento: **20 s**.
 *
 * `/start` materializa el examen (elige preguntas del banco y crea las filas),
 * así que es lento por naturaleza. Pero es también el único punto donde el
 * alumno no tiene NADA en pantalla salvo un cargador: sin plazo, el cuelgue se
 * ve como una app rota. Se prefiere el error con botón de reintentar.
 */
export const PLAZO_ARRANCAR_MS = 20_000;

/**
 * Pedir el resultado: **15 s**.
 *
 * Es una lectura y el examen ya está entregado y a salvo. Rendirse pronto aquí
 * no arriesga nada del trabajo del niño, solo le enseña «inténtalo otra vez».
 */
export const PLAZO_RESULTADO_MS = 15_000;

/**
 * Entrar, cambiar el PIN o la contraseña: **15 s**.
 *
 * Son llamadas del servidor a una Edge Function, así que aquí el que espera no
 * es el navegador del niño sino el Server Action — y una acción colgada deja al
 * alumno mirando un botón «Entrando…» que no vuelve nunca. Los tres sitios ya
 * tratan el fallo como `unexpected`, que es un mensaje honesto: no sabemos qué
 * pasó. Quince segundos es de sobra para un arranque en frío de la función.
 */
export const PLAZO_AUTENTICAR_MS = 15_000;

/**
 * Telemetría: **10 s**.
 *
 * El más corto porque es el que menos importa: son eventos de analítica, nadie
 * los está esperando en pantalla y la cola reintenta con backoff. Lo que NO
 * puede hacer es quedarse colgada, porque su `sending` bloquea la cola entera
 * igual que le pasaba al autoguardado del examen — el mismo fallo, en otra cola.
 */
export const PLAZO_TELEMETRIA_MS = 10_000;

/** Plazo por defecto de cualquier llamada que no declare el suyo. */
export const PLAZO_POR_DEFECTO_MS = 15_000;

/**
 * Se agotó NUESTRO plazo. Distinta de un aborto pedido desde fuera (desmontar
 * el componente) y distinta de un fallo de red: la petición pudo llegar al
 * servidor, así que quien la reciba **no debe afirmar que no llegó**.
 */
export class PlazoAgotadoError extends Error {
  readonly plazoMs: number;

  constructor(plazoMs: number, url: string) {
    super(`la peticion a ${url} no contesto en ${plazoMs} ms`);
    this.name = "PlazoAgotadoError";
    this.plazoMs = plazoMs;
  }
}

/**
 * Respuesta completa: cabeceras Y cuerpo, leídos bajo el MISMO plazo.
 *
 * Se devuelve esto y no un `Response` a propósito. `fetch` resuelve con las
 * **cabeceras**, así que un plazo que muere ahí deja la lectura del cuerpo sin
 * ninguno — y un proxy o un portal cautivo de colegio que acepta, contesta 200
 * y deja el cuerpo a medias reproduce el fallo original entero: cola bloqueada
 * y «Guardando» eterno. Al no entregar nunca un `Response`, **ningún llamante
 * puede quedarse esperando un cuerpo**, y el invariante de
 * `peticion-sin-plazo.test.ts` cubre el cuerpo sin tener que buscar `.json()`.
 */
export interface RespuestaConPlazo {
  readonly ok: boolean;
  readonly status: number;
  /**
   * Cuerpo ya leído y parseado. `null` si el servidor no mandó JSON legible —
   * eso es un bug suyo, no un problema de red, y reintentarlo daría lo mismo.
   */
  readonly cuerpo: unknown;
}

/**
 * Petición con plazo. **La única llamada a `fetch` de todo el código de la app.**
 *
 * El plazo cubre el viaje ENTERO: conexión, cabeceras y cuerpo. Se corta con
 * una carrera contra el temporizador y no solo con el `AbortSignal`, porque
 * abortar depende de que el cuerpo respete la señal y aquí no queremos depender
 * de la buena voluntad de un intermediario.
 *
 * Si además llega un `signal` de fuera (un `useEffect` que se desmonta), los dos
 * abortan: gana el primero. Un aborto externo se propaga tal cual; solo el
 * nuestro se convierte en `PlazoAgotadoError`, porque son cosas distintas y
 * quien llama las trata distinto.
 */
export async function fetchConPlazo(
  url: string,
  init: RequestInit,
  plazoMs: number = PLAZO_POR_DEFECTO_MS,
): Promise<RespuestaConPlazo> {
  const controlador = new AbortController();
  const externo = init.signal ?? null;
  let vencido = false;

  // En un objeto y no en un `let`: TypeScript estrecha a `never` una variable
  // que solo se asigna dentro de una callback.
  const disparo: { vencer: (() => void) | null } = { vencer: null };
  const vencimiento = new Promise<never>((_resolve, reject) => {
    disparo.vencer = () => reject(new PlazoAgotadoError(plazoMs, url));
  });
  // Si la petición gana la carrera nadie mira esta promesa; sin este `catch`
  // seria un rechazo no gestionado.
  void vencimiento.catch(() => undefined);

  const temporizador = setTimeout(() => {
    vencido = true;
    controlador.abort();
    disparo.vencer?.();
  }, plazoMs);

  const propagar = (): void => controlador.abort(externo?.reason as unknown);
  if (externo) {
    if (externo.aborted) propagar();
    else externo.addEventListener("abort", propagar, { once: true });
  }

  try {
    const respuesta = await Promise.race([
      fetch(url, { ...init, signal: controlador.signal }),
      vencimiento,
    ]);

    let cuerpo: unknown = null;
    try {
      cuerpo = await Promise.race([respuesta.json(), vencimiento]);
    } catch (causa) {
      // Que el plazo venza LEYENDO el cuerpo sigue siendo el plazo venciendo.
      if (causa instanceof PlazoAgotadoError) throw causa;
      if (externo?.aborted) throw causa;
      // Cuerpo vacío o ilegible: no es red. Se devuelve `null`, como antes.
      cuerpo = null;
    }

    return { ok: respuesta.ok, status: respuesta.status, cuerpo };
  } catch (causa) {
    // El orden importa: un aborto externo que llega en el mismo tick que el
    // plazo debe seguir siendo un aborto externo, porque el que llama lo está
    // esperando para no tocar estado de un componente desmontado.
    if (externo?.aborted) throw causa;
    if (causa instanceof PlazoAgotadoError) throw causa;
    if (vencido) throw new PlazoAgotadoError(plazoMs, url);
    throw causa;
  } finally {
    clearTimeout(temporizador);
    externo?.removeEventListener("abort", propagar);
  }
}

/**
 * _shared/accesos.ts — lo que `auth-pin` necesita para dejar rastro de un acceso
 * Cambridge Exam Trainer · © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO NO ESTÁ DENTRO DE `auth-pin/index.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * Por la misma razón que existe `puertas.ts`: `index.ts` importa `hash-wasm` y
 * `@supabase/supabase-js`, que `vitest.config.mjs` NO alias a propósito, así que
 * una prueba unitaria muere en su primer `import`. Todo lo que aquí se decide
 * —qué IP se manda como `inet`, qué cabeceras de geo se leen, cómo se degrada un
 * user-agent— es lógica pura que conviene poder equivocarse una sola vez y
 * probar sin red. Este fichero, igual que `puertas.ts`, no importa NADA: ni
 * siquiera zod. Solo tipos del runtime (`Headers`), que existen en Deno y en
 * Node ≥ 18.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ LA GEO VIAJA POR CABECERA Y NO POR EL CUERPO
 * ─────────────────────────────────────────────────────────────────────────────
 * `entradaDeAuthPin` es una unión de dos esquemas `.strict()`, y ese `.strict()`
 * es LO ÚNICO que impide mandar las dos puertas a la vez: un cuerpo con
 * `deviceToken` y `studentCode` no encaja en ninguna rama y muere en la
 * frontera. Meter `pais`/`region`/`ciudad` en el cuerpo obligaría a aflojar
 * `.strict()` en las dos ramas, es decir, a debilitar un invariante de seguridad
 * para transportar un dato decorativo. Van en cabeceras `x-cet-geo-*`, que las
 * pone la capa web porque Vercel se las da y esta función no las puede saber
 * (por eso existe la columna `origen`: distingue «no se sabe» de «esta capa no
 * puede saberlo»). Ver §5 del diseño.
 *
 * Y una consecuencia que no hay que perder de vista: `auth-pin` es un endpoint
 * público, así que estas cabeceras —igual que `x-forwarded-for`— las falsifica
 * cualquiera con un `curl`. Por eso aquí se acotan en longitud antes de que
 * lleguen a la base: son una pista para una persona que mira, nunca una prueba.
 */

/** Los cuatro momentos que la tabla `accesos_de_alumno` sabe distinguir. */
export type TipoDeAcceso =
  | "enlace_canjeado"
  | "login_ok"
  | "login_fallido"
  | "dispositivo_olvidado";

/**
 * Los parámetros de `public.registrar_acceso`, con los nombres EXACTOS que
 * espera PostgREST. Insertar y evaluar las reglas de detección son la misma
 * operación dentro de Postgres a propósito (§6 del diseño): los dos runtimes que
 * escriben accesos son distintos —Deno aquí, Node en la web— y una regla
 * implementada dos veces diverge.
 */
export type ParametrosDeRegistroDeAcceso = {
  p_student_id: string;
  p_device_id: string | null;
  p_tipo: TipoDeAcceso;
  p_ip: string | null;
  p_ip_hash: string | null;
  p_pais: string | null;
  p_region: string | null;
  p_ciudad: string | null;
  p_agente_familia: string | null;
  p_user_agent: string | null;
  p_origen: "web" | "edge";
  /**
   * Los tres que 0088 abrió en la tabla y 0089 añadió a la firma de la RPC.
   *
   * Van al FINAL de la firma y con `default null` en Postgres, de modo que un
   * llamante que todavía mande once argumentos sigue siendo válido. Aquí, en
   * cambio, son obligatorios: `supabase-js` llama por nombre y este tipo es lo
   * único que obliga a que la Edge Function no se deje la mitad del contexto,
   * que es exactamente el fallo del 01/09/2026 descrito más abajo.
   */
  p_latitud: number | null;
  p_longitud: number | null;
  p_zona_horaria: string | null;
};

/**
 * Techo de longitud para todo texto que llega de una cabecera falsificable. No
 * es una validación de contenido —una ciudad puede llamarse casi cualquier
 * cosa—, es un tope para que nadie use un campo decorativo como vía de escritura
 * de megabytes en la tabla más sensible del sistema.
 */
const MAX_TEXTO_DE_CABECERA = 120;

/**
 * LAS CABECERAS DE GEO LLEGAN PERCENT-CODIFICADAS, y hay que descodificarlas.
 *
 * No es simetría por gusto: `fetch` rechaza la peticion ENTERA, sin codigo de
 * error util, si una cabecera lleva bytes fuera de ASCII. Por eso la capa web
 * emite `encodeURIComponent(ciudad)`, y "Malaga" con tilde viaja como
 * `M%C3%A1laga`. Sin este paso esa cadena se guardaria tal cual en la columna
 * `ciudad`, y el fallo seria mudo: las ciudades sin acentos —la mayoria de las
 * que se prueban— entrarian perfectas, y solo se veria el destrozo el dia que
 * alguien filtrara por una que si lo lleva.
 *
 * `decodeURIComponent` LANZA con una secuencia mal formada (`%ZZ`), y esta
 * cabecera la escribe quien llama. Un `catch` que devuelve el valor crudo es lo
 * correcto: una ciudad rara en el rastro es un defecto cosmetico; una excepcion
 * aqui tumbaria el registro del acceso.
 */
function descodificar(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

function cabeceraAcotada(headers: Headers, nombre: string): string | null {
  const bruto = headers.get(nombre);
  if (bruto === null) return null;
  const limpio = descodificar(bruto).trim();
  // Vacío se degrada a NULL y no a `""`: en la tabla, «no vino» y «vino vacío»
  // son la misma cosa, y dos representaciones del mismo hecho obligan a
  // acordarse de las dos en cada consulta forense.
  if (limpio === "") return null;
  return limpio.slice(0, MAX_TEXTO_DE_CABECERA);
}

/**
 * Una coordenada que `numeric(9,6)` vaya a aceptar, o nada.
 *
 * Esta cabecera la escribe quien llama —`auth-pin` es un endpoint público— así
 * que aquí entra literalmente cualquier cosa. Y `latitud` no es `text`: un
 * `"hola"` llegaría a Postgres como argumento `numeric` y haría fallar
 * `registrar_acceso` ENTERA, con lo que se perdería el registro del acceso. Es
 * el mismo razonamiento que `ipParaInet` deja escrito para `inet`, y la misma
 * conclusión: filtrar aquí convierte ese ataque en «se registra el acceso con
 * la coordenada a NULL».
 *
 * El rango también se comprueba. Una latitud de 900 es aritméticamente un
 * número y geográficamente nada, y `numeric(9,6)` la aceptaría sin rechistar:
 * dejaría en la tabla más sensible del sistema un dato que parece medido.
 */
function coordenadaDeCabecera(headers: Headers, nombre: string, tope: number): number | null {
  const bruto = cabeceraAcotada(headers, nombre);
  if (bruto === null) return null;
  const numero = Number(bruto);
  if (!Number.isFinite(numero) || Math.abs(numero) > tope) return null;
  return numero;
}

/**
 * La geo tal y como la pone la capa web. Los campos son independientes: que
 * Vercel sepa el país y no la ciudad es normal, y guardar el país solo vale más
 * que no guardar nada.
 *
 * Las coordenadas y la zona horaria bajan por el MISMO canal de cabeceras que
 * el país, y no por el cuerpo, por la razón de la cabecera de este fichero:
 * `entradaDeAuthPin` es `.strict()` y ese `.strict()` es lo único que impide
 * presentar las dos puertas de login a la vez. Ningún dato de contexto vale lo
 * que costaría aflojarlo.
 */
export function geoDeCabeceras(headers: Headers): {
  pais: string | null;
  region: string | null;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
  zonaHoraria: string | null;
} {
  return {
    pais: cabeceraAcotada(headers, "x-cet-geo-pais"),
    region: cabeceraAcotada(headers, "x-cet-geo-region"),
    ciudad: cabeceraAcotada(headers, "x-cet-geo-ciudad"),
    latitud: coordenadaDeCabecera(headers, "x-cet-geo-latitud", 90),
    longitud: coordenadaDeCabecera(headers, "x-cet-geo-longitud", 180),
    zonaHoraria: cabeceraAcotada(headers, "x-cet-geo-zona"),
  };
}

/**
 * Forma plausible de una IP, no validación estricta.
 *
 * `accesos_de_alumno.ip` es `inet`, y `inet` RECHAZA lo que no sabe parsear con
 * un 22P02. Como `x-forwarded-for` la escribe quien llama, un `curl` con
 * `x-forwarded-for: hola` haría fallar la llamada entera a `registrar_acceso` y
 * el acceso se perdería — justo el rastro que más querríamos tener, porque lo
 * habría borrado alguien que sabe lo que hace. Filtrar aquí convierte ese ataque
 * en «se registra el acceso con la IP a NULL», que es infinitamente mejor.
 *
 * No se intenta validar rangos ni comprimir IPv6: eso lo hace `inet` bien y
 * nosotros lo haríamos mal. Solo se descarta lo que con seguridad no es una IP.
 */
const FORMA_DE_IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const FORMA_DE_IPV6 = /^[0-9A-Fa-f:]{2,45}$/;

export function ipParaInet(cabeceraForwardedFor: string | null): string | null {
  const primera = cabeceraForwardedFor?.split(",")[0]?.trim();
  if (!primera) return null;

  if (FORMA_DE_IPV4.test(primera)) {
    // Cada octeto en 0–255. Sin esto, «999.1.2.3» pasa el regex y revienta en
    // `inet`, que es exactamente el fallo que esta función existe para evitar.
    const octetos = primera.split(".").map(Number);
    return octetos.every((o) => o >= 0 && o <= 255) ? primera : null;
  }

  // IPv6 tiene que llevar al menos dos puntos para no confundirse con basura
  // hexadecimal suelta; el resto del parseo es cosa de `inet`.
  if (FORMA_DE_IPV6.test(primera) && primera.includes(":")) return primera;

  return null;
}

/**
 * MINIMIZACIÓN, no pereza: el tutor solo necesita reconocer qué tablet está
 * revocando, y para eso basta «Chrome en Android». Lo desconocido se degrada a
 * «Navegador», nunca a la cadena original.
 *
 * DUPLICADO CONSCIENTE de `apps/web/src/lib/tutor/dispositivo.ts:familiaDeAgente`.
 * No hay forma de compartirlo: aquello corre en Node dentro del `apps/web` y
 * esto corre en Deno, sin acceso al workspace. La duplicación es aceptable
 * porque esta función es una etiqueta que lee una persona; las que NO se
 * duplican —y por eso viven dentro de Postgres (§6)— son las reglas de
 * detección, donde dos implementaciones que divergen dan dos verdades distintas
 * sobre el mismo alumno. Si un día cambia una copia, la otra solo enseña
 * «Navegador» de más, y eso no rompe nada.
 *
 * El user-agent ENTERO sí se guarda, pero en la columna `user_agent`, que queda
 * fuera del GRANT de `authenticated` (§4): nunca sale hacia un navegador.
 */
export function familiaDeAgente(userAgent: string | null): string {
  if (userAgent === null || userAgent.trim() === "") return "Navegador";

  const navegador =
    /Edg\//.test(userAgent) ? "Edge"
    : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox"
    : /Safari\//.test(userAgent) ? "Safari"
    : null;

  const sistema =
    /Android/.test(userAgent) ? "Android"
    : /iPhone|iPad|iPod/.test(userAgent) ? "iPad o iPhone"
    : /Windows/.test(userAgent) ? "Windows"
    : /Mac OS X/.test(userAgent) ? "Mac"
    : /Linux/.test(userAgent) ? "Linux"
    : null;

  if (navegador === null || sistema === null) return "Navegador";
  return `${navegador} en ${sistema}`;
}

/**
 * Todo lo que se puede saber de la petición ANTES de saber quién es el alumno.
 * Se calcula una sola vez por invocación y se reutiliza en las dos salidas —la
 * buena y la mala— para que ninguna rama pueda registrar menos que la otra: si
 * el login fallido guardara menos contexto que el correcto, el archivo serviría
 * justo para lo contrario de para lo que se creó.
 */
export type ContextoDeAcceso = {
  ip: string | null;
  ipHash: string | null;
  pais: string | null;
  region: string | null;
  ciudad: string | null;
  latitud: number | null;
  longitud: number | null;
  zonaHoraria: string | null;
  agenteFamilia: string;
  userAgent: string | null;
};

/**
 * La IP y el agente REALES del cliente, que esta función no puede ver por sí
 * misma.
 *
 * MEDIDO EN PRODUCCIÓN EL 01/09/2026, en el primer login real de un alumno:
 * el canje registró `190.186.86.236` y `Chrome/151` desde la web, y un segundo
 * después este login registró `98.93.183.199` y `node`. Mismo niño, mismo
 * navegador, mismo clic.
 *
 * La razón es que nadie llega aquí desde un navegador: `signInStudent` y
 * `canjearEnlace` corren en el servidor de Vercel y llaman a esta función de
 * servidor a servidor. Lo que llega en `x-forwarded-for` es la IP de salida de
 * Vercel, y en `user-agent`, el `fetch` de Node. Por eso la capa web manda las
 * dos por cabecera, igual que ya mandaba la geo.
 *
 * Se PREFIEREN a lo que se ve, y no al revés: lo que se ve aquí es siempre el
 * proxy. Cuando no vengan —una llamada directa a la función, sin la web por
 * delante— se cae a `x-forwarded-for`, que entonces sí es el llamante.
 *
 * Esto no es solo cosmética de una columna: `IP_RATE_LIMIT` cuenta fallos por
 * `ip_hash`, y con la IP de Vercel en todas las filas ese contador no era por
 * IP sino GLOBAL para toda la plataforma.
 */
function preferida(headers: Headers, cabecera: string, visto: string | null): string | null {
  const bruto = headers.get(cabecera);
  if (bruto === null || bruto.trim() === "") return visto;
  return descodificar(bruto).trim() || visto;
}

export function contextoDeAcceso(headers: Headers, ipHash: string | null): ContextoDeAcceso {
  const userAgent = preferida(headers, "x-cet-user-agent", headers.get("user-agent"));
  const geo = geoDeCabeceras(headers);
  return {
    ip: ipParaInet(preferida(headers, "x-cet-ip", headers.get("x-forwarded-for"))),
    ipHash,
    ...geo,
    agenteFamilia: familiaDeAgente(userAgent),
    // El user-agent entero, sin acotar: es un dato forense que solo lee
    // `service_role`, y truncarlo lo inutilizaría para lo único que sirve.
    userAgent,
  };
}

/**
 * Traduce el contexto al cuerpo que espera PostgREST. `p_origen` es SIEMPRE
 * 'edge' desde aquí: esta función no tiene forma de conocer la geo por sí misma
 * —se la dan por cabecera—, y esa distinción es justamente lo que la columna
 * `origen` existe para conservar.
 */
export function parametrosDeAcceso(
  contexto: ContextoDeAcceso,
  alumno: { studentId: string; deviceId: string | null; tipo: TipoDeAcceso },
): ParametrosDeRegistroDeAcceso {
  return {
    p_student_id: alumno.studentId,
    p_device_id: alumno.deviceId,
    p_tipo: alumno.tipo,
    p_ip: contexto.ip,
    p_ip_hash: contexto.ipHash,
    p_pais: contexto.pais,
    p_region: contexto.region,
    p_ciudad: contexto.ciudad,
    p_agente_familia: contexto.agenteFamilia,
    p_user_agent: contexto.userAgent,
    p_origen: "edge",
    p_latitud: contexto.latitud,
    p_longitud: contexto.longitud,
    p_zona_horaria: contexto.zonaHoraria,
  };
}

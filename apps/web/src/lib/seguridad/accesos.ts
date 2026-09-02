/**
 * Registro de accesos de alumno — la mitad que escribe Next.js.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * POR QUE EXISTE ESTE MODULO
 * ===========================================================================
 * Un hijo de tutor entra por una cookie de dispositivo que nace del canje de un
 * enlace de un solo uso, y ese enlace es un *bearer token* de siete dias que
 * viaja por WhatsApp. Quien lo tenga fija un PIN nuevo y se queda con la cuenta.
 * Hasta ahora no quedaba rastro de DESDE DONDE se canjeo ni DESDE DONDE se
 * entra despues: `audit_log` deja `ip_hash` y `user_agent` en NULL en el camino
 * del tutor, y `auth_attempts` es municion del lockout, no un archivo.
 *
 * ===========================================================================
 * LA IP SE GUARDA EN CLARO. ES UNA DECISION, NO UN DESCUIDO.
 * ===========================================================================
 * Decision explicita del propietario del producto el 2026-09-01, con su coste
 * escrito: `accesos_de_alumno` es un historial de ubicacion permanente de un
 * menor y pasa a ser la tabla mas sensible del sistema.
 *
 * La compensacion NO es la retencion, es el control de acceso: `ip`, `ip_hash`
 * y `user_agent` quedan fuera del GRANT de `authenticated`, asi que ese dato no
 * puede salir jamas en una respuesta HTTP hacia un navegador —ni con un XSS en
 * el panel del tutor—. Solo `service_role` los ve, y por eso este modulo exige
 * que se le pase un cliente de servicio: con el de sesion la RPC ni se alcanza.
 *
 * Es el mismo patron que ya protege `attempt_items.answer_key`.
 *
 * ===========================================================================
 * NINGUNA ESCRITURA DE AQUI PUEDE TUMBAR UN LOGIN NI UN CANJE
 * ===========================================================================
 * Mismo contrato que `auditar()` en `lib/tutor/actions.ts`: NO LANZA, grita en
 * `console.error` con un prefijo greppable. Un rastro perdido es un incidente
 * de cumplimiento; un nino que no puede entrar es un producto roto, y de los
 * dos solo el segundo lo sufre el nino. Por eso `registrarAcceso` devuelve
 * `void` y se llama sin `try`: no hay nada que un llamante pueda decidir.
 */
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

/** El enum `acceso_tipo` de la base, replicado para que TypeScript lo vigile. */
export type TipoDeAcceso =
  | "enlace_canjeado"
  | "login_ok"
  | "login_fallido"
  | "dispositivo_olvidado";

/**
 * Que capa escribio la fila.
 *
 * No es decorativo: la web (Vercel) conoce la geo y la Edge Function no. Sin
 * esta columna, «ciudad NULL» mezclaria «no se sabe» con «esa capa no puede
 * saberlo», y la segunda no es una laguna de datos sino una propiedad del
 * sistema. Este modulo solo escribe `web`; `edge` es de `auth-pin`.
 */
const ORIGEN_WEB = "web";

export interface Geo {
  readonly pais: string | null;
  readonly region: string | null;
  readonly ciudad: string | null;
}

export const GEO_DESCONOCIDA: Geo = { pais: null, region: null, ciudad: null };

/* ========================================================================== */
/* Lectura de cabeceras                                                       */
/* ========================================================================== */

function limpia(valor: string | null | undefined): string | null {
  const v = valor?.trim();
  return v ? v : null;
}

/**
 * La geo que pone el borde de Vercel delante de la funcion.
 *
 * VIENE PERCENT-CODIFICADA. Vercel emite `x-vercel-ip-city` en ASCII escapado
 * (`M%C3%A1laga`) porque una cabecera HTTP no admite bytes fuera de ASCII, y
 * guardar «M%C3%A1laga» en la columna `ciudad` seria guardar basura que el
 * tutor leeria tal cual en su panel. Se decodifica aqui, una sola vez.
 *
 * Un `%` suelto —que no puede venir de Vercel, pero si de alguien que llame a
 * esta aplicacion a mano— hace saltar `decodeURIComponent`. Se cae al valor
 * literal en vez de propagar la excepcion: la geo es contexto forense, y ningun
 * dato de contexto merece tumbar la peticion que lo acompana.
 */
function decodificar(valor: string | null): string | null {
  if (valor === null) return null;
  try {
    return limpia(decodeURIComponent(valor));
  } catch {
    return valor;
  }
}

export function leerGeo(cabeceras: Headers): Geo {
  return {
    pais: decodificar(limpia(cabeceras.get("x-vercel-ip-country"))),
    region: decodificar(limpia(cabeceras.get("x-vercel-ip-country-region"))),
    ciudad: decodificar(limpia(cabeceras.get("x-vercel-ip-city"))),
  };
}

/**
 * Las cabeceras con las que la geo baja hasta `auth-pin`.
 *
 * LA GEO VIAJA POR CABECERA, NUNCA POR EL CUERPO, y esto no es una preferencia
 * de estilo. `entradaDeAuthPin` es una union de dos esquemas `.strict()`, y ese
 * `.strict()` es exactamente lo que impide presentar las dos puertas a la vez
 * —cookie de dispositivo y colegio+codigo— en una sola peticion. Meter
 * `pais`/`region`/`ciudad` en el cuerpo obligaria a aflojarlo en las dos ramas:
 * seria debilitar un invariante de seguridad para transportar un dato de
 * contexto. Si alguna vez estos tres valores aparecen dentro de un
 * `JSON.stringify`, lo que hay que arreglar es la llamada, no el esquema.
 *
 * Se vuelven a percent-codificar: `fetch` rechaza la peticion ENTERA si una
 * cabecera lleva un byte fuera de ASCII, y devuelve un error sin codigo que no
 * se parece en nada a la causa —el mismo fallo que el 28 de agosto de 2026 dejo
 * a todos los alumnos sin poder empezar un examen por una «o» acentuada en
 * `x-cet-admin-reason`—. Quien reciba estas cabeceras las decodifica con
 * `decodeURIComponent`, igual que se hace arriba con las de Vercel.
 *
 * Lo desconocido se OMITE en lugar de mandarse vacio: una cabecera ausente dice
 * «no lo se» sin ambiguedad, y una cadena vacia habria que interpretarla.
 */
export function cabecerasDeGeo(geo: Geo): Record<string, string> {
  const salida: Record<string, string> = {};
  if (geo.pais !== null) salida["x-cet-geo-pais"] = encodeURIComponent(geo.pais);
  if (geo.region !== null) salida["x-cet-geo-region"] = encodeURIComponent(geo.region);
  if (geo.ciudad !== null) salida["x-cet-geo-ciudad"] = encodeURIComponent(geo.ciudad);
  return salida;
}

/**
 * Todo el contexto del cliente, para que `auth-pin` no tenga que adivinarlo.
 *
 * MEDIDO EN PRODUCCION EL 01/09/2026, con el primer login real de un alumno:
 *
 *   origen  web    ip 190.186.86.236   user_agent  Mozilla/5.0 (Windows NT...)
 *   origen  edge   ip 98.93.183.199    user_agent  node
 *
 * Un segundo de diferencia, el mismo navegador, y dos IP distintas. La causa es
 * estructural y no se arregla en la Edge Function: `signInStudent` y
 * `canjearEnlace` corren EN EL SERVIDOR, y llaman a `auth-pin` de servidor a
 * servidor. Lo que aquella ve en `x-forwarded-for` es la IP de salida de
 * Vercel, y en `user-agent`, el del `fetch` de Node. Del nino, nada.
 *
 * Le baja la geo desde el 01/09 y por eso el pais salia bien mientras la IP
 * salia mal: se le estaba mandando una de las tres piezas del contexto.
 *
 * LO QUE ESTO ARREGLA, Y NO ES SOLO LA COLUMNA `ip`:
 *
 *  - `accesos_de_alumno.ip` y `.user_agent` de toda fila de origen `edge`.
 *  - La senal `ip_multicuenta`, que cuenta alumnos distintos por IP: con la IP
 *    de Vercel disparaba SIEMPRE en cuanto hubiera mas de tres alumnos.
 *  - Y el fallo mas viejo y mas grave, anterior a esta tabla:
 *    `auth-pin` limita a `IP_RATE_LIMIT = 30` los fallos por `ip_hash`, y como
 *    todos los logins llegaban con la IP de Vercel, ese contador NO era por IP
 *    sino GLOBAL. Treinta PIN fallidos entre todos los ninos de la plataforma
 *    en quince minutos —un aula cualquiera un lunes— y dejaba de entrar todo el
 *    mundo. La defensa se leia «por IP» y se comportaba «por plataforma».
 *
 * SOBRE LA CONFIANZA: quien tenga la clave publicable puede falsear
 * `x-cet-ip`. Ya podia falsear `x-forwarded-for`, asi que esto no abre nada
 * nuevo, y `rate-limit.ts` ya advierte de que esa cabecera es para limitar
 * tasa y «jamas para autorizar». Lo que de verdad para un ataque contra un PIN
 * concreto es el lockout POR ALUMNO, que cuenta sobre la fila de `students` y
 * al que nada de esto le afecta.
 *
 * Percent-codificadas por el mismo motivo que la geo: un `user-agent` con un
 * byte fuera de ASCII haria que `fetch` rechazara la peticion entera.
 */
export function cabecerasDeContexto(contexto: ContextoDeAcceso): Record<string, string> {
  const salida = cabecerasDeGeo(contexto.geo);
  if (contexto.ip !== null) salida["x-cet-ip"] = encodeURIComponent(contexto.ip);
  if (contexto.userAgent !== null) {
    salida["x-cet-user-agent"] = encodeURIComponent(contexto.userAgent);
  }
  return salida;
}

/**
 * La IP del cliente segun `x-forwarded-for`.
 *
 * FALSIFICABLE si algo por delante del proxy de confianza la deja pasar, igual
 * que advierte `clientKeyFromHeaders` en `lib/security/rate-limit.ts`. Por eso
 * lo que se construye con ella son SENALES —«esto merece una mirada»— y nunca
 * una autorizacion ni un bloqueo: bloquear por geografia deja sin deberes al
 * nino que esta en casa de su abuela, y eso pasa mucho mas a menudo que un robo
 * de cuenta.
 *
 * Solo el primer salto: los siguientes los anaden los proxies intermedios y no
 * dicen nada del cliente.
 */
export function leerIp(cabeceras: Headers): string | null {
  const forwarded = cabeceras.get("x-forwarded-for");
  const primera = limpia(forwarded?.split(",")[0]);
  return primera ?? limpia(cabeceras.get("x-real-ip"));
}

/**
 * `sha256(ip + sal)`, y el salt NO vive en Postgres a proposito: lo calcula
 * quien llama porque `CET_IP_HASH_SALT` esta en el entorno de las funciones, y
 * copiarlo a la base seria darle un sitio mas del que escaparse.
 *
 * Sin sal —o con una sal corta— devuelve `null` y no se guarda hash. El espacio
 * IPv4 tiene 2^32 direcciones: un sha256 sin sal secreta se revierte con una
 * tabla precalculada en minutos, asi que seria guardar la IP con un disfraz.
 * Que aqui haya ademas una columna `ip` en claro no lo hace inofensivo: el hash
 * es lo unico que sobreviviria a una purga de esa columna, y comparar por hash
 * permite responder «¿es la misma red?» sin LEER la direccion de un menor.
 */
export function hashDeIp(ip: string | null): string | null {
  // `no-restricted-properties` empuja hacia `lib/supabase/env.ts`, y aqui hay
  // que saltarselo a proposito: ese modulo lo importa tambien codigo que acaba
  // en el navegador —de ahi que solo maneje `NEXT_PUBLIC_*`— y esta sal es un
  // secreto de servidor. Meterla alli seria acercarla justo al sitio del que
  // este diseno la mantiene lejos. La regla existe por
  // `SUPABASE_SERVICE_ROLE_KEY`, que no es esto, y el mismo salto ya se hace en
  // `app/api/attempts/_context.ts` por el mismo motivo.
  const salt = process.env.CET_IP_HASH_SALT;
  if (!salt || salt.length < 16) return null;
  if (ip === null) return null;
  return createHash("sha256").update(`${ip}${salt}`).digest("hex");
}

/**
 * El user-agent COMPLETO, acotado a 512 caracteres porque la columna es `text`
 * pero nadie necesita guardar 8 KB de una cadena que controla el cliente.
 *
 * Que aqui se guarde entero y en `student_devices` solo la familia no es una
 * incoherencia: son dos columnas con dos publicos. `student_devices.agente_familia`
 * lo LEE el tutor en su panel, y para reconocer que tablet revoca le basta
 * «Chrome en Android». Esta columna no la alcanza ninguna sesion de navegador.
 */
export function leerUserAgent(cabeceras: Headers): string | null {
  const ua = cabeceras.get("user-agent");
  return ua && ua.trim() !== "" ? ua.slice(0, 512) : null;
}

/* ========================================================================== */
/* El contexto completo, leido una sola vez                                   */
/* ========================================================================== */

export interface ContextoDeAcceso {
  readonly ip: string | null;
  readonly ipHash: string | null;
  readonly geo: Geo;
  readonly userAgent: string | null;
}

/**
 * Todo lo que una peticion sabe de quien la hace, resuelto de una vez.
 *
 * Se agrupa porque las cuatro piezas se leen SIEMPRE juntas y de las MISMAS
 * cabeceras: separadas, es cuestion de tiempo que un llamante guarde la IP y se
 * deje la geo, y una fila con IP y sin pais no dice lo mismo que una con las
 * dos —parece que el borde no supo resolverla cuando en realidad nadie
 * pregunto—.
 */
export function contextoDeAcceso(cabeceras: Headers): ContextoDeAcceso {
  const ip = leerIp(cabeceras);
  return {
    ip,
    ipHash: hashDeIp(ip),
    geo: leerGeo(cabeceras),
    userAgent: leerUserAgent(cabeceras),
  };
}

/* ========================================================================== */
/* La escritura                                                               */
/* ========================================================================== */

export interface RegistroDeAcceso {
  readonly studentId: string;
  /** El dispositivo implicado, si lo hay. Un login fallido no tiene ninguno. */
  readonly deviceId: string | null;
  readonly tipo: TipoDeAcceso;
  readonly contexto: ContextoDeAcceso;
  /** La familia legible, la misma que ve el tutor en su lista de aparatos. */
  readonly agenteFamilia: string | null;
}

/**
 * Inserta la fila y evalua las reglas de deteccion EN LA MISMA OPERACION.
 *
 * Las reglas viven dentro de Postgres y no aqui por una razon concreta: los dos
 * que escriben accesos son runtimes distintos —esta aplicacion en Node y
 * `auth-pin` en Deno— y una regla implementada dos veces diverge. Es el mismo
 * motivo por el que los parametros de coste de Argon2id estan centralizados en
 * un unico sitio de este proyecto. Asi que insertar y evaluar son una sola
 * llamada, y el resultado vuelve en la columna `senales` de la propia fila.
 *
 * Se llama al envoltorio de `public` y NO a `app.registrar_acceso`: PostgREST
 * no expone el esquema `app` —ni debe—, y darlo por expuesto es el fallo que ya
 * se cometio en 0023, en 0063 y en 0077. Aqui no hay escalera de reserva como
 * en `auditar()` porque esta funcion nace sabiendolo.
 *
 * NO LANZA. Ver la cabecera del fichero: si esta escritura pudiera abortar un
 * canje, la tabla que existe para proteger al nino seria la que le deja fuera.
 * Tampoco se registra la IP en el `console.error`: un log no tiene el GRANT por
 * columna que protege la tabla, asi que volcarla ahi anularia el diseno entero.
 */
export async function registrarAcceso(
  admin: SupabaseClient,
  registro: RegistroDeAcceso,
): Promise<void> {
  try {
    const { error } = await admin.rpc("registrar_acceso", {
      p_student_id: registro.studentId,
      p_device_id: registro.deviceId,
      p_tipo: registro.tipo,
      p_ip: registro.contexto.ip,
      p_ip_hash: registro.contexto.ipHash,
      p_pais: registro.contexto.geo.pais,
      p_region: registro.contexto.geo.region,
      p_ciudad: registro.contexto.geo.ciudad,
      p_agente_familia: registro.agenteFamilia,
      p_user_agent: registro.contexto.userAgent,
      p_origen: ORIGEN_WEB,
    });

    if (error !== null) {
      console.error(
        `[cet] ACCESO NO REGISTRADO tipo=${registro.tipo} student=${registro.studentId} device=${registro.deviceId ?? "null"} code=${error.code}`,
        error.message,
      );
    }
  } catch (causa) {
    // La red tambien cuenta. `supabase-js` devuelve el error de PostgREST en
    // `{ error }`, pero un DNS caido o un plazo agotado si LANZAN, y ese es
    // justo el momento en el que el canje no debe caerse por el rastro.
    console.error(
      `[cet] ACCESO NO REGISTRADO (inalcanzable) tipo=${registro.tipo} student=${registro.studentId}`,
      causa instanceof Error ? causa.message : String(causa),
    );
  }
}

/**
 * Limitador de tasa en memoria.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * QUÉ ES Y QUÉ NO ES
 * ---------------------------------------------------------------------------
 * Esto es un amortiguador de primera línea, NO la defensa contra fuerza bruta.
 * Vive en la memoria de una instancia serverless: con varias instancias, cada
 * una lleva su propia cuenta, y en un despliegue nuevo se pierde todo.
 *
 * La defensa REAL contra el ataque a los PIN es doble y vive en la base de
 * datos (DATA_MODEL §8):
 *   - `students.failed_pin_attempts` + `students.locked_until` (lockout por
 *     cuenta, resistente a que el atacante cambie de IP).
 *   - `auth_attempts` (histórico por colegio+código+IP para detección).
 *
 * Documentar esta limitación es más útil que fingir que no existe: alguien
 * podría dar por cubierto el rate limiting y no implementarlo en la Edge
 * Function, que es donde de verdad hace falta.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Evita que el mapa crezca sin límite en una instancia de vida larga. */
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_BUCKETS) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
    // Si aun así sigue lleno (ataque distribuido), se vacía entero: perder la
    // cuenta es preferible a agotar la memoria de la instancia.
    if (buckets.size > MAX_BUCKETS) buckets.clear();
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Identificador aproximado del cliente para el limitador.
 *
 * Se lee de `x-forwarded-for`, que es falsificable si algo delante del proxy de
 * confianza lo deja pasar. Por eso solo se usa para limitar tasa, jamás para
 * autorizar. Para persistir, se hashea con sal (nunca la IP en claro).
 */
export function clientKeyFromHeaders(h: Headers): string {
  const forwarded = h.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || h.get("x-real-ip") || "unknown";
}

/**
 * Los Zod de la cadena de invitacion del tutor.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Se validan en AMBOS extremos, como el resto del proyecto (MASTER_PLAN §3): el
 * formulario los usa para no molestar al usuario, y la Server Action los vuelve
 * a usar porque el navegador no es de fiar.
 *
 * `pinSchema` NO se redefine aqui: se importa de `@/lib/auth/schemas`. Dos
 * definiciones de la misma regla de credencial es como divergen — una acepta un
 * PIN de tres digitos que la otra rechaza, y el que decide es el que corre
 * ultimo.
 */
import { z } from "zod";

import { pinSchema } from "@/lib/auth/schemas";

/**
 * El token es OPACO: 43 caracteres de base64url, que es exactamente lo que
 * `generarToken()` produce a partir de 32 bytes.
 *
 * Acotarlo aqui, antes de tocar la base de datos, es lo que impide que una
 * entrada de 10 MB llegue hasta un `where token_hash = ...` o hasta el
 * verificador de Argon2id de la Edge Function. Y `+` y `/` se rechazan a
 * proposito: base64 clasico no es base64url, y aceptar los dos alfabetos
 * significa que dos cadenas distintas pueden referirse al mismo secreto.
 */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/**
 * Caracteres de control. Un nombre con un NUL o un retorno de carro no es un
 * nombre: es un intento de partir una linea de log o de romper la tabla que lo
 * pinta. Mismo criterio que `registrationSchema` en `@/lib/auth/schemas`.
 */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * La invitacion del superadmin. Un solo campo: a que buzon va.
 *
 * El correo se normaliza a minusculas aqui porque en la base la columna es
 * `citext` y la comparacion ya es insensible; hacerlo tambien aqui evita que la
 * fila guarde una variante y el formulario muestre otra.
 */
export const invitarTutorSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export type InvitarTutorInput = z.infer<typeof invitarTutorSchema>;

/**
 * El alta del tutor. NO hay campo de correo, y no es un descuido: el correo
 * sale de la invitacion. Si viniera del formulario, un enlace reenviado por
 * error le fabricaria una cuenta a quien lo reenvio.
 *
 * La contrasena no lleva reglas de complejidad barrocas: una longitud minima
 * generosa protege mas que exigir un simbolo, y ademas es lo que el usuario
 * puede cumplir sin apuntarla en un papel.
 */
export const altaDeTutorSchema = z.object({
  token: tokenSchema,
  fullName: z
    .string()
    .trim()
    .min(2)
    .max(120)
    // Mismos caracteres de control que rechaza `registrationSchema`: un nombre
    // con un NUL o un retorno de carro no es un nombre, es un intento de partir
    // una linea de log.
    .refine((v) => !CONTROL_CHARS.test(v), { message: "invalid_chars" }),
  password: z.string().min(10).max(1024),
});
export type AltaDeTutorInput = z.infer<typeof altaDeTutorSchema>;

/**
 * El alta de un hijo. `fechaNacimiento` se pide y se valida, pero NO se
 * persiste: hoy `students` no tiene columna para ella y guardar la fecha de
 * nacimiento de un menor "por si acaso" es justo lo que prohibe la
 * minimizacion de datos (MASTER_PLAN §9). Sirve para que el tutor confirme de
 * quien habla y para cuadrar el curso.
 */
export const crearHijoSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .refine((v) => !CONTROL_CHARS.test(v), { message: "invalid_chars" }),
  // `YYYY-MM-DD` de un `<input type="date">`. Se comprueba que sea una fecha
  // real y pasada: un nacimiento en el futuro es un error de tecleo, no un dato.
  fechaNacimiento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const t = Date.parse(`${v}T00:00:00Z`);
      return Number.isFinite(t) && t < Date.now();
    }, { message: "fecha_invalida" }),
  yearLevel: z.coerce.number().int().min(1).max(13),
});
export type CrearHijoInput = z.infer<typeof crearHijoSchema>;

/**
 * El canje del enlace por parte del nino. Es la unica entrada del sistema que
 * FIJA un PIN sin exigir el anterior, y puede permitirselo porque el enlace de
 * un solo uso ya es la prueba de identidad.
 */
export const canjeDeEnlaceSchema = z
  .object({ token: tokenSchema, pin: pinSchema, pinRepetido: pinSchema })
  .refine((v) => v.pin === v.pinRepetido, {
    // El mensaje lo pone la pantalla desde el diccionario; aqui solo el camino
    // del campo, para que el formulario sepa donde pintar el error.
    path: ["pinRepetido"],
    message: "no_coincide",
  });
export type CanjeDeEnlaceInput = z.infer<typeof canjeDeEnlaceSchema>;

/** «Olvidar este dispositivo». Solo el id de la fila de `student_devices`. */
export const olvidarDispositivoSchema = z.object({
  deviceId: z.string().uuid(),
});
export type OlvidarDispositivoInput = z.infer<typeof olvidarDispositivoSchema>;

/**
 * Y1-Y6 primaria, Y7-Y13 secundaria. La etapa decide cuantas casillas de PIN se
 * dibujan (AD-4), y por eso se deriva del curso y no se le pregunta al tutor:
 * un padre no tiene por que saber que significa "stage".
 */
export function etapaDeCurso(yearLevel: number): "primary" | "secondary" {
  return yearLevel <= 6 ? "primary" : "secondary";
}

export function longitudDePin(etapa: "primary" | "secondary"): 4 | 6 {
  return etapa === "primary" ? 4 : 6;
}

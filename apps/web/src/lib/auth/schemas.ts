/**
 * Esquemas Zod de autenticación. Se validan en AMBOS extremos (MASTER_PLAN §3):
 * el formulario los usa para no molestar al usuario, y la Server Action los
 * vuelve a usar porque el navegador no es de fiar.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 */
import { z } from "zod";

/** Longitudes de PIN permitidas por AD-4 (`schools.pin_length_*`, 4..8). */
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 8;

/**
 * Código de alumno. No se normaliza a mayúsculas aquí porque en la base de
 * datos la columna es `citext`: la comparación ya es insensible a mayúsculas y
 * hacerlo aquí solo añadiría una forma más de que cliente y servidor difieran.
 */
export const studentCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  // Alfanumérico, guion, guion bajo y punto. Nada más: cierra la puerta a que
  // un código se use como vector de inyección en logs o en correos.
  .regex(/^[A-Za-z0-9._-]+$/);

export const pinSchema = z
  .string()
  .trim()
  .min(MIN_PIN_LENGTH)
  .max(MAX_PIN_LENGTH)
  .regex(/^\d+$/);

export const studentLoginSchema = z.object({
  schoolId: z.string().uuid(),
  studentCode: studentCodeSchema,
  pin: pinSchema,
});
export type StudentLoginInput = z.infer<typeof studentLoginSchema>;

export const staffLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // No se imponen reglas de complejidad al ENTRAR: eso corresponde al alta.
  // Validar longitud mínima en el login solo sirve para decirle a un atacante
  // qué contraseñas ni se han comprobado.
  password: z.string().min(1).max(1024),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

/**
 * PINs manifiestamente adivinables. La lista es corta a propósito: bloquear
 * demasiadas combinaciones en un espacio de 10.000 reduce la entropía real.
 * La defensa principal contra la fuerza bruta es el lockout, no esta lista.
 */
const WEAK_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "0123", "1212", "2580", "1122",
  "000000", "111111", "123456", "654321", "121212", "112233", "123123",
]);

export function isWeakPin(pin: string): boolean {
  if (WEAK_PINS.has(pin)) return true;
  // Todos los dígitos iguales, sea cual sea la longitud.
  if (new Set(pin).size === 1) return true;
  // Secuencia ascendente o descendente completa (2345, 98765…).
  const digits = [...pin].map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? 0) + 1);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? 0) - 1);
  return ascending || descending;
}

export const pinChangeSchema = z
  .object({
    currentPin: pinSchema,
    newPin: pinSchema,
    confirmPin: pinSchema,
  })
  .refine((v) => v.newPin === v.confirmPin, { path: ["confirmPin"], message: "pin_mismatch" })
  .refine((v) => !isWeakPin(v.newPin), { path: ["newPin"], message: "pin_too_weak" })
  .refine((v) => v.newPin !== v.currentPin, { path: ["newPin"], message: "pin_too_weak" });
export type PinChangeInput = z.infer<typeof pinChangeSchema>;

/**
 * Caracteres de control. En la nota se toleran el tabulador y los saltos de
 * línea, que ahí son legítimos; en un nombre no se tolera ninguno.
 *
 * Un `full_name` con un NUL o un retorno de carro no es un nombre: es un intento
 * de partir una línea de log —el `console.warn` de la acción escribe ese valor—
 * o de romper la tabla de la cola del panel del administrador.
 */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const CONTROL_CHARS_ESTRICTO = /[\u0000-\u001F\u007F]/;

/**
 * Prefijos que Excel y Google Sheets interpretan como FÓRMULA al abrir un CSV.
 * El panel del administrador exporta la cola de solicitudes, y un `full_name`
 * que empiece por `=` se convierte en código ejecutable en la hoja de quien la
 * abre (CSV injection). Se rechaza en la entrada porque es donde se sabe que el
 * dato es un nombre de persona; escaparlo en cada consumidor es la vía por la
 * que uno de ellos se olvida.
 */
const PREFIJO_FORMULA = /^[=+\-@]/;

/**
 * ENDURECIDO AL PASAR EL ALTA A SERVICE_ROLE
 * ---------------------------------------------------------------------------
 * Mientras la inserción la hacía el cliente de sesión, la RLS era una segunda
 * barrera detrás de este esquema. Ya no la hay: `submitRegistration` escribe
 * con `service_role`, así que ESTA validación es la única frontera entre un
 * `fetch` a la Server Action y una fila en la base de datos. De ahí las tres
 * comprobaciones nuevas sobre `fullName` y `note`, que antes eran redundantes
 * y ahora no lo son.
 *
 * `schoolId` sigue siendo solo un uuid aquí a propósito: que ese colegio EXISTA
 * y esté `active` no se puede saber sin consultar la base, y esa comprobación
 * vive en la acción (contra `list_active_schools()`). Un esquema no consulta.
 */
export const registrationSchema = z.object({
  schoolId: z.string().uuid(),
  fullName: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .refine((v) => !CONTROL_CHARS_ESTRICTO.test(v), { message: "invalid_chars" })
    .refine((v) => !PREFIJO_FORMULA.test(v), { message: "invalid_chars" }),
  requestedYearLevel: z.coerce.number().int().min(1).max(13),
  guardianEmail: z.string().trim().toLowerCase().email().max(254),
  // Campo libre: se acota la longitud para que no sirva de vertedero.
  note: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => !CONTROL_CHARS.test(v), { message: "invalid_chars" })
    .optional()
    .or(z.literal("")),
  // Checkbox HTML: presente = "on", ausente = undefined.
  consent: z.literal("on", { errorMap: () => ({ message: "consent_required" }) }),
});
export type RegistrationInput = z.infer<typeof registrationSchema>;

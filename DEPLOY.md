# Despliegue

> © 2026 Roberto Mendizabal. Todos los derechos reservados.

Tres pasos, en este orden. El primero es el único que bloquea al resto: sin los
secretos de las Edge Functions, ningún alumno puede iniciar sesión.

---

## 1 · Secretos de las Edge Functions (bloquea el login)

**Panel de Supabase → Project Settings → Edge Functions → Secrets.**

Los valores están en `secrets/supabase-edge.env`, que no se versiona. Ese fichero
contiene EXACTAMENTE los dos que van aquí y ninguno más.

| Secreto | Qué hace | Si cambia |
|---|---|---|
| `CET_STUDENT_PASSWORD_SECRET` | Deriva la contraseña sintética de cada alumno con `HMAC-SHA256(secreto, profile_id)`. Es lo que `auth-pin` recalcula tras verificar el PIN. | **Todos los alumnos pierden el acceso.** Hay que reaprovisionar cada cuenta con `student-pin` (`op: "provision"`). |
| `CET_IP_HASH_SALT` | Anonimiza las IP en `auth_attempts` antes de guardarlas. Nunca se almacena una IP en claro. | Los hashes antiguos dejan de correlacionar con los nuevos. No se pierde nada más. |

`ADMIN_PASSWORD` **no va aquí.** No lo lee ninguna Edge Function: es tu propia
contraseña de acceso, ya aplicada a la cuenta. Guárdala en un gestor de
contraseñas y bórrala del fichero cuando la tengas a salvo.

Mientras falten, las funciones responden `500` con el motivo escrito en el log,
no con un error incomprensible.

---

## 2 · Vercel

Vercel necesita autorizarse con tu cuenta, así que este paso lo haces tú.

**Opción A — desde el panel (recomendada, una sola vez):**

1. [vercel.com/new](https://vercel.com/new) → importar `mendizabalroberto/CET`.
2. Vercel detecta el `vercel.json` de la raíz. **No cambies el Root Directory**:
   el build corre desde la raíz porque es un monorepo con Turborepo.
3. Variables de entorno (Production **y** Preview):

   ```
   NEXT_PUBLIC_SUPABASE_URL       https://clcutoqjdgeggvgyreud.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  <clave anon del panel de Supabase>
   SUPABASE_SERVICE_ROLE_KEY      <clave service_role del panel>   ← SECRETA
   NEXT_PUBLIC_SITE_URL           https://<tu-dominio>
   IP_HASH_SALT                   <32 bytes en hex: openssl rand -hex 32>
   ```

4. Deploy.

**Opción B — desde tu terminal.** En esta sesión, escribe con el prefijo `!`
para que la autenticación ocurra en tu propia consola:

```
! npx vercel login
! npx vercel --prod
```

### Sobre `SUPABASE_SERVICE_ROLE_KEY`

Esa clave **salta la RLS por completo**. No lleva el prefijo `NEXT_PUBLIC_`
precisamente para que Next.js se niegue a incluirla en un bundle de navegador, y
`src/lib/supabase/admin.ts` la protege con tres barreras más (`import
"server-only"`, una comprobación en runtime y un argumento `reason` obligatorio).

Sin ella, las rutas del motor de examen (`/api/attempts/*`) devuelven un error
controlado y el resto de la aplicación funciona.

---

## 3 · Comprobación después de desplegar

En este orden, porque cada uno depende del anterior:

1. **La landing carga** y el pie dice `© 2026 Roberto Mendizabal`.
2. **Las cabeceras están puestas.** En la consola del navegador, pestaña Red, la
   respuesta del documento debe traer `content-security-policy` con `nonce-`.
   Si no aparece, el middleware no se registró.
3. **El selector de colegio trae «Cambridge Demo School».** Si sale vacío, la
   función `list_active_schools()` no está desplegada o la clave anon es errónea.
4. **Entra como administrador**: `/login/staff`, tu email y tu contraseña.
5. **Entra como alumno**: `/login/student` → Cambridge Demo School → `Y6A-001` →
   PIN `123456`. Te pedirá cambiarlo: es el comportamiento correcto (AD-4).
6. **Abre una lección** en `/learn` y comprueba que se ven los bloques de teoría.
7. **Practica** en `/practice` y confirma que el feedback es inmediato.
8. **Arranca el simulacro** en `/exam`. Aquí es donde hace falta la
   `SUPABASE_SERVICE_ROLE_KEY`.

---

## Estado de las Edge Functions

Las tres están desplegadas y activas en el proyecto:

| Función | Qué hace |
|---|---|
| `auth-pin` | Login de alumno. Tiempo constante, hash señuelo, rate limit por IP y por código, bloqueo tras 5 fallos. |
| `student-pin` | Alta y cambio de PIN. El único sitio del sistema que calcula Argon2id. |
| `staff-password` | Cambio de contraseña del personal. Verifica la actual antes de cambiarla. |

---

## Lo que todavía no está

- **Los e2e autenticados.** Los 46 actuales cubren la superficie pública, las
  cabeceras y la protección de rutas. El recorrido de un alumno con sesión no se
  puede probar hasta que existan los secretos del paso 1.
- **Las cinco materias restantes.** Los packs de Science, English, Español,
  Socials e ICT están extraídos y versionados, pero solo Math está cargado en la
  base de datos.
- **La pasada global de auditoría.** Está pendiente y es el siguiente hito.

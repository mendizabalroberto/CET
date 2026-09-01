# Registro de accesos de alumno — diseño

Fecha: 2026-09-01 · Autor: Roberto Mendizabal (con Claude) · Estado: aprobado

## 1 · Problema

Un hijo de tutor solo entra por la cookie de dispositivo, que crea el canje de un
enlace de un solo uso. Ese enlace es un *bearer token* de 7 días que viaja por
WhatsApp o correo: quien lo tenga fija un PIN nuevo y se apropia de la cuenta.
Hoy no queda rastro de **desde dónde** se canjeó ni **desde dónde** se entra
después. `audit_log` tiene `ip_hash` y `user_agent` y los deja en NULL en el
camino del tutor; `auth_attempts` guarda `ip_hash` pero es munición del lockout,
no un archivo histórico.

Objetivos, los cuatro marcados por el propietario del producto:
forense a posteriori · detección en vivo · panel del tutor · responder
formalmente a un colegio.

## 2 · Decisión de privacidad, y su coste

**Se guarda la IP en claro, sin caducidad.** Decisión explícita del propietario
el 2026-09-01, tras plantearle dos alternativas más conservadoras (solo hash +
zona gruesa; o IP en claro purgada a los 30 días).

Coste asumido, escrito aquí para que nadie lo descubra después:

- Es un historial de ubicación permanente de un menor.
- Convierte a `accesos_de_alumno` en la tabla más sensible del sistema.
- Contradice `DATA_MODEL.md:283` («Nunca la IP en claro») y acota
  `MASTER_PLAN.md:202` («minimización»). Los dos se reescriben con este trabajo.

**La compensación es el control de acceso, no la retención.** Ver §4: `ip`,
`ip_hash` y `user_agent` quedan fuera del GRANT de `authenticated`, así que el
dato nunca sale hacia un navegador. Es el mismo patrón que ya protege
`attempt_items.answer_key`.

## 3 · La tabla

```sql
create type acceso_tipo as enum (
  'enlace_canjeado', 'login_ok', 'login_fallido', 'dispositivo_olvidado');

create table public.accesos_de_alumno (
  id              bigint generated always as identity primary key,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  device_id       uuid references public.student_devices(id) on delete set null,
  tipo            acceso_tipo not null,
  ip              inet,
  ip_hash         text,
  pais            text,
  region          text,
  ciudad          text,
  agente_familia  text,
  user_agent      text,
  origen          text not null check (origen in ('web', 'edge')),
  senales         text[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index accesos_alumno_ts_idx on public.accesos_de_alumno (student_id, created_at desc);
create index accesos_ip_idx        on public.accesos_de_alumno (ip);
create index accesos_ip_hash_idx   on public.accesos_de_alumno (ip_hash);
```

Y en `student_access_links`, para que la regla `canje_fuera_de_red` tenga con
qué comparar: `creado_desde_ip inet`, `creado_desde_ip_hash text`.

Decisiones:

- **`inet` y no `text`.** «¿Vino de la misma red?» es `ip << '10.0.0.0/24'`, un
  operador nativo de Postgres. Con `text` habría que reimplementarlo, y mal.
- **`ip_hash` se conserva pese a tener la IP en claro.** Permite comparar sin
  *leer* la IP, y es lo único que sobrevive si algún día se purga la columna.
- **`origen`.** La web (Vercel) conoce la geo; la Edge Function no. Sin esta
  columna, «ciudad NULL» mezcla «no se sabe» con «esa capa no puede saberlo».
- **Sin particionar.** `learning_events` se parte porque crece con cada
  pulsación; esto crece con cada login. Si algún día pesa, se parte por
  `created_at`.

## 4 · Acceso — el invariante que sostiene el diseño

```sql
revoke all on public.accesos_de_alumno from authenticated;

grant select (id, student_id, device_id, tipo, pais, region, ciudad,
              agente_familia, senales, created_at)
  on public.accesos_de_alumno to authenticated;

alter table public.accesos_de_alumno enable row level security;

create policy accesos_select on public.accesos_de_alumno
  for select to authenticated
  using ((select app.puede_ver_alumno(student_id)));
```

- `ip`, `ip_hash` y `user_agent` **no** están en el GRANT: solo `service_role`.
- No hay INSERT/UPDATE/DELETE para `authenticated`: nadie fabrica su rastro.
- El tutor ve «Chrome en Android · Madrid · hace 2 días»: basta para reconocer
  y revocar un aparato.
- La detección corre en el servidor, con `service_role`, que sí ve la IP.
- Responder a un colegio es una consulta directa hecha por una persona, con
  constancia — no un botón en la web.

Sin esto, un XSS en el panel del tutor exfiltra el historial de ubicación de un
niño. Con esto, el dato sensible no aparece jamás en una respuesta HTTP.

## 5 · Flujo de escritura

Restricción que decide el diseño: **en un login fallido la capa web no sabe
quién falló**. `genericFailure()` devuelve un cuerpo idéntico para todo fallo,
a propósito, para no filtrar qué códigos de alumno existen. Solo `auth-pin`
resuelve la fila de `students`. Luego los logins los escribe la Edge Function, y
la geo tiene que bajar hasta ella.

**La geo viaja por cabecera, nunca por el cuerpo.** `entradaDeAuthPin` es una
unión de dos esquemas `.strict()`, y ese `.strict()` es lo que impide mandar las
dos puertas a la vez (`puertas.ts:83`). Meter `pais`/`ciudad` en el cuerpo
obligaría a aflojarlo en ambas ramas: debilitar un invariante de seguridad para
transportar un dato decorativo. Van en `x-cet-geo-pais`, `-region`, `-ciudad`.

| Momento | Escribe | `origen` | Geo | `device_id` |
|---|---|---|---|---|
| `canjearEnlace` | Next.js (service_role) | `web` | directa de Vercel | el recién creado |
| Login correcto | `auth-pin` | `edge` | por cabecera | el de la puerta, si la hubo |
| Login fallido | `auth-pin` | `edge` | por cabecera | nulo |
| `olvidarDispositivo` | Next.js | `web` | directa | el revocado |

**Ninguna de estas escrituras puede tumbar un login.** Misma regla que
`auditar()` (`actions.ts:146`): no lanza, grita en `console.error` con prefijo
greppable. Un rastro perdido es un incidente de cumplimiento; un niño que no
puede entrar es un producto roto.

En el mismo paso se arregla `actions.ts:744`: hoy no aborta si falla el INSERT
de `student_devices`, justificándolo con que el niño «puede entrar por la puerta
del colegio» — puerta que un hijo de tutor no tiene.

## 6 · Reglas de detección

**Se evalúan dentro de Postgres, no en la aplicación.** Los dos que escriben
accesos son runtimes distintos —la Edge Function en Deno y Next.js en Node—, y
una regla implementada dos veces diverge: es la razón por la que los parámetros
de Argon2id ya están centralizados en este proyecto. Así que insertar y evaluar
son la misma operación:

```sql
app.registrar_acceso(
  p_student_id uuid, p_device_id uuid, p_tipo acceso_tipo,
  p_ip inet, p_ip_hash text, p_pais text, p_region text, p_ciudad text,
  p_agente_familia text, p_user_agent text, p_origen text
) returns bigint
```

`security definer`, `search_path = ''`, y `execute` **solo para `service_role`**
—nunca `authenticated`—, con envoltorio en `public` porque PostgREST no expone
`app` (el fallo de 0023, 0063 y 0077, por cuarta vez).

`p_ip_hash` lo calcula quien llama y no la base: el salt (`CET_IP_HASH_SALT`)
vive en el entorno de las funciones, y meterlo en Postgres sería copiarlo a un
sitio más del que puede escaparse.

El resultado va en `senales text[]` de la propia fila. Sin tabla nueva.

| Señal | Dispara cuando | Por qué |
|---|---|---|
| `canje_fuera_de_red` | el enlace se canjea desde una /24 distinta a la del tutor que lo generó | el enlace es un bearer que viaja por chat; canjearlo desde otra red es la señal más valiosa de esta tabla |
| `salto_de_pais` | dos accesos del mismo alumno desde países distintos en menos de 12 h | credencial compartida o robada. 12 h absorbe un vuelo y una VPN torpe |
| `ip_multicuenta` | una IP con accesos de más de 3 alumnos distintos en 24 h | hermanos y un aula comparten IP; veinte cuentas, no |
| `dispositivo_nuevo` | primer acceso de un `device_id` recién creado | ruido cero, valor alto |

**Ninguna bloquea.** Bloquear por geografía deja a un niño sin deberes porque
está en casa de su abuela o porque su operador móvil lo saca por otro país, y
eso pasa mucho más a menudo que un robo de cuenta. El bloqueo real ya existe y
está bien puesto: el lockout por PIN y el rate limit, que miden intentos, no
lugares.

Límite honesto: `x-forwarded-for` es falsificable (`rate-limit.ts:65`). Estas
señales dicen «esto merece una mirada», nunca «esto fue un ataque».

Fuera de alcance: aviso por correo. Hoy no hay ningún envío de correo en el
producto y montar esa tubería es un proyecto propio. El aviso sale en el panel.

## 7 · Documentos a reescribir

| Fichero | Cambio |
|---|---|
| `MASTER_PLAN.md:202` | la minimización gana una excepción nombrada: qué se guarda, para qué, quién lo lee |
| `DATA_MODEL.md:283` | «nunca la IP en claro» sigue valiendo para `audit_log` y `auth_attempts`; `accesos_de_alumno` es la excepción |
| `DATA_MODEL.md` | sección nueva para `accesos_de_alumno` |
| `apps/web/src/lib/tutor/dispositivo.ts:38` | el comentario se queda; se añade dónde sí se guarda el user-agent entero y bajo qué grant |

## 8 · Pruebas

pgTAP (el grant por columna es el invariante que sostiene todo):

1. Un tutor NO lee `ip`, `ip_hash` ni `user_agent` de su propio hijo → 42501.
2. Un tutor SÍ lee `pais`, `ciudad`, `agente_familia` de su hijo.
3. Un tutor no ve ni una fila de un alumno que no es suyo.
4. El propio alumno tampoco alcanza `ip` (el caso que más se olvida).
5. `authenticated` no tiene INSERT: nadie fabrica su rastro.
6. Cada regla de detección, con datos sembrados: dispara y no dispara.

Vitest:

7. La geo viaja por cabecera; metida en el cuerpo, el `.strict()` la rechaza.
8. Un fallo al escribir el acceso no tumba el login ni el canje.

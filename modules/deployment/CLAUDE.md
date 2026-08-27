# M13 — `deployment`

> Entornos, CI/CD, migraciones, cabeceras de seguridad, observabilidad y copias.
> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> **Depende de:** todos. **Bloquea:** cualquier despliegue.

---

## 1. Objetivo

Que llevar un cambio a producción sea **aburrido**: reproducible, reversible y
sin credenciales pasando por las manos de nadie.

Y que lo contrario sea difícil: que un secreto no se pueda commitear sin que el
CI lo grite, que una migración no se aplique sin haberse probado desde cero, y
que nada llegue a `main` en rojo.

Restricción de partida (AD-8): **Vercel + Supabase cloud**, un preview por PR y
una rama de Supabase para staging.

---

## 2. Arquitectura

### Entornos

| Entorno | Frontend | Base de datos | Datos | Quién entra |
|---|---|---|---|---|
| Local | `next dev` | Supabase CLI local | Seed | Desarrollo |
| Preview | Preview de Vercel por PR | Rama de Supabase | Seed | Revisores |
| Staging | Despliegue de `main` | Rama de Supabase | Seed + anonimizados | Equipo |
| Producción | Vercel producción | `clcutoqjdgeggvgyreud` | Reales | Colegios |

**Ningún entorno que no sea producción toca datos reales de menores.** Ni
siquiera "solo para depurar un caso". Los datos de staging se generan; no se
copian y se anonimizan, porque anonimizar mal es la forma habitual de filtrar.

### Pipeline

```
PR abierto
   ├─ ci.yml       typecheck → lint → test → build → e2e → secret-scan
   ├─ db.yml       (si toca supabase/) Postgres efímero → migraciones → RLS → pgTAP
   └─ Vercel       preview deployment
        │
   merge a main (bloqueado si algo está en rojo)
        │
   ├─ despliegue a producción (Vercel)
   └─ migraciones a producción (paso MANUAL y aprobado)
```

**Las migraciones de producción no son automáticas.** Un `main` verde garantiza
que el SQL se aplica sobre una base de datos vacía; no garantiza que se aplique
sobre una con datos, ni que el bloqueo que toma no congele un examen en curso.
Se aplican con aprobación explícita y fuera de la franja lectiva.

### Orden de despliegue

Primero la base de datos, después la aplicación, y **solo con migraciones
compatibles hacia atrás**: durante el despliegue conviven la versión vieja de la
app y el esquema nuevo. Una columna se añade en un despliegue y se hace `not
null` en el siguiente. Renombrar una columna en un solo paso rompe la app en
producción durante el minuto que dura el cambio, y ese minuto puede caer dentro
de un examen.

---

## 3. Tablas

Este módulo apenas tiene esquema propio; se apoya en dos tablas de M01
`security` y añade una:

### `audit_log` (M01, consumida aquí)
Toda operación de despliegue que toque datos deja rastro con
`actor_role = 'system'`.

### `schema_migrations`
La gestiona el CLI de Supabase. **No se edita a mano jamás**: es el único
registro de qué está aplicado en cada entorno.

### `deployment_log` (propia)
`id` bigint, `environment`, `git_sha`, `deployed_by`, `migrations_applied` text[],
`started_at`, `finished_at`, `status` (`in_progress`/`succeeded`/`rolled_back`),
`notes`.

Sirve para responder "¿qué había desplegado el martes a las 10:15, cuando el
examen de Y6A dio problemas?". Sin ella, esa pregunta se responde por
arqueología de logs. RLS: solo superadmin.

---

## 4. APIs

| Superficie | Qué es |
|---|---|
| `.github/workflows/ci.yml` | typecheck · lint · test · build · e2e · búsqueda de secretos |
| `.github/workflows/db.yml` | migraciones + RLS + pgTAP sobre Postgres efímero |
| `pnpm verify` | El mismo pipeline en local, antes de empujar |
| `GET /api/health` | Estado del proceso. **Sin autenticación y sin detalle**: `{ok:true}` y poco más. Un endpoint de salud que enumera versiones y dependencias es reconocimiento gratis |
| `pnpm db:types` | Regenera `packages/shared/src/database.types.ts` desde el proyecto |

**Variables de entorno**

| Nombre | Ámbito | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Público | Llega al navegador; correcto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Público | Acotada por RLS. Si filtra datos, el bug está en la política |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secreto de servidor** | Salta RLS. Sin prefijo `NEXT_PUBLIC_` para que Next se niegue a inlinarla |
| `NEXT_PUBLIC_SITE_URL` | Público | URL canónica; en preview, la del preview |
| `IP_HASH_SALT` | **Secreto de servidor** | Sal de `sha256(ip + salt)`. Nunca la IP en claro |

Todas se declaran en `apps/web/.env.example` con valores de ejemplo evidentes.
**Ningún valor real vive en el repositorio.** El CI lo comprueba en cada PR.

---

## 5. Frontend

`apps/web/next.config.ts` y `apps/web/middleware.ts` son parte de este módulo:
son la superficie desplegada.

**Cabeceras de seguridad** (`next.config.ts`, estáticas):
`X-Frame-Options: DENY` · `X-Content-Type-Options: nosniff` ·
`Referrer-Policy: strict-origin-when-cross-origin` · `Permissions-Policy` con
cámara, micrófono y geolocalización desactivados · `Strict-Transport-Security`
dos años con `includeSubDomains; preload` · `Cross-Origin-Opener-Policy` ·
`Cross-Origin-Resource-Policy`.

**CSP** (`middleware.ts`, con nonce por petición):
`script-src` **sin** `unsafe-inline` ni `unsafe-eval` en producción,
`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
`frame-ancestors 'none'`, `connect-src` limitado a nosotros y a Supabase.

> La CSP vive en el middleware y **no** en `next.config.ts` porque un nonce por
> petición no se puede generar desde una configuración estática. Emitir dos
> cabeceras CSP haría que el navegador aplicase la intersección de ambas, y la
> estática —sin el nonce— bloquearía los propios scripts de Next.js. Una CSP
> duplicada no es defensa en profundidad: es una aplicación rota.

**Observabilidad**
- Logs estructurados de servidor, sin PII: identificadores y `digest` de error,
  nunca nombres ni respuestas.
- El `error.tsx` de la app registra el `digest` y **no** muestra
  `error.message`: en desarrollo puede contener nombres de tablas, y la
  pantalla la ve un niño de once años.
- Alertas: tasa de 5xx, latencia de `/api/events`, fallos de login por encima de
  lo normal (indicio de ataque a los PIN), retraso de creación de particiones.

---

## 6. Seguridad

1. **Ningún secreto en el repositorio.** `.gitignore` cubre `.env*`,
   `secrets/`, `*.pem`, `*.key`; el job `secret-scan` de `ci.yml` busca JWT de
   Supabase y valores de `SUPABASE_SERVICE_ROLE_KEY` en cada PR. Es la última
   barrera antes de un secreto en el historial público.
2. **`permissions: contents: read`** en los workflows. Por defecto el
   `GITHUB_TOKEN` llega con escritura; un token comprometido con menos permisos
   hace menos daño.
3. **`--frozen-lockfile` siempre.** Si alguien tocó `package.json` sin
   regenerar el lockfile, el CI falla en vez de instalar versiones distintas de
   las que se probaron.
4. **El CI no tiene credenciales de producción.** Los valores de Supabase en
   `ci.yml` son marcadores: el build de Next solo necesita que las variables
   existan. Un CI con acceso a producción es un CI que, antes o después, borra
   producción.
5. **`db.yml` corre contra Postgres efímero**, nunca contra
   `clcutoqjdgeggvgyreud`.
6. **Puerta de RLS en CI:** `db.yml` consulta `pg_class.relrowsecurity` y falla
   si alguna tabla de `public` no tiene RLS. `DATA_MODEL` §0 dice "sin
   excepción"; esto lo demuestra en vez de confiar en que alguien se acuerde.
7. **Protección de `main`:** sin PR aprobado y sin CI verde no se mergea.
8. **Copias de seguridad:** las automáticas de Supabase más una restauración de
   prueba **trimestral**. Una copia que no se ha restaurado nunca no es una
   copia: es una carpeta.
9. **Rotación de claves:** service role y sal de IP cada 90 días o
   inmediatamente ante cualquier sospecha. El procedimiento está escrito y
   probado; improvisarlo durante un incidente es cómo se pierde una tarde.

---

## 7. Pruebas

**Del propio pipeline**
- Un PR con un `.env` que contenga un JWT real hace fallar `secret-scan`.
- Un PR que añada una tabla sin RLS hace fallar `db.yml`.
- Un PR con un error de tipos falla en el primer paso, no en el e2e.
- Un `test.only` olvidado hace fallar Playwright (`forbidOnly` en CI).

**De la aplicación desplegada** (`e2e/landing.spec.ts`)
- Las cabeceras de seguridad están presentes con los valores esperados.
- La CSP contiene un nonce y `script-src` **no** contiene `unsafe-inline` ni
  `unsafe-eval`. Una CSP decorativa pasaría una comprobación de "existe la
  cabecera"; esta no.

**De recuperación**
- Restauración trimestral en un proyecto desechable, cronometrada, con la
  consulta forense de `DATA_MODEL` §10 ejecutada sobre los datos restaurados.
  Si la reconstrucción de un intento no sobrevive a la copia, la copia no vale.

---

## 8. Criterios de finalización

- [ ] `ci.yml` verde: typecheck → lint → test → build → e2e, con caché de pnpm y
      de Turborepo.
- [ ] `db.yml` aplica todas las migraciones desde cero sobre Postgres 17 y
      ejecuta pgTAP.
- [ ] Puerta de RLS en CI activa y demostrada con una tabla de prueba.
- [ ] `secret-scan` demostrado con un secreto de mentira.
- [ ] `main` protegido: sin CI verde no hay merge.
- [ ] Preview de Vercel por PR, apuntando a una rama de Supabase.
- [ ] Cabeceras de seguridad y CSP verificadas por un test e2e, no por
      inspección manual.
- [ ] `.env.example` completo, sin un solo valor real.
- [ ] `deployment_log` escribiéndose en cada despliegue.
- [ ] Procedimiento de rollback escrito **y ejecutado una vez** en staging.
- [ ] Restauración de copia probada y cronometrada.

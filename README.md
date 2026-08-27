# Cambridge Exam Trainer (CET)

Plataforma multi-colegio de aprendizaje y evaluación para primaria y secundaria.
Matemática, Ciencias, Inglés, Español, Estudios Sociales e ICT.

**© 2026 Roberto Mendizabal. Todos los derechos reservados.** Software propietario — ver [`LICENSE`](./LICENSE).

---

## Qué es

Seis "Exam Trainers" en HTML demostraron que la pedagogía funciona, pero no guardaban nada: cero
persistencia, cero identidad, cero analítica. CET construye la plataforma debajo — identidad
multi-colegio, contenido versionado, un motor de examen auditable y telemetría diseñada para
aprendizaje adaptativo.

### El principio que dicta la arquitectura

> Para cualquier examen terminado, el sistema debe poder reconstruir **exactamente** qué vio el
> estudiante, en qué orden, qué versión de cada pregunta, qué respondió, cuándo, cuántas veces
> cambió de opinión y cómo se calificó — sin depender de la honestidad del cliente.

---

## Documentación

| Documento | Para qué |
|---|---|
| [`MASTER_PLAN.md`](./MASTER_PLAN.md) | Visión, decisiones de arquitectura, hitos, protocolo de calidad |
| [`DATA_MODEL.md`](./DATA_MODEL.md) | Esquema completo y razonado. **Contrato congelado** |
| [`MODULES.md`](./MODULES.md) | Mapa de módulos, contratos entre ellos, reglas transversales |
| `modules/*/CLAUDE.md` | Contrato detallado de cada uno de los 13 módulos |

---

## Stack

TypeScript · Next.js 15 (App Router) · React 19 · Tailwind v4 · Zod
Supabase (Postgres 17, Auth, Storage, Edge Functions) · RLS en todas las tablas
Vitest · pgTAP · Playwright · pnpm + Turborepo · GitHub Actions

---

## Estructura

```
apps/web/            Next.js — landing, alumno, staff, admin
packages/
  shared/            Contrato: tipos, enums, Zod, i18n
  engine/            Generadores, correctores, blueprint (puro, determinista)
  ui/                Design system
  content/           Pipeline Y6A HTML -> content packs JSON
supabase/            Migraciones, RLS, seed, pgTAP, Edge Functions
modules/             13 contratos de módulo (CLAUDE.md)
secrets/             Credenciales locales — ignorado por git
Y6A/                 Material del centro — NO versionado (ver abajo)
```

---

## Material fuente

El producto nace de seis «Exam Trainers» en HTML y del material docente que los
acompaña, en una carpeta `Y6A/`. **Esa carpeta no está en el repositorio, y es
deliberado**: es material del centro educativo, propiedad de terceros, y
versionarlo sería redistribuir obra ajena. El `LICENSE` ya lo decía; tenerlo
dentro lo contradecía en la práctica.

Lo que sí está versionado son los **content packs** que produce el extractor
(`packages/content/packs/*.json`): 33 lecciones, 401 bloques, 453 preguntas y 6
blueprints, saneados y con ids deterministas. Con ellos se puede sembrar la base
de datos y arrancar la plataforma entera sin el material original.

Para volver a ejecutar la extracción hace falta el material en `Y6A/` con la
estructura que espera `packages/content/src/subjects/*.ts`. Sin él:

- `pnpm --filter @cet/content extract` falla, y lo dice.
- Los 17 tests que leen los trainers reales **se saltan**, con el motivo escrito
  en la salida. No fallan: un repositorio recién clonado no debe estar roto.
- El resto sigue probándose, incluido que los packs versionados no contengan
  nada ejecutable y que validen contra su esquema.

---

## Puesta en marcha

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # rellenar con las claves de Supabase
pnpm db:types                                   # generar tipos desde el esquema
pnpm dev
```

### Verificación

```bash
pnpm verify        # typecheck + lint + test + build
pnpm test:e2e      # Playwright
```

Ningún cambio se integra sin `pnpm verify` en verde.

---

## Seguridad

- **Nunca** commitear credenciales. `secrets/`, `.env` y `*.env` están en `.gitignore`.
- `SUPABASE_SERVICE_ROLE_KEY` salta la RLS: solo en Route Handlers auditadas, jamás en el cliente.
- La plataforma procesa datos de menores. Minimización de datos, audit log de todo acceso de staff,
  y cumplimiento de la normativa aplicable en cada jurisdicción de despliegue.

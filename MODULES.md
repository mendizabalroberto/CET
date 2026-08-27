# MODULES — mapa de módulos, contratos y dependencias

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Complementa `MASTER_PLAN.md` §5. Cada módulo tiene su contrato detallado en `modules/<nombre>/CLAUDE.md`.

---

## Principio de separación

`modules/` contiene **contratos**, no código. El código de cada módulo vive donde le corresponde
por capa:

| Capa | Ruta | Qué contiene |
|---|---|---|
| Datos | `supabase/migrations/`, `supabase/tests/` | Tablas, enums, RLS, triggers, pgTAP |
| Lógica pura | `packages/engine/` | Generadores, correctores, blueprint. Sin I/O, sin red, testeable en milisegundos |
| Contrato | `packages/shared/` | Tipos, enums, esquemas Zod. La frontera entre todo lo demás |
| Presentación | `packages/ui/` | Design system. Sin lógica de negocio |
| Contenido | `packages/content/` | Pipeline de extracción Y6A → packs JSON |
| Aplicación | `apps/web/` | Rutas, Server Actions, sesión, orquestación |

Un módulo atraviesa varias capas. `exam-engine` (M09), por ejemplo, tiene tablas en `supabase/`,
lógica en `packages/engine/`, componentes en `packages/ui/` y rutas en `apps/web/`. Su `CLAUDE.md`
es lo que mantiene esas piezas coherentes.

---

## Tabla de módulos

| # | Módulo | Capas que toca | Criterio de "terminado" |
|---|---|---|---|
| M01 | `security` | supabase | pgTAP verde: aislamiento entre colegios probado tabla por tabla |
| M02 | `auth` | supabase, apps/web | Login PIN end-to-end; lockout probado; enumeración de usuarios imposible |
| M03 | `users` | supabase, apps/web | Alta, aprobación, cambio de rol, suspensión — todo auditado |
| M04 | `students` | supabase, apps/web | Códigos únicos por colegio; regeneración de PIN por profesor; cambio obligatorio |
| M05 | `curriculum` | supabase, packages/content | Math Y6 completo y navegable |
| M06 | `content` | supabase, packages/{content,ui} | Lecciones renderizadas y saneadas; media en Storage con RLS |
| M07 | `questions` | supabase, packages/engine | Versionado inmutable probado; generadores deterministas |
| M08 | `exams` | supabase, apps/web | Blueprint → asignación → ventana temporal respetada |
| M09 | `exam-engine` | todas | **Reconstrucción forense al 100% probada por test** |
| M10 | `grading` | supabase, packages/engine | Auto + parcial + manual; recalificación encadenada sin perder historia |
| M11 | `analytics` | supabase, apps/web | Ingesta en lote; mastery por skill; dashboards |
| M12 | `admin` | apps/web, packages/ui | Panel completo con visor de auditoría y reconstrucción de intentos |
| M13 | `deployment` | .github, supabase | CI verde obligatorio; migraciones validadas; rollback documentado |

---

## Contratos entre módulos

Los puntos donde dos módulos se tocan son donde aparecen los bugs. Estos son los cinco críticos:

### C1 — `questions` → `exam-engine`
El motor **nunca** lee `questions` directamente. Lee `question_versions`, que es inmutable.
Consecuencia: editar una pregunta jamás altera un examen ya realizado.

### C2 — `engine` (generadores) → `exam-engine`
`generate(engineKey, params, seed)` es determinista. El motor guarda `item_seed` y confía en poder
regenerar. Si un generador pierde el determinismo, la reconstrucción forense miente — por eso el
test de propiedad de determinismo es bloqueante en CI.

### C3 — `exam-engine` → `grading`
El motor entrega `answer_key` congelada + `response` final. El corrector es puro: mismas entradas,
misma nota, siempre. Recalificar no muta: crea una fila nueva con `supersedes_id`.

### C4 — cliente → `analytics`
El cliente envía `sessionId`, `seq`, `eventType`, `payload`. El servidor deriva `school_id` y
`student_id` **de la sesión**, nunca del cuerpo. Confiar en el cuerpo permitiría a un alumno
escribir eventos en nombre de otro.

### C5 — `content` → `ui`
Todo HTML que venga de la base de datos pasa por `@cet/ui/lib/sanitize` antes de renderizarse.
Es el único punto del sistema autorizado a usar `dangerouslySetInnerHTML`.

---

## Reglas transversales

Aplican a todos los módulos y se verifican en cada pasada de revisión:

1. **RLS en toda tabla.** Una tabla sin política es inaccesible — ese es el fallo seguro correcto.
2. **`school_id` en toda query de negocio.** Nunca se confía en que la RLS sea la única barrera.
3. **Validación Zod en ambos extremos** de cada frontera de confianza.
4. **El reloj del servidor es la única verdad** para cualquier cosa que puntúe o expire.
5. **Nada que revele existencia**: mensajes de error uniformes en auth; 404 en vez de 403 para rutas privilegiadas.
6. **Toda acción de staff sobre datos de alumno va al `audit_log`.**
7. **Cero strings hardcodeados** en UI: todo por `I18nText`.
8. **Cero secretos en el repo.** `secrets/` está en `.gitignore`.

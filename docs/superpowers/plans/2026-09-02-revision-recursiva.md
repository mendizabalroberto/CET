# Plan — revisión recursiva de la app y segunda ronda del plan de estudio

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> 2 de septiembre de 2026. Producción: https://cet-sable.vercel.app
> Complementa a `docs/superpowers/specs/2026-09-02-planes-de-estudio-design.md`
> y a `HANDOFF-CIERRE.md §1` (cómo repartir trabajo). No los sustituye.

**En una frase:** lo que se pidió en la spec del plan está escrito y desplegado,
pero le faltan la puerta de salida (borrar/cancelar), el acuse (ningún éxito se
enseña), el histórico de notas, el calendario visible, y el panel del padre
sigue siendo un informe monocromo sin comparación ni objetivo.

---

## 0 · Lo que se vio (2 de septiembre)

### 0.1 · En producción, con el navegador

| Dónde | Qué pasa | Gravedad |
|---|---|---|
| `/login` con cookie vieja | Dice «Has iniciado sesión como Roberto» y el botón **Continuar lleva a un 404**; al siguiente clic la sesión ya no existe. `sesionYaAbierta()` cree que la sesión es real y el layout la rechaza. | Alta: es lo primero que ve un padre que vuelve |
| `/login` | No hay entrada para tutores. El padre tiene que elegir «Soy profesor o administrador». | Media |
| Portada | Título de pestaña en español, página en inglés (cookie `cet_locale` vs `Accept-Language`). Ya diagnosticado en `HANDOFF.md §0.1`. | Baja |
| `/api/health` | `{"ok":true}` | — |

### 0.2 · En el código (auditoría completa en el hilo, resumida aquí)

**Plan de estudio** (`apps/web/src/lib/plan/acciones.ts`)
- Cuatro acciones: subir, confirmar, proponer, fijar. **No existe cancelar ni
  borrar**, ni acción, ni política SQL (`0091` no concede `delete` ni `update` a
  nadie), ni botón. La única forma de quitar un plan es crear otro.
- `fijarPlan` desactiva el plan anterior **antes** de insertar; si falla el
  insert de tareas, borra el nuevo pero **no reactiva el anterior**: el alumno
  se queda sin plan.
- `done()` devuelve `successKey` (`planBoletinExtraido`, `planBoletinConfirmado`,
  `planPropuesto`, `planCreado`) y **nadie lo pinta**; esas claves no existen en
  los diccionarios. Confirmar notas no da acuse.
- `plan/page.tsx` pasa `nombre` y `PlanDeEstudio` no lo destructura. La clave
  `tutor.child.plan.title` está definida y sin uso. Falta el `h2` con el nombre.
- Solo se enseña `boletines[0]`: **el histórico de boletines es invisible**.

**Calendario** (`consultas.ts:536`, `0092`, `seed/calendario_2026.sql`)
- No hay pantalla de calendario para nadie. Solo el seed y `service_role`.
- `calendarioDelPlan` **descarta todo hito con `year_levels`**, así que ningún
  hito Cambridge llega jamás al motor. Y6 no tiene hito en el seed.
- `contracts/plan-2-calendario.result.md` quedó en **rojo** (pgTAP `plan(11)`
  con 9 asserts). Hay que reverificar `node scripts/db-test.mjs calendario_escolar`.

**Registro de notas**
- Notas del boletín: `boletines.notas jsonb`, con banda calculada en
  `boletin.ts:32`. Se ven solo en el último boletín.
- Corrección manual del profesor: `attempt_gradings`, INSERT encadenado con
  `supersedes_id`. Correcto. No se cruza con el plan, y no debe.

**Panel del tutor** (`lib/tutor/seguimiento.ts`, `packages/ui/src/reports/*`)
- 13 baldosas + 5 dibujos SVG a mano (constancia, reloj, dispersión, escalera,
  reparto por lección). Todo en una sola tinta. **Sin comparación con el
  periodo anterior, sin objetivo, sin adherencia al plan, sin desglose por
  materia.** Un padre no sabe si «3 h 13 min» es mucho o poco.
- `CohortComparison` existe y no se usa (decisión consciente).

**Pruebas**
- 1298+ unitarias en verde (29 s). No hay e2e del recorrido del plan aunque
  la spec §12 lo exige.

---

## 1 · Decisiones tomadas para esta ronda

1. **Cancelar, no borrar.** Un plan se cancela (`activo=false`; sin columna
   nueva, para no abrir migraciones en esta ronda). Las tareas se quedan: son el registro de lo que se
   propuso. Un boletín solo se descarta si sigue en `extraido`; uno confirmado
   es historia y no se toca.
2. **El calendario es una lista, no un mes.** El tutor ve los próximos eventos
   de la gestión dentro de la pestaña del plan. Editar eventos sigue siendo del
   colegio (fuera de esta ronda).
3. **KPI estándar del panel:** cada cifra principal lleva su variación contra
   los 7 días anteriores; aparece una baldosa de **adherencia al plan**
   (minutos hechos / minutos planificados) cuando hay plan activo; un desglose
   por materia; y color semántico con los tokens que ya existen (`brand`,
   `teal`, `danger`, `muted`), sin inventar paleta (la spec de color sigue sin
   aprobar).
4. **La sesión muerta se detecta en el servidor:** `sesionYaAbierta()` debe
   comprobar que `homeForRole` es alcanzable con esa sesión (perfil y rol).
5. Nada de `window.confirm`: la confirmación de cancelar es un segundo botón
   en la misma tarjeta.

---

## 2 · Reparto por territorio disjunto

| Id | Motor | Territorio | Depende de |
|---|---|---|---|
| **rev-1** cancelar plan y descartar boletín | DeepSeek chat | `lib/plan/acciones.ts`, `acciones.puras.ts`, `acciones.test.ts`, `tipos.ts` | — |
| **rev-2** calendario por curso + próximos eventos | DeepSeek chat | `lib/plan/consultas.ts`, `consultas.test.ts` | — |
| **rev-3** diccionarios (éxitos, cancelar, histórico, calendario, login) | DeepSeek chat | `lib/i18n/dictionaries/es.ts`, `en.ts` | — |
| **rev-4** panel profesional del tutor | Sonnet (interno, ve capturas) | `packages/ui/src/reports/**`, `lib/tutor/seguimiento.ts`, `lib/tutor/queries.ts`, `components/tutor/Seguimiento.tsx`, `app/(tutor)/tutor/hijos/[id]/page.tsx`, `app/dev/informe-preview/page.tsx`, claves `tutor.child.progress.*` | — |
| **rev-5** pantalla del plan: acuse, nombre, cancelar, histórico, calendario | Sonnet | `components/tutor/PlanDeEstudio*.tsx`, `app/(tutor)/.../plan/page.tsx`, una línea en `acciones.ts` (pasar el curso) | rev-1, rev-2, rev-3 |
| **rev-6** login: sesión muerta y entrada de tutores | Sonnet | `lib/auth/session.ts`, `app/(auth)/login/page.tsx`, `components/auth/SesionAbierta*` | rev-3 |
| **rev-7** verificación en base y limpieza | interno | `scripts/db-test.mjs calendario_escolar`, `pnpm verify`, git | todo |

rev-1, rev-2, rev-3 y rev-4 arrancan **a la vez**. rev-5 y rev-6 después de
mezclar las ramas `deepseek/rev-*`. rev-7 al final.

---

## 3 · Criterios de cierre

- `pnpm verify` en verde desde un árbol limpio.
- `node scripts/db-test.mjs plan_de_estudio` y `calendario_escolar` en verde.
- Capturas del panel nuevo a 360 px y 900 px, claro y escala de grises, en
  `tocheck/rev-4-*.png`.
- Rama mezclada en `main`, `git push`, `npx vercel --prod --yes` desde un
  worktree limpio (`HANDOFF.md §1`).

## 4 · Lo que esta ronda NO hace, y queda apuntado

- Probar el recorrido real del plan (PDF → DeepSeek → plan) con una cuenta de
  tutor: el proyecto no entra con cuentas reales desde agentes
  (`app/dev/informe-preview/page.tsx`, cabecera). Se cubre con tests de
  componente y de acciones puras; el e2e con DeepSeek mockeado (spec §12) sigue
  pendiente.
- Editar el calendario escolar desde la interfaz del colegio.
- Traducir el contenido (`HANDOFF.md §0.2`) y rotar las claves (`§6`).
- El hito Cambridge de Y6: no existe en el seed; hay que decidir cuál es.

---

## 5 · Cierre de la ronda (2 de septiembre, noche)

| Id | Motor final | Desenlace |
|---|---|---|
| rev-1 | DeepSeek 4 rondas en rojo («el parche no aplica»); **Sonnet** | verde, `eac177b` |
| rev-2 | DeepSeek, verde a la primera ($0,006) | `1122ff6` |
| rev-3 | DeepSeek: 3 «falsos verdes» hasta que existió un test rojo; después verde a la primera | `f2aafb7` |
| rev-4 | Sonnet (una caída por límite de sesión, relanzado) + dos retoques a ojo | `a8f1a55` |
| rev-5 | Sonnet | `adce053` + corrección de fechas civiles `9596a7c` |
| rev-6 | interno: la causa del 404 era el `<Link>` a `/logout` prefetchado | `095d4c9` |
| rev-7 | pgTAP del plan y del calendario en verde (22 y 9) tras dejar de incluir migraciones ya aplicadas | `095d4c9` |

Dos hallazgos que no estaban en el plan y se arreglaron por el camino:

- **Fechas civiles un día antes.** `new Date("2026-08-24")` es medianoche UTC y
  La Paz va a UTC-4: el plan «empezaba» el 23 y el feriado del 24 salía en 23.
  Ahora `fechaLegible` formatea las fechas sin hora con `timeZone: "UTC"`.
- **`/dev/plan-preview`**: vista previa de la pestaña del plan con tres casos,
  para mirar cancelar/descartar/histórico/calendario sin cuenta de tutor.

### Lo que queda apuntado

- **Acierto y lecciones por materia** en el panel: ningún RPC reparte ítems por
  materia. Haría falta `informe_alumno_resumen_por_materia` (migración). El
  componente ya admite los dos campos.
- **e2e del recorrido del plan** con DeepSeek mockeado (spec §12).
- **Hito Cambridge de Y6** en el seed del calendario.
- `Logo CET.png` en la raíz sin sitio; `%TEMP%/deploy-plan` es un worktree
  viejo de un despliegue (`git worktree prune` cuando se confirme).
- La clave `DEEP_SEEK_API` sigue pendiente de rotación (`HANDOFF.md §6`).

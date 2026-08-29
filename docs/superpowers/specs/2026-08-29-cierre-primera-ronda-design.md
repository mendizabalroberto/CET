# Cierre de la primera ronda — especificación

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Escrita el 29 de agosto de 2026, al final de la jornada que descubrió que
> ningún alumno podía entrar, ninguno podía ver un examen, y ninguno podía
> empezarlo. Complementa a `HANDOFF.md`; no lo sustituye.

**En una frase:** la base sobre la que se van a añadir funcionalidades existe y
funciona, pero la jornada demostró que *funcionar* y *estar probado* eran dos
cosas distintas en tres capas seguidas, y esta etapa se cierra cuando esa
distancia esté cubierta por invariantes y no por memoria.

---

## 0 · Qué cambió hoy, medido

| | Antes | Ahora |
|---|---|---|
| Alumno puede iniciar sesión | ❌ PIN correcto → volvía a la pantalla de ingreso | ✅ verificado en producción |
| Alumno ve sus exámenes | ❌ «Ahora mismo no tienes exámenes» con dos asignados | ✅ los dos, con su estado |
| Alumno puede empezar un examen | ❌ 500 | ⚠️ 409, error de dominio sin identificar |
| Informes invocables desde la web | ❌ 406 PGRST106 | ✅ ocho envoltorios, guardián vivo |
| `pgTAP` | 8 de 16 ficheros rojos | **7 de 20** |
| `db-apply` contra producción | sin registro, cualquiera | registro con huella + bandera explícita |

Los tres fallos de acceso tenían la misma forma: **código escrito, revisado,
desplegado y que no hacía lo que decía**, invisible porque nadie había recorrido
el camino con la sesión de un usuario real. Los tres se encontraron abriendo la
aplicación, no leyendo el código.

---

## 1 · Qué significa «etapa concluida»

No «sin fallos» —eso no se puede afirmar— sino **cuatro condiciones
comprobables**:

1. **Un alumno completa el ciclo entero**: entra, estudia una lección, practica,
   hace un examen, ve su nota. Verificado recorriéndolo, con capturas.
2. **Cada paso de ese ciclo deja su fila** en `learning_events`, con el
   `skill_id` y el `attempt_id` que le corresponden. Hoy los dos están vacíos.
3. **El tutor ve un scorecard cuyas cifras son defendibles** ante un padre. Hoy
   la principal —429 minutos, de los cuales 405 en un solo día— no lo es.
4. **La batería pgTAP está en verde o cada rojo tiene dueño escrito**. Siete
   rojos sin explicación no son una batería, son ruido.

---

## 2 · Lo que bloquea, y quién decide

### 2.1 · La decisión de tenencia — **es tuya, no delegable**

`0056` declaró que un alumno **no tiene `school_id`** porque su matrícula pasa a
`student_school_memberships`. El código dice lo contrario: `_context.ts` y
`session.ts` cortan con `if (!profile.schoolId) → forbidden`. Hoy conviven porque
`0060` retiró la constraint, pero la contradicción sigue viva y de ella cuelgan:

- `student_school_memberships` tiene **RLS activo y cero políticas**, así que la
  rama «por matrícula» de `profiles_select_school` es código muerto. En cuanto se
  cumpla `0056`, **el alumno desaparece de todas las listas del profesor**.
- `rls_tutor.sql` está rojo a propósito, como recordatorio visible.

**Hasta que esto se decida no se debe escribir la política que falta**, porque se
escribiría dos veces. Las dos salidas:

- **(a) El colegio vive en `profiles.school_id`.** Se retira la ambición de
  `0056`, se borran las tres tablas de tenencia o se dejan inertes, y el código
  no cambia. Barato hoy, techo bajo: un alumno no puede cambiar de colegio ni
  tener dos.
- **(b) El colegio vive en la matrícula.** Hay que escribir las políticas,
  migrar los datos y cambiar `_context.ts`, `session.ts` y las consultas de
  personal **en la misma tanda**. Caro, y es la única que soporta tutores,
  cambios de centro y el histórico.

### 2.2 · El 409 del examen

`POST /api/attempts/start` devuelve un error **controlado** del dominio, de esta
lista: `window_not_open`, `window_closed`, `max_attempts_reached`,
`deadline_passed`, `attempt_not_in_progress`, `insufficient_pool`,
`blueprint_invalid`, `attempt_starting`. Descartado `insufficient_pool` (las 13
secciones son `generated`) y la `selection` está bien formada. **No se identifica
adivinando**: hay que instrumentar el mapeo o reproducir `startAttempt` fuera de
la web. Va antes que nada de lo demás: sin examen no hay `attempt_id`, y sin
`attempt_id` media familia de informes no tiene datos.

### 2.3 · Dos cosas de tu mano

- **La GitHub App de Vercel** no está instalada en `mendizabalroberto/CET`, así
  que ningún push despliega. https://github.com/apps/vercel
- **La contraseña de `cet-contratos`** (proyecto `nfeiimhcqqlcyjkpoirf`, ya
  creado y gratis). Sin ella los contratos siguen sin base donde verificarse que
  no sea producción.

---

## 3 · El reparto

La regla que decide quién hace qué no es la dificultad, es **si hay que mirar**:

| Trabajo | A quién | Por qué |
|---|---|---|
| SQL, telemetría, scripts, tipos | **DeepSeek** | Verificable por código de salida. Su terreno. |
| Pantallas, gráficas, capturas | **Agente interno / humano** | `HANDOFF-DEEPSEEK.md §0.2`: DeepSeek no ve imágenes, y `§5.5` exige capturas a quien toca interfaz. |
| Decisión de tenencia, prioridades | **Humano** | No es trabajo, es criterio. |

Los contratos de esta etapa son `contracts/cierre-*.md`. **Territorios disjuntos
a propósito**, para poder lanzarlos en el mismo lote.

---

## 4 · La deuda que esta etapa NO cierra, y hay que escribir para no olvidar

- **`db-apply` aplica antes de verificar.** Un contrato en rojo deja su migración
  viva igualmente; así entró `0056`. El registro con huella limita el daño, no lo
  elimina.
- **La medida del tiempo depende de `payload` que escribe el cliente.** Se puede
  manipular desde la consola del navegador. Aceptable para un scorecard de
  estudio, inaceptable si algún día puntúa.
- **`informes_alumno_metricas_bruto` no lleva guardián** y por eso no se publica.
  Está escrito y probado; que siga así.
- **La suma del tiempo por lección es menor que el total**, a propósito: el
  tránsito entre lecciones no se le carga a ninguna. Hay un assert que lo
  congela; no se «arregla».

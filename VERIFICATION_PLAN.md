# Plan de verificación recursiva

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Documento de traspaso. Léelo entero antes de tocar nada.

---

## 1 · Estado actual

**En producción:** https://cet-sable.vercel.app · Supabase `clcutoqjdgeggvgyreud` · GitHub `mendizabalroberto/CET`

| | |
|---|---|
| Tests unitarios | **976** (shared 41 · engine 294 · content 197 · ui 151 · web 293) |
| e2e Playwright | **29** (23 anónimos + 6 con sesión) |
| Migraciones aplicadas | 19 |
| Tablas / políticas RLS | 42 / 105 · **0 tablas sin RLS** |
| Edge Functions activas | `auth-pin`, `student-pin`, `staff-password` |
| Módulos con contrato | 13 (`modules/*/CLAUDE.md`) |
| `pnpm verify` | exit 0 |

**Funciona y está comprobado contra producción:** landing, páginas legales, cabeceras de seguridad (CSP con nonce por petición), login de personal, `/admin`, `/teach`, cierre de sesión, protección de rutas por rol.

**Sin verificar todavía:** el recorrido completo del alumno (login por PIN, lección, práctica, examen cronometrado, reconstrucción forense desde el panel). Los packs de las cinco materias distintas de Math están extraídos pero no cargados.

---

## 2 · Lo que este proyecto ha demostrado sobre verificar

Esta sección importa más que la lista de tareas. **Seis fallos llegaron a producción con 976 tests en verde.** Ninguno era un error de lógica; los seis eran de la misma familia:

| # | Fallo | Por qué ningún test lo vio |
|---|---|---|
| 1 | El extractor se enganchaba a bancos de preguntas **comentados** | No rompía nada. Devolvía contenido plausible pero equivocado. |
| 2 | Taxonomía de skills divergente a tres bandas | La pregunta se generaba, respondía y calificaba bien. Solo el `skill_id` no resolvía, y el mastery registraba en el vacío. |
| 3 | El umbral de aprobado era **0,6 %** en vez de 60 % | Ratio contra porcentaje. Ambos pasaban el `CHECK between 0 and 100`. |
| 4 | El examen ignoraba el `op` de cada sección | Zod descarta claves desconocidas en silencio. El blueprint prometía una pregunta de cada operación y salían cuatro multiplicaciones. |
| 5 | El **middleware entero estaba inerte** | Vivía en `apps/web/middleware.ts` con directorio `src/`. Compilaba, tipaba, lintaba, y los tests de la matriz de rutas pasaban porque prueban la función, no su registro. |
| 6 | Un superadmin recibía **404 en su propio panel** | El claim `cet_role` nunca se implementó. Todos los e2e eran anónimos: comprobaban el 404 *sin* sesión, ninguno la página *con* sesión. |

### Las cuatro reglas que salen de ahí

**R1 · Verifica efectos observables desde fuera, no la existencia de código.**
Un test que importa `middleware()` y la invoca a mano habría seguido en verde durante todo el fallo #5. Pide una cabecera a un navegador real.

**R2 · Un dato plausible no es un dato correcto.**
Los fallos 1–4 producían salida que parecía bien. Compara contra una fuente independiente: resuelve el problema por otra vía, cuenta filas, verifica el valor esperado.

**R3 · Cuando dos piezas se construyeron por separado, el contrato entre ellas está roto hasta que se demuestre lo contrario.**
Los seis fallos vivían en fronteras. Un test de paridad que compare las dos declaraciones vale más que cien tests de cada lado.

**R4 · «Ausente» no es «denegado», y silencioso es peor que ruidoso.**
Prefiere siempre que un desajuste reviente. `zod.strict()`, constraints que hacen imposible el estado inválido, y errores que lanzan en vez de caer a un valor por defecto.

---

## 3 · Cómo verificar cada módulo

Para **cada** módulo, cuatro pasadas. No se acepta un módulo por compilar.

### Pasada A — Contrato
Lee su `modules/<nombre>/CLAUDE.md` y comprueba que lo que promete **existe y coincide** con la base de datos, el código y los otros módulos. Todo desajuste se anota aunque parezca cosmético: los seis fallos empezaron así.

### Pasada B — Adversarial
Intenta romperlo. Con sesión de otro colegio, sin sesión, con el reloj adelantado, con dos pestañas, con la red caída, con el doble clic, con el uuid de otro. Escribe el resultado en `REVIEW.md` incluso cuando aguante.

### Pasada C — Prueba con evidencia
Un test que falle **antes** del arreglo y pase después. Contra datos reales cuando el módulo toca datos. Si no puedes probarlo, dilo en el informe: un hueco declarado vale más que un verde falso.

### Pasada D — Corrección y re-verificación
Ejecuta los comandos y pega la salida literal. Nada de «debería funcionar».

---

## 4 · Plan por módulo

Orden de ejecución. Los primeros bloquean a los siguientes.

### M01 · `security` — RLS, auditoría, hashing
- [ ] Ejecutar las 6 suites pgTAP de `supabase/tests/` contra un Postgres efímero. **Nunca se han ejecutado.** Es el mayor hueco de cobertura del proyecto.
- [ ] Suplantar sesiones de dos colegios distintos y probar el aislamiento **tabla por tabla**, no por muestreo.
- [ ] Verificar que `app.audit()` registra toda acción de staff sobre datos de alumno, y que ninguna entrada contiene credenciales.
- [ ] Comprobar que las 44 funciones de `app` siguen con `search_path` fijado tras las migraciones 0014–0020.

### M02 · `auth` — PIN, sesiones, lockout
- [ ] **Recorrido completo del alumno**: colegio → código → PIN → cambio obligatorio → portada. Contra producción.
- [ ] Lockout real: 5 PIN erróneos bloquean, el 6.º correcto tampoco entra, y a los 15 minutos sí.
- [ ] Tiempo constante: medir la respuesta con código inexistente, PIN erróneo y cuenta bloqueada. **Las tres deben tardar lo mismo.** Si difieren, el hash señuelo no está cumpliendo su función.
- [ ] Rate limit por IP: 30 fallos contra códigos distintos deben cortar.
- [ ] Que ningún mensaje distinga «código no existe» de «PIN incorrecto».

### M03 · `users` — perfiles, roles, aprobación
- [ ] Escalada de privilegios por cada vía imaginable: `UPDATE` propio, a través de `school_admin`, con JWT sin `sub`.
- [ ] El trigger `sync_role_claims` mantiene `app_metadata` al día tras cambiar un rol, y el cambio surte efecto al refrescar el token.
- [ ] Aprobación y rechazo de `registration_requests`, con auditoría.

### M04 · `students` — códigos, PIN, secciones
- [ ] Alta de alumno end-to-end desde `/admin`, incluida la cuenta sintética. **Verificar que el alumno creado PUEDE INICIAR SESIÓN** — es el fallo que ya ocurrió con las cuentas sembradas a mano.
- [ ] Regeneración de PIN por el profesor: devuelve el PIN una sola vez, queda auditado, y el hash nunca se registra.
- [ ] Códigos únicos por colegio pero repetibles entre colegios.

### M05 · `curriculum` — materias, cursos, lecciones, skills
- [ ] Cargar los packs de las **cinco materias restantes** y verificar que el test de paridad de skills sigue verde.
- [ ] Un curso global no activado en `school_courses` no es alcanzable adivinando su uuid.
- [ ] Jerarquía de skills sin ciclos y sin huérfanas.

### M06 · `content` — bloques, media, saneado
- [ ] Renderizar los 401 bloques de las seis materias y comprobar que ninguno ejecuta nada.
- [ ] Batería XSS contra el sanitizador **con el contenido real**, no con fixtures.
- [ ] Los 11 `block_kind` tienen componente y validador. Añadir uno nuevo sin validador debe fallar el insert.

### M07 · `questions` — banco, versionado inmutable
- [ ] `UPDATE` sobre `question_versions` lanza excepción.
- [ ] Borrar una versión usada por un intento falla (`on delete restrict`).
- [ ] Editar una pregunta crea versión nueva y **no altera ningún examen ya realizado**.
- [ ] Ningún rol `authenticated` alcanza `answer_spec` por ninguna vía.

### M08 · `exams` — blueprints, asignaciones
- [ ] Los parámetros de cada sección los acepta el generador al que apuntan (test ya escrito, ampliarlo a las seis materias).
- [ ] Ventana temporal: fuera de `[opens_at, closes_at]` no se puede arrancar, y la zona horaria del colegio se respeta.
- [ ] Un blueprint con pool insuficiente falla de forma explícita y **no deja un intento a medias**.

### M09 · `exam-engine` — el núcleo forense
- [ ] **Examen completo end-to-end contra producción**: arrancar, responder, autosave, entregar, calificar.
- [ ] Reconstrucción forense de ese intento real desde `/teach/attempts/[id]`: enunciado literal, orden de opciones, cada revisión con su hora de servidor.
- [ ] Reanudación tras cerrar el navegador a mitad.
- [ ] Deadline del servidor con el reloj del cliente adelantado una hora.
- [ ] Doble submit simultáneo: una sola calificación.
- [ ] Dos pestañas abiertas del mismo examen.
- [ ] Que `answer_key` e `item_seed` **no aparezcan en ninguna respuesta HTTP**. Inspeccionar el tráfico real, no el código.

### M10 · `grading` — automática, parcial, manual
- [ ] Crédito parcial real en `ordering`, `matching` y `mcq_multi`.
- [ ] Equivalencia de respuestas: `7/4` = `1 3/4` = `1.75`, y en español `1,75`.
- [ ] Recalificación encadenada: la nota vigente es **la hoja**, no la raíz. Verificar sobre datos, no sobre el comentario.
- [ ] Un ítem sin respuesta puntúa 0 y no se salta.

### M11 · `analytics` — eventos, mastery
- [ ] Los eventos llegan de verdad: hacer una sesión de práctica y contar filas en `learning_events`.
- [ ] El servidor deriva `school_id` y `student_id` de la sesión. Intentar falsificarlos en el cuerpo y comprobar que se ignoran.
- [ ] `skill_mastery` se actualiza y los números cuadran con los eventos.
- [ ] Particiones: insertar con fecha del mes siguiente y comprobar que cae donde debe.

### M12 · `admin` — panel
- [ ] Un `school_admin` no ve absolutamente nada de otro colegio. Probar manipulando uuid en la URL.
- [ ] El visor de auditoría muestra lo que hizo el staff, incluidas las denegaciones.
- [ ] Revelar la clave de respuesta queda registrado.

### M13 · `deployment` — CI/CD
- [ ] El workflow `db.yml` ejecuta pgTAP de verdad (hoy no está comprobado).
- [ ] El job de escaneo de secretos detecta un secreto de prueba introducido a propósito.
- [ ] Un despliegue de preview funciona con las variables de Preview.
- [ ] Rollback documentado y probado una vez.

---

## 5 · Tres pasadas globales, al final

Cuando los 13 módulos estén verificados:

**Global 1 — Auditoría de seguridad.** Recorrido completo con los tres roles intentando salirse de su carril. Revisión de las 105 políticas RLS leyendo `0012` de arriba abajo. `get_advisors` de Supabase sin ningún WARN ni ERROR.

**Global 2 — Corrección.** Arreglar lo encontrado, cada cosa con su test.

**Global 3 — Validación end-to-end con datos reales.** Un colegio, dos clases, veinte alumnos, un examen completo, y la reconstrucción forense de cada intento.

---

## 6 · Instrucciones para el agente

### Antes de empezar
Lee en este orden: `MASTER_PLAN.md` (decisiones AD-1…AD-8) · `DATA_MODEL.md` (contrato del esquema) · `MODULES.md` (los 5 contratos entre módulos) · el `CLAUDE.md` del módulo que te toque · su `REVIEW.md` si existe.

Hay nueve `REVIEW.md` de las vías originales con hallazgos ya corregidos **y riesgos aceptados que siguen abiertos**. Léelos: ahí está lo que ya se sabe que cojea.

### Reglas
1. **Verifica ejecutando.** Pega la salida literal de los comandos. Nunca «debería funcionar».
2. **Contra datos reales** cuando el módulo toca datos. El proyecto tiene Supabase en producción con contenido cargado.
3. **Un test por hallazgo.** Que falle antes del arreglo y pase después.
4. **Declara los huecos.** Si algo no se puede probar, dilo. Un hueco declarado vale más que un verde falso.
5. **Nunca debilites una defensa para que un test pase.** Si el limitador de intentos hace fallar tus pruebas, el problema es tu prueba.
6. **No toques** `Y6A/` (read-only, no versionado), `secrets/`, `MASTER_PLAN.md`, `DATA_MODEL.md`.
7. **Un solo agente por módulo.** El trabajo en paralelo sobre las mismas carpetas es lo que produjo los seis desajustes.

### Comandos
```bash
pnpm verify                      # typecheck + lint + 976 tests + build
pnpm --filter @cet/web test:e2e  # 29 e2e (6 necesitan CET_E2E_ADMIN_*)
node scripts/demo-exam.ts        # materializa el simulacro con el motor real
```

### Entrega
Informa siempre de: qué verificaste y **cómo**, qué encontraste, la salida literal de la verificación, y qué **no** pudiste comprobar y por qué.

---

## 7 · Lo pendiente que bloquea

| Bloqueo | Quién |
|---|---|
| Recorrido del alumno sin verificar end-to-end | Siguiente agente |
| pgTAP nunca ejecutado | Siguiente agente |
| Cinco materias sin cargar en la base de datos | Siguiente agente |
| `SUPABASE_SERVICE_ROLE_KEY` solo en Production, no en Preview | Decisión pendiente |

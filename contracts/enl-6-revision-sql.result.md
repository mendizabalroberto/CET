# Resultado - enl-6-revision-sql
- Contrato: `contracts/enl-6-revision-sql.md`
- Modelo: deepseek-reasoner
- Desenlace: **informe**
- Rondas consumidas: 1 de 1
- Duracion: 261.8 s
# Informe de diagnóstico — cadena de invitación (0065–0068) y sus pgTAP

**Método.** No hay base de datos alcanzable, así que este informe es lectura estática fichero a fichero. Ninguna de las afirmaciones está ejecutada contra Postgres; cada hallazgo incluye el experimento que la confirmaría o la descartaría. Ninguna de las líneas que cito es un parche: son localizaciones.

---

## 1. [Crítico] `0066` no es aplicable al estado actual de producción: la constraint `profiles_alcance_por_rol` se valida contra filas que la violan, y la migración no trae la purga que su propia cabecera declara

**Fichero y línea.** `0066_alumno_sin_colegio.sql:23-32`; evidencia de estado en `0060_quitar_alcance_por_rol.sql:24-27`.

**Qué pasa.** `0066` añade:

```sql
add constraint profiles_alcance_por_rol check (
  case role when 'superadmin' then school_id is null
            when 'student'    then school_id is null
            when 'guardian'   then school_id is null
            else school_id is not null end
);
```

Sin `not valid`. Al aplicarse, Postgres valida la tabla entera.

`0060` documenta que en producción **ya existe una fila que viola exactamente esta regla**: «la única fila de alumno de producción ya la viola y ahí sigue». `0066` no contiene ninguna sentencia que borre o migre esa fila: su comentario dice que «la tarea 16 borra el único alumno que la violaría», pero esa tarea no viene en el conjunto de migraciones entregado. La migración asume un estado de datos que el repositorio no demuestra.

Además, `0003_tenancy.sql:109-110` define:

```sql
constraint profiles_superadmin_has_no_school
  check ((role = 'superadmin') = (school_id is null))
```

Esa constraint es un bicondicional: para `student` y `guardian` exige `school_id is not null`. Es decir, la nueva constraint de `0066` y la vieja de `0003` son **contradictorias entre sí**: con ambas activas, todo `student` o `guardian` viola una de las dos, sea cual sea su `school_id`. `0066` no elimina ni modifica la vieja. Si `0056` (no incluida en el encargo) no la eliminó, la base queda sin estado válido posible para alumnos y tutores.

**Qué se rompe en producción.** La migración `0066` fallará con `23514` en cuanto haya una fila `student` o `guardian` con `school_id` no nulo — y según `0060` esa fila existe. Si alguien la fuerza, el alta de alumnos y el cambio de idioma vuelven a romperse exactamente como documenta `0060`, porque la aplicación en producción escribe `school_id` al dar de alta. Es el mismo modo de fallo que ya ocurrió una vez.

**Experimento.** Sobre una copia con los datos de producción:
1. `select count(*) from public.profiles where (role='student' or role='guardian') and school_id is not null;`
2. `select conname from pg_constraint where conrelid='public.profiles'::regclass and conname='profiles_superadmin_has_no_school';`
3. Aplicar solo `0066` en una transacción de prueba y observar el `23514`.

**Si esta hipótesis fuese falsa** (es decir, si `0056` eliminó la constraint vieja y la tarea 16 ya purgó los datos), quedaría sin explicar por qué el test de `0066` inserta perfiles con `pin_hash='x'` (ver hallazgo 2) y por qué `0066` no trae la purga que su propio comentario dice necesitar.

---

## 2. [Crítico] El test `alumno_sin_colegio.sql` no puede pasar: siembra datos que violan constraints activas y usa un `pin_hash` prohibido

**Fichero y línea.** `supabase/tests/alumno_sin_colegio.sql:16-17` y `:12-14`; constraints en `0003_tenancy.sql:109-110` y `0003_tenancy.sql:193-196`.

**Qué pasa.** El test inserta en `public.students` un `pin_hash` con valor `'x'`, pero `0003` tiene:

```sql
constraint students_pin_hash_is_argon2id check (pin_hash ~ '^\$argon2id\$')
```

`'x'` no cumple el patrón: el `insert` falla con `23514` antes de que el test pueda probar la unicidad del índice. El `throws_ok` que espera `23505` por duplicado nunca llega a ejecutarse con una fila sembrada válida.

Además, el test inserta perfiles `student` y `guardian` con `school_id null`, lo que viola `profiles_superadmin_has_no_school` si esa constraint sigue activa (ver hallazgo 1). El propio `throws_ok` del final, que espera que un `guardian` con colegio lance `23514`, fallaría por el motivo contrario si la constraint vieja sigue viva: ese `insert` sería legal bajo `0003` y solo ilegal bajo la nueva constraint de `0066`.

**Qué se rompe en producción.** Nada directamente en runtime, pero el test es un falso guardián: no protege ni la unicidad del índice parcial ni la constraint de alcance. Si la suite lo da por verde, dará una confianza que no está ganada. Y como pgTAP aborta con el primer error de SQL, enmascara todos los asserts poster

> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.
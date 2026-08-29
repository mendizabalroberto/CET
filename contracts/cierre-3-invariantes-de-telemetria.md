---
id: cierre-3-invariantes-de-telemetria
model: chat
territory: [supabase/tests/telemetry_ingest.sql]
forbidden: [supabase/migrations/0010_telemetry.sql, supabase/migrations/0024_learning_events_ingest.sql, supabase/tests/helpers/fixture.psql]
context: [supabase/tests/telemetry_ingest.sql, supabase/migrations/0010_telemetry.sql, supabase/migrations/0024_learning_events_ingest.sql, supabase/tests/retencion_telemetria.sql]
verify: node scripts/db-test.mjs telemetry_ingest
rounds: 3
deadline: 3 rondas o 20 minutos
---

# Tres invariantes de telemetría llevan sin ejecutarse, y nadie lo sabía

`supabase/tests/telemetry_ingest.sql` termina en ERROR, no en rojo:

```
function is(name, text, unknown) does not exist
```

El último assert compara `c.relname` —que es de tipo `name`— contra un `text`.
pgTAP no unifica esa pareja y la función no existe. Como el error **aborta la
sentencia entera**, todo lo que hay antes deja de reportarse.

Entre lo que se ha dejado de comprobar, según la lectura del fichero, están los
apartados A1, A2 y A3: los `grant` de las tablas de telemetría, las particiones
de `learning_events`, y **que ninguna partición sea alcanzable por `anon` ni por
`authenticated`**. Es decir: el fichero que vigila que la telemetría de menores
no sea pública lleva tiempo sin vigilar nada, y este mismo mes se aplicaron cinco
migraciones que reescribieron políticas por todo el esquema.

## Qué hay que conseguir

1. **Arreglar la comparación** para que el fichero llegue hasta el final. Un
   `::text` en el sitio correcto basta; no cambies lo que el assert comprueba.
2. **Ejecutar el fichero completo y reportar qué sale**. Es posible que alguno de
   los tres invariantes recuperados salga **rojo**: llevan semanas sin correr y
   entre medias el esquema ha cambiado mucho.
3. Si alguno sale rojo: **no lo ajustes para que pase**. Un invariante de
   seguridad que se «adapta» a la realidad deja de ser un invariante. Déjalo
   rojo, y explica en el informe qué está mal en el esquema y por qué crees que
   está mal. Arreglar el esquema es otro encargo, con otro territorio.

## Por qué esto vale más que su tamaño

El arreglo son minutos. Lo que compra es saber si cinco migraciones de RLS
aplicadas esta semana dejaron una partición de telemetría de menores al alcance
de un usuario anónimo. Ahora mismo nadie lo sabe, y el fichero que debía
responder está mudo desde antes de que empezaran.

## Cuidado con el corredor

`scripts/db-test.mjs` reutiliza la conexión entre ficheros, así que un ERROR en
uno ensucia el estado de pgTAP del siguiente. Verifica **este fichero solo**
(`node scripts/db-test.mjs telemetry_ingest`) y no te fíes de lo que la batería
completa diga de sus vecinos. Ese defecto del corredor es otro encargo.

# Resultado - cierre-3-invariantes-de-telemetria
- Contrato: `contracts/cierre-3-invariantes-de-telemetria.md`
- Modelo: deepseek-chat
- Desenlace: **rojo**
- Rondas consumidas: 3 de 3
- Rama: `deepseek/cierre-3-invariantes-de-telemetria`
- Duracion: 22.4 s
## Salida final de `node scripts/db-test.mjs telemetry_ingest`

~~~

Conectado (via CET_DB_URL (aws-0-us-east-1.pooler.supabase.com)).

  telemetry_ingest.sql ... ERROR

1 de 1 ficheros en rojo.


--- telemetry_ingest.sql ---
function is(name, text, unknown) does not exist

~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.
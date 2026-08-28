# Resultado - tr-ict-a2
- Contrato: `contracts/tr-ict-a2.md`
- Modelo: deepseek-chat
- Desenlace: **rojo**
- Rondas consumidas: 5 de 5
- Rama: `deepseek/tr-ict-a2`
- Duracion: 97.7 s
## Salida final de `node scripts/deepseek/validar-traduccion.mjs contracts/fuentes/ict-a2.json supabase/migrations/0034_ict_es.sql`

~~~

fuente:    contracts/fuentes/ict-a2.json
migracion: supabase/migrations/0034_ict_es.sql
bloques esperados: 33   traducidos encontrados: 30

  2 FALLO(S):

   x Faltan 3 de 33 bloques por traducir. Primeros: 2:34, 2:35, 2:36
   x La migracion no menciona la materia 'ict'. Localiza por subjects.code.


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.
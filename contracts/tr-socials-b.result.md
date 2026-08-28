# Resultado - tr-socials-b
- Contrato: `contracts/tr-socials-b.md`
- Modelo: deepseek-chat
- Desenlace: **rojo**
- Rondas consumidas: 5 de 5
- Rama: `deepseek/tr-socials-b`
- Duracion: 201.1 s
## Salida final de `node scripts/deepseek/validar-traduccion.mjs contracts/fuentes/socials-b.json supabase/migrations/0041_socials_es.sql`

~~~

fuente:    contracts/fuentes/socials-b.json
migracion: supabase/migrations/0041_socials_es.sql
bloques esperados: 33   traducidos encontrados: 0

  4 FALLO(S):

   x No hay ninguna escritura sobre content o title.
   x No hay ninguna sentencia UPDATE.
   x Faltan 33 de 33 bloques por traducir. Primeros: 4:1, 4:2, 4:3, 4:4, 4:5, 4:6, 4:7, 4:8
   x La migracion no menciona la materia 'socials'. Localiza por subjects.code.


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.
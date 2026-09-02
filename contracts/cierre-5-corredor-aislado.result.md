# Resultado - cierre-5-corredor-aislado
- Contrato: `contracts/cierre-5-corredor-aislado.md`
- Motor: kimi-code CLI
- Modelo: kimi-code/kimi-for-coding
- Desenlace: **rojo**
- Rondas consumidas: 4 de 4
- Rama: `kimi/cierre-5-corredor-aislado`
- Duracion: 201.1 s
## Salida final de `pnpm test:scripts`

~~~
eturn[39m process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m[33m;[39m
    [90m346| [39m  [35mconst[39m raw [33m=[39m [34mreadFileSync[39m([34mjoin[39m(root[33m,[39m [32m"secrets"[39m[33m,[39m [32m"database.env"[39m)[33m,[39m [32m"utf[39m…
    [90m   | [39m              [31m^[39m
    [90m347| [39m  [35mconst[39m match [33m=[39m [36m/SUPABASE_DB_PASSWORD\s*=\s*(\S+)/[39m[33m.[39m[34mexec[39m(raw)[33m;[39m
    [90m348| [39m  [35mif[39m ([33m![39mmatch[33m?.[39m[[34m1[39m]) [35mthrow[39m [35mnew[39m [33mError[39m([32m"No se encontró SUPABASE_DB_PASSWOR[39m…
[90m [2m❯[22m conectar scripts/db-apply.mjs:[2m388:20[22m[39m
[90m [2m❯[22m Module.main scripts/db-apply.mjs:[2m464:19[22m[39m
[90m [2m❯[22m scripts/db-apply.test.mjs:[2m441:20[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/6]⎯[22m[39m

[31m[1m[7m FAIL [27m[22m[39m scripts/db-apply.test.mjs[2m > [22mmain() con la base simulada[2m > [22mcon todo registrado no ejecuta ni una migración
[31m[1mError[22m: ENOENT: no such file or directory, open 'D:\.cet-worktrees\cierre-5-corredor-aislado\secrets\database.env'[39m
[36m [2m❯[22m leerContrasena scripts/db-apply.mjs:[2m346:15[22m[39m
    [90m344| [39m[35mfunction[39m [34mleerContrasena[39m() {
    [90m345| [39m  [35mif[39m (process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m) [35mreturn[39m process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m[33m;[39m
    [90m346| [39m  [35mconst[39m raw [33m=[39m [34mreadFileSync[39m([34mjoin[39m(root[33m,[39m [32m"secrets"[39m[33m,[39m [32m"database.env"[39m)[33m,[39m [32m"utf[39m…
    [90m   | [39m              [31m^[39m
    [90m347| [39m  [35mconst[39m match [33m=[39m [36m/SUPABASE_DB_PASSWORD\s*=\s*(\S+)/[39m[33m.[39m[34mexec[39m(raw)[33m;[39m
    [90m348| [39m  [35mif[39m ([33m![39mmatch[33m?.[39m[[34m1[39m]) [35mthrow[39m [35mnew[39m [33mError[39m([32m"No se encontró SUPABASE_DB_PASSWOR[39m…
[90m [2m❯[22m conectar scripts/db-apply.mjs:[2m388:20[22m[39m
[90m [2m❯[22m Module.main scripts/db-apply.mjs:[2m464:19[22m[39m
[90m [2m❯[22m scripts/db-apply.test.mjs:[2m454:20[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/6]⎯[22m[39m

[31m[1m[7m FAIL [27m[22m[39m scripts/db-apply.test.mjs[2m > [22mmain() con la base simulada[2m > [22mun fichero cuyo contenido cambió para el proceso con error y sin aplicar NADA
[31m[1mError[22m: ENOENT: no such file or directory, open 'D:\.cet-worktrees\cierre-5-corredor-aislado\secrets\database.env'[39m
[36m [2m❯[22m leerContrasena scripts/db-apply.mjs:[2m346:15[22m[39m
    [90m344| [39m[35mfunction[39m [34mleerContrasena[39m() {
    [90m345| [39m  [35mif[39m (process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m) [35mreturn[39m process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m[33m;[39m
    [90m346| [39m  [35mconst[39m raw [33m=[39m [34mreadFileSync[39m([34mjoin[39m(root[33m,[39m [32m"secrets"[39m[33m,[39m [32m"database.env"[39m)[33m,[39m [32m"utf[39m…
    [90m   | [39m              [31m^[39m
    [90m347| [39m  [35mconst[39m match [33m=[39m [36m/SUPABASE_DB_PASSWORD\s*=\s*(\S+)/[39m[33m.[39m[34mexec[39m(raw)[33m;[39m
    [90m348| [39m  [35mif[39m ([33m![39mmatch[33m?.[39m[[34m1[39m]) [35mthrow[39m [35mnew[39m [33mError[39m([32m"No se encontró SUPABASE_DB_PASSWOR[39m…
[90m [2m❯[22m conectar scripts/db-apply.mjs:[2m388:20[22m[39m
[90m [2m❯[22m Module.main scripts/db-apply.mjs:[2m464:19[22m[39m
[90m [2m❯[22m scripts/db-apply.test.mjs:[2m470:20[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/6]⎯[22m[39m

[31m[1m[7m FAIL [27m[22m[39m scripts/db-apply.test.mjs[2m > [22mmain() con la base simulada[2m > [22m--dry lista pendientes y saltados sin ejecutar ni crear la tabla
[31m[1mError[22m: ENOENT: no such file or directory, open 'D:\.cet-worktrees\cierre-5-corredor-aislado\secrets\database.env'[39m
[36m [2m❯[22m leerContrasena scripts/db-apply.mjs:[2m346:15[22m[39m
    [90m344| [39m[35mfunction[39m [34mleerContrasena[39m() {
    [90m345| [39m  [35mif[39m (process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m) [35mreturn[39m process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m[33m;[39m
    [90m346| [39m  [35mconst[39m raw [33m=[39m [34mreadFileSync[39m([34mjoin[39m(root[33m,[39m [32m"secrets"[39m[33m,[39m [32m"database.env"[39m)[33m,[39m [32m"utf[39m…
    [90m   | [39m              [31m^[39m
    [90m347| [39m  [35mconst[39m match [33m=[39m [36m/SUPABASE_DB_PASSWORD\s*=\s*(\S+)/[39m[33m.[39m[34mexec[39m(raw)[33m;[39m
    [90m348| [39m  [35mif[39m ([33m![39mmatch[33m?.[39m[[34m1[39m]) [35mthrow[39m [35mnew[39m [33mError[39m([32m"No se encontró SUPABASE_DB_PASSWOR[39m…
[90m [2m❯[22m conectar scripts/db-apply.mjs:[2m388:20[22m[39m
[90m [2m❯[22m Module.main scripts/db-apply.mjs:[2m464:19[22m[39m
[90m [2m❯[22m scripts/db-apply.test.mjs:[2m487:20[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/6]⎯[22m[39m

[31m[1m[7m FAIL [27m[22m[39m scripts/db-apply.test.mjs[2m > [22mmain() con la base simulada[2m > [22m--marcar-aplicadas adopta el estado actual sin ejecutar ninguna migración
[31m[1mError[22m: ENOENT: no such file or directory, open 'D:\.cet-worktrees\cierre-5-corredor-aislado\secrets\database.env'[39m
[36m [2m❯[22m leerContrasena scripts/db-apply.mjs:[2m346:15[22m[39m
    [90m344| [39m[35mfunction[39m [34mleerContrasena[39m() {
    [90m345| [39m  [35mif[39m (process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m) [35mreturn[39m process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m[33m;[39m
    [90m346| [39m  [35mconst[39m raw [33m=[39m [34mreadFileSync[39m([34mjoin[39m(root[33m,[39m [32m"secrets"[39m[33m,[39m [32m"database.env"[39m)[33m,[39m [32m"utf[39m…
    [90m   | [39m              [31m^[39m
    [90m347| [39m  [35mconst[39m match [33m=[39m [36m/SUPABASE_DB_PASSWORD\s*=\s*(\S+)/[39m[33m.[39m[34mexec[39m(raw)[33m;[39m
    [90m348| [39m  [35mif[39m ([33m![39mmatch[33m?.[39m[[34m1[39m]) [35mthrow[39m [35mnew[39m [33mError[39m([32m"No se encontró SUPABASE_DB_PASSWOR[39m…
[90m [2m❯[22m conectar scripts/db-apply.mjs:[2m388:20[22m[39m
[90m [2m❯[22m Module.main scripts/db-apply.mjs:[2m464:19[22m[39m
[90m [2m❯[22m scripts/db-apply.test.mjs:[2m501:20[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/6]⎯[22m[39m

[31m[1m[7m FAIL [27m[22m[39m scripts/db-apply.test.mjs[2m > [22mmain() con la base simulada[2m > [22mel filtro por prefijo sigue funcionando para adoptar solo un tramo
[31m[1mError[22m: ENOENT: no such file or directory, open 'D:\.cet-worktrees\cierre-5-corredor-aislado\secrets\database.env'[39m
[36m [2m❯[22m leerContrasena scripts/db-apply.mjs:[2m346:15[22m[39m
    [90m344| [39m[35mfunction[39m [34mleerContrasena[39m() {
    [90m345| [39m  [35mif[39m (process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m) [35mreturn[39m process[33m.[39menv[33m.[39m[33mPGPASSWORD[39m[33m;[39m
    [90m346| [39m  [35mconst[39m raw [33m=[39m [34mreadFileSync[39m([34mjoin[39m(root[33m,[39m [32m"secrets"[39m[33m,[39m [32m"database.env"[39m)[33m,[39m [32m"utf[39m…
    [90m   | [39m              [31m^[39m
    [90m347| [39m  [35mconst[39m match [33m=[39m [36m/SUPABASE_DB_PASSWORD\s*=\s*(\S+)/[39m[33m.[39m[34mexec[39m(raw)[33m;[39m
    [90m348| [39m  [35mif[39m ([33m![39mmatch[33m?.[39m[[34m1[39m]) [35mthrow[39m [35mnew[39m [33mError[39m([32m"No se encontró SUPABASE_DB_PASSWOR[39m…
[90m [2m❯[22m conectar scripts/db-apply.mjs:[2m388:20[22m[39m
[90m [2m❯[22m Module.main scripts/db-apply.mjs:[2m464:19[22m[39m
[90m [2m❯[22m scripts/db-apply.test.mjs:[2m513:20[22m[39m

[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/6]⎯[22m[39m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.
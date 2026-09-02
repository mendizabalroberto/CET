# Traspaso — Delegación de contratos a Kimi

> © 2026 Roberto Mendizabal. Todos los derechos reservados.
> Hermano de `HANDOFF-DEEPSEEK.md`; no lo sustituye. Mismo formato de contrato,
> mismos invariantes, otro tipo de trabajador.
>
> **En una frase:** DeepSeek devuelve un diff que el motor aplica; Kimi es un
> agente de terminal que entra en un worktree aislado y edita el árbol él mismo,
> ejecuta la verificación y vuelve. El motor no le cree nada: guarda el
> territorio, verifica por código de salida y le pasa la contraprueba por
> mutación.
>
> **Estado: implementado y probado.** 11 pruebas verdes con un agente de
> mentira (`pnpm test:scripts`) y dos contratos reales de extremo a extremo
> —uno de parche y uno de informe— contra el CLI de verdad.

---

## 0 · Lo que hay que saber antes de lanzarlo

### 0.1 · La instalación

```powershell
npm install -g @moonshot-ai/kimi-code    # requiere Node >= 22.19
kimi                                      # dentro: /login (OAuth de Kimi Code)
```

En Windows necesita **Git for Windows**: usa su Git Bash como shell. Si está en
ruta rara, `KIMI_SHELL_PATH` al `bash.exe`.

No hay clave que rotar: la sesión es OAuth y vive en `~/.kimi-code/`. Esto lo
separa del problema de `secrets/accounts.env` que arrastra el motor DeepSeek.

### 0.2 · Kimi sí ve imágenes

`kimi-for-coding` y `k3` declaran `image_in` (y vídeo). Eso mueve la frontera de
lo delegable respecto a §0.2 del traspaso DeepSeek: lo visual deja de ser
automáticamente indelegable. **Pero** el motor no le pasa imágenes todavía: hoy
solo entra texto. Hasta que exista esa vía, §5.5 —capturas de quien toque
interfaz— lo sigue cumpliendo el humano.

### 0.3 · El presupuesto no son tokens, es cuota

No se factura por token: se consume la cuota de la suscripción. Ventana móvil de
5 h con ~300–1.200 peticiones según el plan, hasta 30 simultáneas, y una bolsa
semanal que se renueva cada 7 días desde la fecha de alta y **no acumula**. Un
contrato son decenas de peticiones internas, no una.

Consecuencia práctica: el lote va **en serie** y con tope de 4 contratos. Lo que
satura no es la API, es el portátil y el reloj.

---

## 1 · Los modelos, y a qué mandar cada uno

Alias del contrato (`model:`) → lo que hay en `~/.kimi-code/config.toml`:

| Alias | Modelo | Contexto | Coste de cuota | Para qué |
|---|---|---|---|---|
| `codigo` *(por defecto)* | `kimi-for-coding` (K2.7 Code) | 256K | normal | El caballo de batalla: tests, migraciones, traducciones, arreglos acotados |
| `k3` | `k3-256k` | 256K | normal | Cuando `codigo` falló la primera pasada: razona mejor, cuesta lo mismo |
| `k3-1m` | `k3` | hasta 1M *(Allegretto+)* | normal | Barridos de repositorio, refactors multi-fichero, auditorías anchas |

Aviso sobre el millón: `~/.kimi-code/config.toml` declara hoy **262144** también
para `k3`. El 1M lo abre el nivel de suscripción, no el motor; hasta que ese
número suba en el config, `k3-1m` y `k3` dan el mismo contexto y solo cambia el
reparto de cuota.
| `rapido` | `kimi-for-coding-highspeed` | 256K | **3×** | Solo cuando el reloj manda: ~6× más rápido |

Cambiar de modelo abre sesión nueva e invalida el caché de prompt: agrupa los
contratos por modelo en vez de alternarlos.

---

## 2 · Cómo se lanza

```bash
node scripts/kimi/run-contract.mjs contracts/mi-contrato.md
node scripts/kimi/run-contract.mjs --batch contracts/a.md contracts/b.md
```

El contrato es **el mismo fichero** que entiende el motor DeepSeek, más un campo:

```yaml
---
id: prac-d-escalera
model: codigo          # codigo | k3 | k3-1m | rapido
territory: [apps/web/app/practica/**]
forbidden: [apps/web/app/practica/layout.tsx]
context: [apps/web/app/practica/page.tsx]
verify: pnpm --filter web test -- escalera
setup: pnpm install --prefer-offline --frozen-lockfile
rounds: 3
timeout: 1200          # NUEVO: segundos por ronda. Un agente de terminal no
deadline: 2026-09-05   # tiene tope de tokens que lo corte; el tope es el reloj
---
```

Sin `territory` es **contrato de informe**: corre sobre el repositorio tal cual,
con un perfil de agente al que se le quitan `Write`, `Edit` y `CreateFile`, y su
respuesta se guarda entera en `contracts/<id>.result.md`.

---

## 3 · Los invariantes, que viven en el motor y no en el prompt

1. **Worktree aislado** en `../.cet-worktrees/<id>`, rama `kimi/<id>`. Nunca
   toca la rama del humano ni hace push.
2. **Territorio, después del hecho.** Kimi edita antes de que nadie pueda
   revisar, así que el guardia mira `git status` al volver. Un fichero fuera del
   territorio revierte **la ronda entera, también la parte buena**, y se lo dice.
3. **Verificación por código de salida.** Nunca por grep sobre la salida.
4. **Contraprueba por mutación.** Se revierte todo lo que no es test y se vuelve
   a verificar: si sigue verde, los tests no protegen nada y el verde se cae.
5. **El commit ajeno se deshace.** El agente tiene `Bash` y nada le impide hacer
   commit aunque se le prohíba; si lo hace, `git status` saldría limpio y el
   trabajo parecería vacío. El motor deshace el commit y mide el árbol.
6. **Un informe que escribe se para en seco.** No se revierte nada: en el
   repositorio de verdad hay trabajo del humano sin guardar, y no es del motor
   decidir qué sobra.
7. **Un lote con territorios que se pisan se rechaza entero**, como el otro motor.
8. **Consolida el humano.** Ni commit en main, ni push, ni despliegue.

---

## 4 · Dos trampas que costaron una ronda cada una

- **`-p` no se combina con `--yolo`, `--auto` ni `--plan`.** El CLI sale con
  error antes de hablar con nadie. En modo prompt la aprobación es automática y
  la única correa es el perfil de agente; el guardia de verdad es el motor.
- **La cabecera del fichero de agente es YAML de verdad.** Un `description:` con
  dos puntos sin comillas tumba el arranque entero con «bad indentation of a
  mapping entry». Hay una prueba que lo caza (`cabecera bien escrita`).

Y una de Windows: `kimi` es un `.cmd`, y Node se niega a lanzarlo sin shell
desde la 18.20. Meter un encargo de varios párrafos por `cmd.exe` es pedir que
una comilla lo rompa, así que el motor llama al `dist/main.mjs` con el mismo
`node` que lo corre. `KIMI_ENTRY` lo sobrescribe.

---

## 5 · Las pruebas

```bash
pnpm test:scripts    # incluye scripts/kimi/run-contract.test.mjs
```

Once pruebas, ni una gasta cuota: `scripts/kimi/__fixtures__/kimi-falso.mjs`
habla el mismo JSONL que el CLI real y hace lo que le diga un guion, una acción
por ronda. Lo que se prueba no es que el modelo sepa arreglar código —eso es
suyo— sino que **el motor sepa rechazar**: territorio invadido, `forbidden`,
falso verde, commit por su cuenta, árbol sin cambios, informe que escribe, lote
que se pisa, contrato sin plazo.

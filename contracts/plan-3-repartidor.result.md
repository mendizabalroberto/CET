# Resultado - plan-3-repartidor
- Contrato: `contracts/plan-3-repartidor.md`
- Modelo: deepseek-reasoner
- Desenlace: **verde**
- Rondas consumidas: 5 de 5
- Rama: `deepseek/plan-3-repartidor`
- Duracion: 858.2 s
## Diff

~~~diff
diff --git a/packages/engine/src/plan/repartir.test.ts b/packages/engine/src/plan/repartir.test.ts
new file mode 100644
index 0000000..33d0fbb
--- /dev/null
+++ b/packages/engine/src/plan/repartir.test.ts
@@ -0,0 +1,148 @@
+import { describe, expect, it } from "vitest";
+import { repartir } from "./repartir.js";
+import type { EntradaReparto, EventoCalendario, LeccionDisponible, MateriaDelPlan, SkillDisponible } from "./tipos.js";
+const leccion = (lessonId: string, moduloOrd: number, ord: number, minutos: number): LeccionDisponible => ({ lessonId, moduloOrd, ord, minutos, completada: false });
+const skill = (skillId: string, ord: number, preguntas: number, mastery: number | null = null): SkillDisponible => ({ skillId, ord, preguntas, mastery });
+const evento = (desde: string, hasta: string, tipo: EventoCalendario["tipo"]): EventoCalendario => ({ desde, hasta, tipo });
+const materia = (subjectId: string, code: string, peso: number, lecciones: readonly LeccionDisponible[], skills: readonly SkillDisponible[]): MateriaDelPlan => ({ subjectId, code, peso, lecciones, skills });
+const varias = (base: string, minutos: number[]): LeccionDisponible[] => minutos.map((minuto, indice) => leccion(`${base}-${indice + 1}`, 0, indice, minuto));
+const conPractica = (id: string): SkillDisponible => skill(id, 0, 1000, null);
+describe("repartir", () => {
+  it("descarta feriados y sin_clases", () => {
+    const reparto = repartir({
+      desde: "2026-09-21",
+      hasta: "2026-09-28",
+      minutosPorDia: 45,
+      calendario: [
+        evento("2026-09-23", "2026-09-23", "sin_clases"),
+        evento("2026-09-24", "2026-09-24", "feriado"),
+        evento("2026-09-25", "2026-09-25", "sin_clases"),
+      ],
+      materias: [materia("english", "english", 1, [], [conPractica("english-s")])],
+    } satisfies EntradaReparto);
+    const fechas = new Set(reparto.tareas.map((tarea) => tarea.fecha));
+    expect(fechas.has("2026-09-23")).toBe(false);
+    expect(fechas.has("2026-09-24")).toBe(false);
+    expect(fechas.has("2026-09-25")).toBe(false);
+    expect(reparto.tareas.length).toBeGreaterThan(0);
+  });
+  it("sábado 0,5 y examenes_finales 1,5", () => {
+    const reparto = repartir({
+      desde: "2026-09-03",
+      hasta: "2026-09-05",
+      minutosPorDia: 40,
+      calendario: [evento("2026-09-04", "2026-09-04", "examenes_finales")],
+      materias: [materia("english", "english", 1, [], [conPractica("english-s")])],
+    } satisfies EntradaReparto);
+    expect(reparto.minutosPresupuestados).toBe(120);
+    const porFecha = new Map<string, number>();
+    for (const tarea of reparto.tareas) porFecha.set(tarea.fecha, (porFecha.get(tarea.fecha) ?? 0) + tarea.minutos);
+    expect(porFecha.get("2026-09-03")).toBe(40);
+    expect(porFecha.get("2026-09-04")).toBe(60);
+    expect(porFecha.get("2026-09-05")).toBe(20);
+  });
+  it("30 minutos para una sola materia salen 25 + 5", () => {
+    const reparto = repartir({
+      desde: "2026-09-02",
+      hasta: "2026-09-02",
+      minutosPorDia: 30,
+      calendario: [],
+      materias: [materia("english", "english", 1, [], [conPractica("english-s")])],
+    } satisfies EntradaReparto);
+    expect(reparto.minutosPlanificados).toBe(30);
+    expect(reparto.tareas.map((tarea) => tarea.minutos)).toEqual([25, 5]);
+  });
+  it("una lección de 35 se reparte en dos tareas con el mismo lessonId", () => {
+    const tareas = repartir({
+      desde: "2026-09-02",
+      hasta: "2026-09-03",
+      minutosPorDia: 25,
+      calendario: [],
+      materias: [materia("math", "math", 1, [leccion("l1", 0, 0, 35)], [])],
+    } satisfies EntradaReparto).tareas;
+    expect(tareas).toHaveLength(2);
+    expect(tareas[0]).toMatchObject({ lessonId: "l1", skillId: null, minutos: 25 });
+    expect(tareas[1]).toMatchObject({ lessonId: "l1", skillId: null, minutos: 10 });
+  });
+  it("agota lecciones, pasa a práctica rotando skills y evita preguntas 0", () => {
+    const tareas = repartir({
+      desde: "2026-09-02",
+      hasta: "2026-09-02",
+      minutosPorDia: 30,
+      calendario: [],
+      materias: [
+        materia("math", "math", 1, [leccion("l1", 0, 0, 10)], [
+          skill("cero", 0, 0, 0.1),
+          skill("floja", 1, 30, 0.2),
+          skill("fuerte", 2, 30, 0.9),
+        ]),
+      ],
+    } satisfies EntradaReparto).tareas;
+    expect(tareas[0]).toMatchObject({ tipo: "leccion", lessonId: "l1", minutos: 10 });
+    expect(tareas[1]).toMatchObject({ tipo: "practica", skillId: "floja", minutos: 15 });
+    expect(tareas[2]).toMatchObject({ tipo: "practica", skillId: "fuerte", minutos: 5 });
+    expect(tareas.some((tarea) => tarea.skillId === "cero")).toBe(false);
+  });
+  it("aplica techo a math y redistribuye sin perder presupuesto", () => {
+    const mathLecciones = [
+      leccion("m1", 0, 0, 22),
+      leccion("m2", 1, 0, 22),
+      leccion("m3", 2, 0, 22),
+      leccion("m4", 3, 0, 22),
+      leccion("m5", 4, 0, 8),
+    ];
+    const reparto = repartir({
+      desde: "2026-09-07",
+      hasta: "2026-11-15",
+      minutosPorDia: 45,
+      calendario: [],
+      materias: [
+        materia("math", "math", 0.25, mathLecciones, [skill("math-s", 0, 16, 0.2)]),
+        materia("english", "english", 0.75, [], [skill("english-s", 0, 4000, 0.4)]),
+      ],
+    } satisfies EntradaReparto);
+    expect(reparto.minutosPresupuestados).toBe(2710);
+    expect(reparto.minutosPlanificados).toBe(2710);
+    expect(reparto.techos).toHaveLength(1);
+    expect(reparto.techos[0]).toMatchObject({ subjectId: "math", code: "math", minutosDisponibles: 108 });
+  });
+  it("LEO: dos materias por día y bloques entre 5 y 25", () => {
+    const entrada = {
+      desde: "2026-09-02",
+      hasta: "2026-11-13",
+      minutosPorDia: 45,
+      calendario: [
+        evento("2026-09-23", "2026-09-23", "sin_clases"),
+        evento("2026-09-24", "2026-09-24", "feriado"),
+        evento("2026-09-25", "2026-09-25", "sin_clases"),
+        evento("2026-10-27", "2026-10-27", "sin_clases"),
+        evento("2026-11-02", "2026-11-02", "feriado"),
+        evento("2026-11-13", "2026-11-20", "examenes_finales"),
+      ],
+      materias: [
+        materia("english", "english", 0.35, varias("english-l", [20, 20, 20, 20, 12]), [skill("english-s", 0, 86, 0.4)]),
+        materia("math", "math", 0.25, varias("math-l", [12, 12, 12, 12, 12, 12, 12, 12]), [skill("math-s", 0, 16, 0.3)]),
+        materia("spanish", "spanish", 0.2, varias("spanish-l", [20, 20, 19]), [skill("spanish-s", 0, 93, 0.5)]),
+        materia("science", "science", 0.1, varias("science-l", [15, 15, 14, 14, 14]), [skill("science-s", 0, 78, 0.6)]),
+        materia("socials", "socials", 0.1, varias("socials-l", [20, 20, 20, 20, 20, 19]), [skill("socials-s", 0, 165, 0.8)]),
+      ],
+    } satisfies EntradaReparto;
+    const reparto = repartir(entrada);
+    // Con el inventario real todas las materias tocan techo, así que el plan no agota el presupuesto.
+    expect(reparto.techos).toHaveLength(entrada.materias.length);
+    expect(reparto.minutosPlanificados).toBeLessThan(reparto.minutosPresupuestados);
+    const fechas = new Set(reparto.tareas.map((tarea) => tarea.fecha));
+    expect(fechas.has("2026-09-24")).toBe(false);
+    expect(fechas.has("2026-11-02")).toBe(false);
+    const materiasPorDia = new Map<string, Set<string>>();
+    for (const tarea of reparto.tareas) {
+      expect(tarea.minutos).toBeGreaterThanOrEqual(5);
+      expect(tarea.minutos).toBeLessThanOrEqual(25);
+      expect((tarea.lessonId === null) !== (tarea.skillId === null)).toBe(true);
+      const set = materiasPorDia.get(tarea.fecha) ?? new Set<string>();
+      set.add(tarea.subjectId);
+      materiasPorDia.set(tarea.fecha, set);
+    }
+    for (const set of materiasPorDia.values()) expect(set.size).toBeLessThanOrEqual(2);
+  });
+});
diff --git a/packages/engine/src/plan/repartir.ts b/packages/engine/src/plan/repartir.ts
new file mode 100644
index 0000000..0d895d4
--- /dev/null
+++ b/packages/engine/src/plan/repartir.ts
@@ -0,0 +1,160 @@
+import type { EntradaReparto, EventoCalendario, FechaISO, MateriaDelPlan, Reparto, SkillDisponible, Tarea, TechoDeMateria } from "./tipos.js";
+const EPS = 1e-9;
+const factorTecho = 0.75;
+type DiaPlan = { fecha: FechaISO; presupuesto: number };
+type LeccionViva = { lessonId: string; moduloOrd: number; ord: number; saldo: number };
+type Estado = { subjectId: string; code: string; lecciones: LeccionViva[]; skills: SkillDisponible[] };
+function sumarDias(fecha: FechaISO, delta: number): FechaISO {
+    const f = new Date(`${fecha}T00:00:00Z`);
+    f.setUTCDate(f.getUTCDate() + delta);
+    return f.toISOString().slice(0, 10);
+}
+function enEvento(evento: EventoCalendario, fecha: FechaISO): boolean {
+    return evento.desde <= fecha && fecha <= evento.hasta;
+}
+function generarDias(entrada: EntradaReparto): DiaPlan[] {
+    const dias: DiaPlan[] = [];
+    for (let fecha = entrada.desde; fecha <= entrada.hasta; fecha = sumarDias(fecha, 1)) {
+        const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
+        const finde = dia === 0 || dia === 6;
+        if (entrada.calendario.some((e) => (e.tipo === "feriado" || e.tipo === "sin_clases") && enEvento(e, fecha))) continue;
+        let factor = finde ? 0.5 : 1;
+        for (const e of entrada.calendario) {
+            if (!enEvento(e, fecha)) continue;
+            if (e.tipo === "examenes_finales") factor *= 1.5;
+            if (e.tipo === "vacaciones") factor *= 0.4;
+        }
+        dias.push({ fecha, presupuesto: Math.round(entrada.minutosPorDia * factor) });
+    }
+    return dias;
+}
+function techo(materia: MateriaDelPlan): number {
+    const lecciones = materia.lecciones.filter((l) => !l.completada).reduce((a, l) => a + l.minutos, 0);
+    const preguntas = materia.skills.reduce((a, s) => a + s.preguntas, 0);
+    return lecciones + preguntas * factorTecho;
+}
+function crearEstado(materia: MateriaDelPlan): Estado {
+    return {
+        subjectId: materia.subjectId,
+        code: materia.code,
+        lecciones: materia.lecciones.filter((l) => !l.completada).sort((a, b) => a.moduloOrd - b.moduloOrd || a.ord - b.ord || a.lessonId.localeCompare(b.lessonId)).map((l) => ({ lessonId: l.lessonId, moduloOrd: l.moduloOrd, ord: l.ord, saldo: l.minutos })),
+        skills: materia.skills.filter((s) => s.preguntas > 0).sort((a, b) => (a.mastery ?? -1) - (b.mastery ?? -1) || a.ord - b.ord || a.skillId.localeCompare(b.skillId)),
+    };
+}
+function calcularCuotas(entrada: EntradaReparto, minutosPresupuestados: number): { cuotas: Map<string, number>; techos: TechoDeMateria[] } {
+    const materias = [...entrada.materias];
+    const reales = new Map(materias.map((m) => [m.subjectId, techo(m)]));
+    const pedido = new Map(materias.map((m) => [m.subjectId, m.peso * minutosPresupuestados]));
+    const techadas = new Set<string>();
+    const techos: TechoDeMateria[] = [];
+    for (;;) {
+        const materia = materias.find((m) => !techadas.has(m.subjectId) && (pedido.get(m.subjectId) ?? 0) > (reales.get(m.subjectId) ?? 0) + EPS);
+        if (!materia) break;
+        const sobrante = (pedido.get(materia.subjectId) ?? 0) - (reales.get(materia.subjectId) ?? 0);
+        techadas.add(materia.subjectId);
+        techos.push({ subjectId: materia.subjectId, code: materia.code, minutosPedidos: Math.round(pedido.get(materia.subjectId) ?? 0), minutosDisponibles: Math.round(reales.get(materia.subjectId) ?? 0) });
+        pedido.set(materia.subjectId, reales.get(materia.subjectId) ?? 0);
+        const resto = materias.filter((m) => !techadas.has(m.subjectId));
+        const pesos = resto.reduce((a, m) => a + m.peso, 0);
+        for (const m of resto) if (pesos > EPS) pedido.set(m.subjectId, (pedido.get(m.subjectId) ?? 0) + sobrante * (m.peso / pesos));
+    }
+    return { cuotas: new Map(materias.map((m) => [m.subjectId, Math.round(pedido.get(m.subjectId) ?? 0)])), techos };
+}
+function partir(total: number): number[] {
+    if (total < 5) return [];
+    if (total <= 25) return [total];
+    const bloques: number[] = [];
+    const llenos = Math.floor(total / 25);
+    const resto = total % 25;
+    for (let i = 0; i < llenos; i += 1) bloques.push(25);
+    if (resto >= 5) bloques.push(resto);
+    else if (resto > 0) {
+        bloques.pop();
+        const ultimo = 25 + resto;
+        bloques.push(Math.ceil(ultimo / 2), Math.floor(ultimo / 2));
+    }
+    return bloques;
+}
+function repartoDia(presupuesto: number, candidatos: { subjectId: string; pendiente: number }[]): { subjectId: string; minutos: number }[] {
+    if (presupuesto < 5 || candidatos.length === 0) return [];
+    const primero = candidatos[0]!;
+    const primeroValido = Math.min(presupuesto, primero.pendiente);
+    if (candidatos.length === 1 || presupuesto < 10) return primeroValido >= 5 ? [{ subjectId: primero.subjectId, minutos: primeroValido }] : [];
+    const segundo = candidatos[1]!;
+    let a = Math.min(Math.ceil(presupuesto / 2), primero.pendiente);
+    let b = Math.min(Math.floor(presupuesto / 2), segundo.pendiente);
+    let restante = presupuesto - a - b;
+    if (restante > 0 && primero.pendiente > a) {
+        const extra = Math.min(restante, primero.pendiente - a);
+        a += extra;
+        restante -= extra;
+    }
+    if (restante > 0 && segundo.pendiente > b) {
+        const extra = Math.min(restante, segundo.pendiente - b);
+        b += extra;
+        restante -= extra;
+    }
+    const resultado: { subjectId: string; minutos: number }[] = [];
+    if (a >= 5) resultado.push({ subjectId: primero.subjectId, minutos: a });
+    if (b >= 5) resultado.push({ subjectId: segundo.subjectId, minutos: b });
+    return resultado;
+}
+function materializar(estado: Estado, fecha: FechaISO, solicitud: number, tareas: Tarea[], ord: { valor: number }): number {
+    let producido = 0;
+    let skillIndex = 0;
+    for (const bloque of partir(solicitud)) {
+        let restante = bloque;
+        while (restante > 0) {
+            const indiceLeccion = estado.lecciones.findIndex((l) => l.saldo >= 5);
+            if (indiceLeccion >= 0) {
+                const leccion = estado.lecciones[indiceLeccion]!;
+                const consumo = Math.min(restante, leccion.saldo);
+                if (consumo < 5) break;
+                tareas.push({ fecha, ord: ord.valor, subjectId: estado.subjectId, tipo: "leccion" as const, lessonId: leccion.lessonId, skillId: null, minutos: consumo });
+                ord.valor += 1;
+                producido += consumo;
+                leccion.saldo -= consumo;
+                restante -= consumo;
+                continue;
+            }
+            if (estado.skills.length === 0 || restante < 5) break;
+            const skill = estado.skills[skillIndex % estado.skills.length]!;
+            skillIndex += 1;
+            tareas.push({ fecha, ord: ord.valor, subjectId: estado.subjectId, tipo: "practica" as const, lessonId: null, skillId: skill.skillId, minutos: restante });
+            ord.valor += 1;
+            producido += restante;
+            restante = 0;
+        }
+    }
+    return producido;
+}
+export function repartir(entrada: EntradaReparto): Reparto {
+    const dias = generarDias(entrada);
+    const minutosPresupuestados = dias.reduce((a, d) => a + d.presupuesto, 0);
+    const { cuotas, techos } = calcularCuotas(entrada, minutosPresupuestados);
+    const estados = new Map(entrada.materias.map((m) => [m.subjectId, crearEstado(m)]));
+    const codigos = new Map(entrada.materias.map((m) => [m.subjectId, m.code]));
+    const pendientes = new Map(cuotas);
+    const tareas: Tarea[] = [];
+    const ord = { valor: 0 };
+    for (const dia of dias) {
+        if (dia.presupuesto < 5) continue;
+        ord.valor = 0;
+        const candidatos: { subjectId: string; pendiente: number }[] = [];
+        for (const materia of entrada.materias) {
+            const estado = estados.get(materia.subjectId);
+            const pendiente = pendientes.get(materia.subjectId) ?? 0;
+            if (!estado || pendiente < 5) continue;
+            if (estado.skills.length === 0 && !estado.lecciones.some((l) => l.saldo >= 5)) continue;
+            candidatos.push({ subjectId: materia.subjectId, pendiente });
+        }
+        candidatos.sort((a, b) => b.pendiente - a.pendiente || (codigos.get(a.subjectId) ?? "").localeCompare(codigos.get(b.subjectId) ?? "") || a.subjectId.localeCompare(b.subjectId));
+        for (const asigna of repartoDia(dia.presupuesto, candidatos)) {
+            const estado = estados.get(asigna.subjectId)!;
+            const hecho = materializar(estado, dia.fecha, asigna.minutos, tareas, ord);
+            pendientes.set(asigna.subjectId, Math.max(0, (pendientes.get(asigna.subjectId) ?? 0) - hecho));
+        }
+    }
+    tareas.sort((a, b) => (a.fecha === b.fecha ? a.ord - b.ord : a.fecha.localeCompare(b.fecha)));
+    return { tareas, techos, minutosPlanificados: tareas.reduce((a, t) => a + t.minutos, 0), minutosPresupuestados };
+}

~~~

## Salida final de `pnpm --filter @cet/engine typecheck && pnpm --filter @cet/engine lint && pnpm --filter @cet/engine exec vitest run src/plan`

~~~

> @cet/engine@0.1.0 typecheck D:\.cet-worktrees\plan-3-repartidor\packages\engine
> tsc --noEmit


> @cet/engine@0.1.0 lint D:\.cet-worktrees\plan-3-repartidor\packages\engine
> eslint src


[1m[7m[36m RUN [39m[27m[22m [36mv2.1.9 [39m[90mD:/.cet-worktrees/plan-3-repartidor/packages/engine[39m

 [32m✓[39m src/plan/repartir.test.ts [2m([22m[2m7 tests[22m[2m)[22m[90m 11[2mms[22m[39m

[2m Test Files [22m [1m[32m1 passed[39m[22m[90m (1)[39m
[2m      Tests [22m [1m[32m7 passed[39m[22m[90m (7)[39m
[2m   Start at [22m 12:51:45
[2m   Duration [22m 261ms[2m (transform 37ms, setup 0ms, collect 32ms, tests 11ms, environment 0ms, prepare 84ms)[22m


~~~


> Consolida el humano. El motor no hace commit en main, ni push, ni despliega.
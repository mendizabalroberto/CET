import type { EntradaReparto, EventoCalendario, FechaISO, MateriaDelPlan, Reparto, SkillDisponible, Tarea, TechoDeMateria } from "./tipos.js";
const EPS = 1e-9;
const factorTecho = 0.75;
type DiaPlan = { fecha: FechaISO; presupuesto: number };
type LeccionViva = { lessonId: string; moduloOrd: number; ord: number; saldo: number };
type Estado = { subjectId: string; code: string; lecciones: LeccionViva[]; skills: SkillDisponible[] };
function sumarDias(fecha: FechaISO, delta: number): FechaISO {
    const f = new Date(`${fecha}T00:00:00Z`);
    f.setUTCDate(f.getUTCDate() + delta);
    return f.toISOString().slice(0, 10);
}
function enEvento(evento: EventoCalendario, fecha: FechaISO): boolean {
    return evento.desde <= fecha && fecha <= evento.hasta;
}
function generarDias(entrada: EntradaReparto): DiaPlan[] {
    const dias: DiaPlan[] = [];
    for (let fecha = entrada.desde; fecha <= entrada.hasta; fecha = sumarDias(fecha, 1)) {
        const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay();
        const finde = dia === 0 || dia === 6;
        if (entrada.calendario.some((e) => (e.tipo === "feriado" || e.tipo === "sin_clases") && enEvento(e, fecha))) continue;
        let factor = finde ? 0.5 : 1;
        for (const e of entrada.calendario) {
            if (!enEvento(e, fecha)) continue;
            if (e.tipo === "examenes_finales") factor *= 1.5;
            if (e.tipo === "vacaciones") factor *= 0.4;
        }
        dias.push({ fecha, presupuesto: Math.round(entrada.minutosPorDia * factor) });
    }
    return dias;
}
function techo(materia: MateriaDelPlan): number {
    const lecciones = materia.lecciones.filter((l) => !l.completada).reduce((a, l) => a + l.minutos, 0);
    const preguntas = materia.skills.reduce((a, s) => a + s.preguntas, 0);
    return lecciones + preguntas * factorTecho;
}
function crearEstado(materia: MateriaDelPlan): Estado {
    return {
        subjectId: materia.subjectId,
        code: materia.code,
        lecciones: materia.lecciones.filter((l) => !l.completada).sort((a, b) => a.moduloOrd - b.moduloOrd || a.ord - b.ord || a.lessonId.localeCompare(b.lessonId)).map((l) => ({ lessonId: l.lessonId, moduloOrd: l.moduloOrd, ord: l.ord, saldo: l.minutos })),
        skills: materia.skills.filter((s) => s.preguntas > 0).sort((a, b) => (a.mastery ?? -1) - (b.mastery ?? -1) || a.ord - b.ord || a.skillId.localeCompare(b.skillId)),
    };
}
function calcularCuotas(entrada: EntradaReparto, minutosPresupuestados: number): { cuotas: Map<string, number>; techos: TechoDeMateria[] } {
    const materias = [...entrada.materias];
    const reales = new Map(materias.map((m) => [m.subjectId, techo(m)]));
    const pedido = new Map(materias.map((m) => [m.subjectId, m.peso * minutosPresupuestados]));
    const techadas = new Set<string>();
    const techos: TechoDeMateria[] = [];
    for (;;) {
        const materia = materias.find((m) => !techadas.has(m.subjectId) && (pedido.get(m.subjectId) ?? 0) > (reales.get(m.subjectId) ?? 0) + EPS);
        if (!materia) break;
        const sobrante = (pedido.get(materia.subjectId) ?? 0) - (reales.get(materia.subjectId) ?? 0);
        techadas.add(materia.subjectId);
        techos.push({ subjectId: materia.subjectId, code: materia.code, minutosPedidos: Math.round(pedido.get(materia.subjectId) ?? 0), minutosDisponibles: Math.round(reales.get(materia.subjectId) ?? 0) });
        pedido.set(materia.subjectId, reales.get(materia.subjectId) ?? 0);
        const resto = materias.filter((m) => !techadas.has(m.subjectId));
        const pesos = resto.reduce((a, m) => a + m.peso, 0);
        for (const m of resto) if (pesos > EPS) pedido.set(m.subjectId, (pedido.get(m.subjectId) ?? 0) + sobrante * (m.peso / pesos));
    }
    return { cuotas: new Map(materias.map((m) => [m.subjectId, Math.round(pedido.get(m.subjectId) ?? 0)])), techos };
}
function partir(total: number): number[] {
    if (total < 5) return [];
    if (total <= 25) return [total];
    const bloques: number[] = [];
    const llenos = Math.floor(total / 25);
    const resto = total % 25;
    for (let i = 0; i < llenos; i += 1) bloques.push(25);
    if (resto >= 5) bloques.push(resto);
    else if (resto > 0) {
        bloques.pop();
        const ultimo = 25 + resto;
        bloques.push(Math.ceil(ultimo / 2), Math.floor(ultimo / 2));
    }
    return bloques;
}
function repartoDia(presupuesto: number, candidatos: { subjectId: string; pendiente: number }[]): { subjectId: string; minutos: number }[] {
    if (presupuesto < 5 || candidatos.length === 0) return [];
    const primero = candidatos[0]!;
    const primeroValido = Math.min(presupuesto, primero.pendiente);
    if (candidatos.length === 1 || presupuesto < 10) return primeroValido >= 5 ? [{ subjectId: primero.subjectId, minutos: primeroValido }] : [];
    const segundo = candidatos[1]!;
    let a = Math.min(Math.ceil(presupuesto / 2), primero.pendiente);
    let b = Math.min(Math.floor(presupuesto / 2), segundo.pendiente);
    let restante = presupuesto - a - b;
    if (restante > 0 && primero.pendiente > a) {
        const extra = Math.min(restante, primero.pendiente - a);
        a += extra;
        restante -= extra;
    }
    if (restante > 0 && segundo.pendiente > b) {
        const extra = Math.min(restante, segundo.pendiente - b);
        b += extra;
        restante -= extra;
    }
    const resultado: { subjectId: string; minutos: number }[] = [];
    if (a >= 5) resultado.push({ subjectId: primero.subjectId, minutos: a });
    if (b >= 5) resultado.push({ subjectId: segundo.subjectId, minutos: b });
    return resultado;
}
function materializar(estado: Estado, fecha: FechaISO, solicitud: number, tareas: Tarea[], ord: { valor: number }): number {
    let producido = 0;
    let skillIndex = 0;
    for (const bloque of partir(solicitud)) {
        let restante = bloque;
        while (restante > 0) {
            const indiceLeccion = estado.lecciones.findIndex((l) => l.saldo >= 5);
            if (indiceLeccion >= 0) {
                const leccion = estado.lecciones[indiceLeccion]!;
                const consumo = Math.min(restante, leccion.saldo);
                if (consumo < 5) break;
                tareas.push({ fecha, ord: ord.valor, subjectId: estado.subjectId, tipo: "leccion" as const, lessonId: leccion.lessonId, skillId: null, minutos: consumo });
                ord.valor += 1;
                producido += consumo;
                leccion.saldo -= consumo;
                restante -= consumo;
                continue;
            }
            if (estado.skills.length === 0 || restante < 5) break;
            const skill = estado.skills[skillIndex % estado.skills.length]!;
            skillIndex += 1;
            tareas.push({ fecha, ord: ord.valor, subjectId: estado.subjectId, tipo: "practica" as const, lessonId: null, skillId: skill.skillId, minutos: restante });
            ord.valor += 1;
            producido += restante;
            restante = 0;
        }
    }
    return producido;
}
export function repartir(entrada: EntradaReparto): Reparto {
    const dias = generarDias(entrada);
    const minutosPresupuestados = dias.reduce((a, d) => a + d.presupuesto, 0);
    const { cuotas, techos } = calcularCuotas(entrada, minutosPresupuestados);
    const estados = new Map(entrada.materias.map((m) => [m.subjectId, crearEstado(m)]));
    const codigos = new Map(entrada.materias.map((m) => [m.subjectId, m.code]));
    const pendientes = new Map(cuotas);
    const tareas: Tarea[] = [];
    const ord = { valor: 0 };
    for (const dia of dias) {
        if (dia.presupuesto < 5) continue;
        ord.valor = 0;
        const candidatos: { subjectId: string; pendiente: number }[] = [];
        for (const materia of entrada.materias) {
            const estado = estados.get(materia.subjectId);
            const pendiente = pendientes.get(materia.subjectId) ?? 0;
            if (!estado || pendiente < 5) continue;
            if (estado.skills.length === 0 && !estado.lecciones.some((l) => l.saldo >= 5)) continue;
            candidatos.push({ subjectId: materia.subjectId, pendiente });
        }
        candidatos.sort((a, b) => b.pendiente - a.pendiente || (codigos.get(a.subjectId) ?? "").localeCompare(codigos.get(b.subjectId) ?? "") || a.subjectId.localeCompare(b.subjectId));
        for (const asigna of repartoDia(dia.presupuesto, candidatos)) {
            const estado = estados.get(asigna.subjectId)!;
            const hecho = materializar(estado, dia.fecha, asigna.minutos, tareas, ord);
            pendientes.set(asigna.subjectId, Math.max(0, (pendientes.get(asigna.subjectId) ?? 0) - hecho));
        }
    }
    tareas.sort((a, b) => (a.fecha === b.fecha ? a.ord - b.ord : a.fecha.localeCompare(b.fecha)));
    return { tareas, techos, minutosPlanificados: tareas.reduce((a, t) => a + t.minutos, 0), minutosPresupuestados };
}

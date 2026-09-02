import type {
  EntradaReparto,
  EventoCalendario,
  ExamenDelAlumno,
  FechaISO,
  MateriaDelPlan,
  Reparto,
  SkillDisponible,
  Tarea,
  TechoDeMateria,
} from "./tipos.js";
const EPS = 1e-9;
const factorTecho = 0.75;
type DiaPlan = { fecha: FechaISO; presupuesto: number };
type LeccionViva = { lessonId: string; moduloOrd: number; ord: number; saldo: number };
type Estado = {
  subjectId: string;
  code: string;
  lecciones: LeccionViva[];
  skills: SkillDisponible[];
};
// Fechas sin `Date`: el motor prohíbe `new Date(` (determinism.test.ts) y aquí
// no hace falta un reloj, solo aritmética de calendario civil (Hinnant).
function diasDesdeEpoca(fecha: FechaISO): number {
  const y0 = Number(fecha.slice(0, 4));
  const m = Number(fecha.slice(5, 7));
  const d = Number(fecha.slice(8, 10));
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
function fechaDesdeEpoca(dias: number): FechaISO {
  const z = dias + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}
/** 0 = domingo … 6 = sábado, como `getUTCDay()`. El 1970-01-01 fue jueves (4). */
function diaDeLaSemana(fecha: FechaISO): number {
  return (((diasDesdeEpoca(fecha) + 4) % 7) + 7) % 7;
}
function sumarDias(fecha: FechaISO, delta: number): FechaISO {
  return fechaDesdeEpoca(diasDesdeEpoca(fecha) + delta);
}
function enEvento(evento: EventoCalendario, fecha: FechaISO): boolean {
  return evento.desde <= fecha && fecha <= evento.hasta;
}
/** Días de antelación de `fecha` a `examen` (1 = el día antes, 7 = una semana antes). */
function diasHastaExamen(fecha: FechaISO, examen: FechaISO): number {
  return diasDesdeEpoca(examen) - diasDesdeEpoca(fecha);
}
/** `true` si `fecha` cae en la ventana de empuje (7 días antes, examen excluido) de algún examen. */
function enVentanaDeAlgunExamen(examenes: readonly ExamenDelAlumno[], fecha: FechaISO): boolean {
  return examenes.some((examen) => {
    const dias = diasHastaExamen(fecha, examen.fecha);
    return dias >= 1 && dias <= 7;
  });
}
function generarDias(entrada: EntradaReparto): DiaPlan[] {
  const dias: DiaPlan[] = [];
  const examenes = entrada.examenes ?? [];
  for (let fecha = entrada.desde; fecha <= entrada.hasta; fecha = sumarDias(fecha, 1)) {
    const dia = diaDeLaSemana(fecha);
    const finde = dia === 0 || dia === 6;
    if (
      entrada.calendario.some(
        (e) => (e.tipo === "feriado" || e.tipo === "sin_clases") && enEvento(e, fecha),
      )
    )
      continue;
    let factor = finde ? 0.5 : 1;
    // examenes_finales (x1,5) y la ventana de empuje de un examen (x1,25) no se
    // acumulan: se queda con el mayor de los dos factores de intensidad.
    let factorIntensidad = 1;
    for (const e of entrada.calendario) {
      if (!enEvento(e, fecha)) continue;
      if (e.tipo === "examenes_finales") factorIntensidad = Math.max(factorIntensidad, 1.5);
      if (e.tipo === "vacaciones") factor *= 0.4;
    }
    if (enVentanaDeAlgunExamen(examenes, fecha)) factorIntensidad = Math.max(factorIntensidad, 1.25);
    factor *= factorIntensidad;
    dias.push({ fecha, presupuesto: Math.round(entrada.minutosPorDia * factor) });
  }
  return dias;
}
/** Agrupa por materia los exámenes propios (ignora los generales, `subjectId: null`). */
function agruparExamenesPorMateria(
  examenes: readonly ExamenDelAlumno[] | undefined,
): Map<string, FechaISO[]> {
  const porMateria = new Map<string, FechaISO[]>();
  for (const examen of examenes ?? []) {
    if (examen.subjectId === null) continue;
    const fechas = porMateria.get(examen.subjectId) ?? [];
    fechas.push(examen.fecha);
    porMateria.set(examen.subjectId, fechas);
  }
  return porMateria;
}
/** El examen más próximo cuya ventana de empuje cubre `fecha`, o `undefined` si ninguno. */
function examenEnVentana(fechasExamen: readonly FechaISO[], fecha: FechaISO): FechaISO | undefined {
  let masProximo: FechaISO | undefined;
  for (const examen of fechasExamen) {
    const dias = diasHastaExamen(fecha, examen);
    if (dias >= 1 && dias <= 7 && (!masProximo || examen < masProximo)) masProximo = examen;
  }
  return masProximo;
}
/** `true` si algún examen de la materia ya pasó (`fecha` es posterior a él). */
function huboExamenAntes(fechasExamen: readonly FechaISO[], fecha: FechaISO): boolean {
  return fechasExamen.some((examen) => examen < fecha);
}
/**
 * Reordena los candidatos del día: primero las materias en ventana de empuje
 * (la de examen más próximo primero), luego el orden habitual, y al final las
 * materias que ya tuvieron su examen y no tienen otro por delante.
 */
function reordenarPorExamenes<T extends { subjectId: string }>(
  candidatos: readonly T[],
  examenesPorMateria: Map<string, FechaISO[]>,
  fecha: FechaISO,
): T[] {
  if (examenesPorMateria.size === 0) return [...candidatos];
  const frente: { candidato: T; proximo: FechaISO }[] = [];
  const medio: T[] = [];
  const fondo: T[] = [];
  for (const candidato of candidatos) {
    const fechasExamen = examenesPorMateria.get(candidato.subjectId) ?? [];
    const proximo = examenEnVentana(fechasExamen, fecha);
    if (proximo) frente.push({ candidato, proximo });
    else if (huboExamenAntes(fechasExamen, fecha)) fondo.push(candidato);
    else medio.push(candidato);
  }
  frente.sort((a, b) => a.proximo.localeCompare(b.proximo));
  return [...frente.map((f) => f.candidato), ...medio, ...fondo];
}
function techo(materia: MateriaDelPlan): number {
  const lecciones = materia.lecciones
    .filter((l) => !l.completada)
    .reduce((a, l) => a + l.minutos, 0);
  const preguntas = materia.skills.reduce((a, s) => a + s.preguntas, 0);
  return lecciones + preguntas * factorTecho;
}
/**
 * Reordena `elementos` poniendo primero los ids listados en `prioridad` (en
 * ese orden; ids desconocidos se ignoran) y después el resto en el orden que
 * ya traía `elementos` (se asume ya ordenado por el criterio habitual).
 */
function anteponerPrioridad<T>(
  elementos: readonly T[],
  prioridad: readonly string[] | undefined,
  id: (elemento: T) => string,
): T[] {
  if (!prioridad || prioridad.length === 0) return [...elementos];
  const porId = new Map(elementos.map((e) => [id(e), e]));
  const priorizados: T[] = [];
  const vistos = new Set<string>();
  for (const pid of prioridad) {
    const elemento = porId.get(pid);
    if (elemento && !vistos.has(pid)) {
      priorizados.push(elemento);
      vistos.add(pid);
    }
  }
  const resto = elementos.filter((e) => !vistos.has(id(e)));
  return [...priorizados, ...resto];
}
function crearEstado(materia: MateriaDelPlan): Estado {
  const leccionesOrdenadas = materia.lecciones
    .filter((l) => !l.completada)
    .sort(
      (a, b) => a.moduloOrd - b.moduloOrd || a.ord - b.ord || a.lessonId.localeCompare(b.lessonId),
    );
  const skillsOrdenados = materia.skills
    .filter((s) => s.preguntas > 0)
    .sort(
      (a, b) =>
        (a.mastery ?? -1) - (b.mastery ?? -1) ||
        a.ord - b.ord ||
        a.skillId.localeCompare(b.skillId),
    );
  return {
    subjectId: materia.subjectId,
    code: materia.code,
    lecciones: anteponerPrioridad(
      leccionesOrdenadas,
      materia.prioridadLecciones,
      (l) => l.lessonId,
    ).map((l) => ({ lessonId: l.lessonId, moduloOrd: l.moduloOrd, ord: l.ord, saldo: l.minutos })),
    skills: anteponerPrioridad(skillsOrdenados, materia.prioridadSkills, (s) => s.skillId),
  };
}
function calcularCuotas(
  entrada: EntradaReparto,
  minutosPresupuestados: number,
): { cuotas: Map<string, number>; techos: TechoDeMateria[] } {
  const materias = [...entrada.materias];
  const reales = new Map(materias.map((m) => [m.subjectId, techo(m)]));
  const pedido = new Map(materias.map((m) => [m.subjectId, m.peso * minutosPresupuestados]));
  const techadas = new Set<string>();
  const techos: TechoDeMateria[] = [];
  for (;;) {
    const materia = materias.find(
      (m) =>
        !techadas.has(m.subjectId) &&
        (pedido.get(m.subjectId) ?? 0) > (reales.get(m.subjectId) ?? 0) + EPS,
    );
    if (!materia) break;
    const sobrante = (pedido.get(materia.subjectId) ?? 0) - (reales.get(materia.subjectId) ?? 0);
    techadas.add(materia.subjectId);
    techos.push({
      subjectId: materia.subjectId,
      code: materia.code,
      minutosPedidos: Math.round(pedido.get(materia.subjectId) ?? 0),
      minutosDisponibles: Math.round(reales.get(materia.subjectId) ?? 0),
    });
    pedido.set(materia.subjectId, reales.get(materia.subjectId) ?? 0);
    const resto = materias.filter((m) => !techadas.has(m.subjectId));
    const pesos = resto.reduce((a, m) => a + m.peso, 0);
    for (const m of resto)
      if (pesos > EPS)
        pedido.set(m.subjectId, (pedido.get(m.subjectId) ?? 0) + sobrante * (m.peso / pesos));
  }
  return {
    cuotas: new Map(materias.map((m) => [m.subjectId, Math.round(pedido.get(m.subjectId) ?? 0)])),
    techos,
  };
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
function repartoDia(
  presupuesto: number,
  candidatos: { subjectId: string; pendiente: number }[],
): { subjectId: string; minutos: number }[] {
  if (presupuesto < 5 || candidatos.length === 0) return [];
  const primero = candidatos[0]!;
  const primeroValido = Math.min(presupuesto, primero.pendiente);
  if (candidatos.length === 1 || presupuesto < 10)
    return primeroValido >= 5 ? [{ subjectId: primero.subjectId, minutos: primeroValido }] : [];
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
function materializar(
  estado: Estado,
  fecha: FechaISO,
  solicitud: number,
  tareas: Tarea[],
  ord: { valor: number },
): number {
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
        tareas.push({
          fecha,
          ord: ord.valor,
          subjectId: estado.subjectId,
          tipo: "leccion" as const,
          lessonId: leccion.lessonId,
          skillId: null,
          minutos: consumo,
        });
        ord.valor += 1;
        producido += consumo;
        leccion.saldo -= consumo;
        restante -= consumo;
        continue;
      }
      if (estado.skills.length === 0 || restante < 5) break;
      const skill = estado.skills[skillIndex % estado.skills.length]!;
      skillIndex += 1;
      tareas.push({
        fecha,
        ord: ord.valor,
        subjectId: estado.subjectId,
        tipo: "practica" as const,
        lessonId: null,
        skillId: skill.skillId,
        minutos: restante,
      });
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
  const examenesPorMateria = agruparExamenesPorMateria(entrada.examenes);
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
    candidatos.sort(
      (a, b) =>
        b.pendiente - a.pendiente ||
        (codigos.get(a.subjectId) ?? "").localeCompare(codigos.get(b.subjectId) ?? "") ||
        a.subjectId.localeCompare(b.subjectId),
    );
    const candidatosOrdenados = reordenarPorExamenes(candidatos, examenesPorMateria, dia.fecha);
    for (const asigna of repartoDia(dia.presupuesto, candidatosOrdenados)) {
      const estado = estados.get(asigna.subjectId)!;
      const hecho = materializar(estado, dia.fecha, asigna.minutos, tareas, ord);
      pendientes.set(
        asigna.subjectId,
        Math.max(0, (pendientes.get(asigna.subjectId) ?? 0) - hecho),
      );
    }
  }
  tareas.sort((a, b) => (a.fecha === b.fecha ? a.ord - b.ord : a.fecha.localeCompare(b.fecha)));
  return {
    tareas,
    techos,
    minutosPlanificados: tareas.reduce((a, t) => a + t.minutos, 0),
    minutosPresupuestados,
  };
}

/**
 * Vista previa de desarrollo del informe de seguimiento de un hijo.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * PARA QUÉ EXISTE
 * ===========================================================================
 * Para poder MIRAR las gráficas del informe sin entrar con las credenciales de
 * ningún tutor y sin que haya un niño de verdad detrás de los números. La
 * pantalla real —`/tutor/hijos/[id]`— vive detrás de la sesión del tutor y de
 * la RLS, y verificar un cambio de dibujo entrando con una cuenta real es lo
 * que este proyecto no hace.
 *
 * Es la ruta hermana de `/dev/materias-preview`, `/dev/practice-preview`,
 * `/dev/keyboard-preview` y `/dev/migas-preview`, y sigue su misma regla.
 *
 * ===========================================================================
 * PASA POR LA TUBERÍA DE VERDAD, NO POR UN ATAJO
 * ===========================================================================
 * Lo que se fabrica aquí es un `SeguimientoDeHijo` —la forma EXACTA que
 * devuelven las consultas— y se pasa por `propsDeSeguimiento()`, que es la
 * misma función que usa la página real. Ni un `StudyScorecardProps` escrito a
 * mano: si se escribieran las props del scorecard directamente, esta vista
 * previa podría enseñar un informe bonito mientras la pantalla real pinta otra
 * cosa, y entonces no verifica nada. Aquí se elige el DATO; el resto lo decide
 * el mismo código que corre en producción.
 *
 * ===========================================================================
 * LOS CASOS SON LOS QUE ROMPEN, NO LOS QUE LUCEN
 * ===========================================================================
 * Una semana normal está la primera porque es la que se mira, pero las otras
 * son las que importan: la semana con huecos de sincronización (que NO es una
 * semana sin estudiar), la semana entera a cero (que sí es un resultado) y el
 * alumno recién dado de alta (que no tiene informe y tiene que decirlo). Las
 * tres son la diferencia entre «no lo sabemos» y «va mal», que es la línea que
 * este informe no puede cruzar.
 *
 * ===========================================================================
 * NO SALE A PRODUCCIÓN
 * ===========================================================================
 * `notFound()` en cuanto `NODE_ENV` no es `development`. Es una comprobación de
 * servidor, no una bandera de compilación: aunque alguien la despliegue por
 * error, la ruta devuelve 404. No lee nada de la base de datos.
 */
import { notFound } from "next/navigation";

import { Seguimiento } from "@/components/tutor/Seguimiento";
import { resolveLocale } from "@/lib/i18n/server";
import type { SeguimientoDeHijo } from "@/lib/tutor/queries";
import { propsDeSeguimiento } from "@/lib/tutor/seguimiento";

/** Siete días consecutivos terminados en hoy, en `YYYY-MM-DD`. */
function ultimosDias(cuantos: number): readonly string[] {
  const hoy = new Date();
  return Array.from({ length: cuantos }, (_, i) => {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() - (cuantos - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

/** El reloj completo: veinticuatro horas, las vacías a cero, como la base. */
function reloj(porHora: Readonly<Record<number, number>>): SeguimientoDeHijo["horas"] {
  return Array.from({ length: 24 }, (_, hora) => ({
    hora,
    minutos: porHora[hora] ?? 0,
    eventos: (porHora[hora] ?? 0) > 0 ? 6 : 0,
  }));
}

interface Caso {
  readonly titulo: string;
  readonly nota: string;
  readonly seguimiento: SeguimientoDeHijo;
  readonly nombre: string;
}

function casos(): readonly Caso[] {
  const dias = ultimosDias(7);
  const dia = (i: number): string => dias[i] ?? (dias[0] as string);

  /** Destrezas y lecciones son iguales en los tres casos: aquí no se miden. */
  const destrezas: SeguimientoDeHijo["destrezas"] = [
    { id: "math.simplify", nombre: { es: "Simplificar fracciones", en: "Simplify fractions" }, mastery: 0.92 },
    {
      id: "math.fracop",
      nombre: {
        es: "Sumar y restar fracciones con distinto denominador",
        en: "Add and subtract fractions with unlike denominators",
      },
      mastery: 0.41,
    },
    { id: "math.compare", nombre: { es: "Comparar fracciones", en: "Compare fractions" }, mastery: 0.68 },
    { id: "math.decimals", nombre: { es: "Decimales", en: "Decimals" }, mastery: null },
  ];

  const lecciones: SeguimientoDeHijo["lecciones"] = [
    {
      id: "l1",
      nombre: { es: "Sumar y restar fracciones con distinto denominador", en: "Unlike denominators" },
      minutos: 52,
    },
    { id: "l2", nombre: { es: "Simplificar fracciones", en: "Simplify fractions" }, minutos: 31 },
    { id: "l3", nombre: { es: "Comparar fracciones", en: "Compare fractions" }, minutos: 18 },
    { id: "l4", nombre: { es: "Fracciones equivalentes", en: "Equivalent fractions" }, minutos: 7 },
  ];

  const minutosNormales = [22, 0, 45, 38, 0, 61, 27];

  return [
    {
      titulo: "Una semana normal",
      nota:
        "Lo que ve un padre la mayoría de las veces. Mira que las gráficas LLENEN el panel: " +
        "si el dibujo ocupa un tercio y sobran dos tercios de blanco, la medida del contenedor " +
        "no está llegando. Recorre las columnas con el tabulador: cada día tiene que dar su cifra.",
      nombre: "Leo",
      seguimiento: {
        dias: 7,
        resumen: {
          minutosEstudio: 193,
          sesiones: 9,
          leccionesAbiertas: 5,
          leccionesCompletadas: 3,
          itemsRespondidos: 128,
          porcentajeAcierto: 74,
          examenesEntregados: 1,
          pistasPedidas: 11,
          rachaMaxima: 3,
        },
        serie: dias.map((fecha, i) => ({ fecha, minutos: minutosNormales[i] ?? 0 })),
        destrezas,
        lecciones,
        horas: reloj({ 17: 12, 18: 34, 19: 41, 20: 18, 21: 9, 8: 6 }),
        logro: dias.map((fecha, i) => ({
          fecha,
          leccionesCompletadas: [1, 0, 2, 1, 0, 3, 1][i] ?? 0,
          itemsRespondidos: [14, 0, 31, 22, 0, 38, 19][i] ?? 0,
          aciertos: [11, 0, 24, 15, 0, 30, 13][i] ?? 0,
        })),
      },
    },
    {
      titulo: "Con huecos de sincronización",
      nota:
        "Tres días SIN REGISTRO en medio, que no es lo mismo que tres días sin estudiar. " +
        "Los huecos van en columna hueca y discontinua, más bajos que el suelo de un día con " +
        "estudio; los ceros van macizos pegados a la línea base. Mírala en escala de grises: " +
        "si las dos formas se confunden, el informe acusa a un niño de un fallo del portátil.",
      nombre: "Ana",
      seguimiento: {
        dias: 7,
        resumen: {
          minutosEstudio: 74,
          sesiones: 4,
          leccionesAbiertas: 2,
          leccionesCompletadas: 1,
          itemsRespondidos: 46,
          porcentajeAcierto: 61,
          examenesEntregados: 0,
          pistasPedidas: 8,
          rachaMaxima: 1,
        },
        serie: dias.map((fecha, i) => ({
          fecha,
          minutos: [31, null, null, 0, 43, null, 0][i] ?? null,
        })),
        destrezas,
        lecciones: lecciones.slice(0, 2),
        horas: reloj({ 16: 22, 17: 31, 22: 21 }),
        logro: [
          { fecha: dia(0), leccionesCompletadas: 1, itemsRespondidos: 22, aciertos: 14 },
          { fecha: dia(4), leccionesCompletadas: 0, itemsRespondidos: 24, aciertos: 14 },
        ],
      },
    },
    {
      titulo: "La semana entera a cero",
      nota:
        "Siete ceros macizos. NO es un hueco: es la respuesta —dura, pero cierta— a «¿ha " +
        "estudiado?». El reloj no se pinta (no hay ni un minuto que atribuir a una hora) y la " +
        "nube tampoco (no hay días con esfuerzo que cruzar). Que falten esos dos paneles es lo " +
        "correcto; lo que estaría mal es un panel con un título y un hueco debajo.",
      nombre: "Mar",
      seguimiento: {
        dias: 7,
        resumen: {
          minutosEstudio: 0,
          sesiones: 0,
          leccionesAbiertas: 0,
          leccionesCompletadas: 0,
          itemsRespondidos: 0,
          porcentajeAcierto: 0,
          examenesEntregados: 0,
          pistasPedidas: 0,
          rachaMaxima: 0,
        },
        serie: dias.map((fecha) => ({ fecha, minutos: 0 })),
        destrezas,
        lecciones: [],
        horas: reloj({}),
        logro: [],
      },
    },
  ];
}

export default async function InformePreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const locale = await resolveLocale(null);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-ink">Informe del hijo — vista previa</h1>
        <p className="max-w-prose text-sm text-muted">
          Los mismos paneles de <code>/tutor/hijos/[id]</code>, con datos fabricados que pasan
          por <code>propsDeSeguimiento()</code>. Míralo a 360 px y a 900 px: las gráficas se
          miden contra su panel, así que las dos anchuras tienen que verse llenas y con la letra
          del eje al mismo tamaño. Después, en escala de grises y a 200 % de texto.
        </p>
        <p className="max-w-prose text-sm text-muted">
          Idioma activo: <strong className="text-ink">{locale}</strong>
        </p>
      </header>

      {casos().map((caso) => {
        const scorecard = propsDeSeguimiento(caso.seguimiento, caso.nombre, locale);
        return (
          <section key={caso.titulo} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{caso.titulo}</h2>
            <p className="max-w-prose text-sm text-muted">{caso.nota}</p>
            {scorecard === null ? (
              <p className="text-sm text-ink">
                Sin nada que contar: aquí la pantalla real pinta la frase de «todavía no hay
                informe», no un scorecard de nueve ceros.
              </p>
            ) : (
              <Seguimiento locale={locale} scorecard={scorecard} />
            )}
          </section>
        );
      })}
    </main>
  );
}

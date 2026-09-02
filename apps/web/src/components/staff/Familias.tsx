"use client";

/**
 * Familias en /admin — los alumnos que ningún colegio puede listar.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * ===========================================================================
 * QUÉ AGUJERO TAPA ESTA PANTALLA
 * ===========================================================================
 * `/admin` es POR COLEGIO: se elige uno en `?school=` y todo lo demás se filtra
 * por él. Desde `0066` el producto también vive fuera de los colegios — un
 * tutor da de alta a su hijo y ese alumno nace con `school_id = null` — y el
 * resultado medido en producción era este:
 *
 *     Cambridge Demo School .... 0 alumnos
 *     (sin colegio) ............ 2 alumnos   <- los únicos reales
 *
 * Se eligiera el colegio que se eligiera, la tabla salía vacía y los dos únicos
 * alumnos de verdad eran invisibles para el superadmin, que tenía que abrir la
 * base a mano para saber que existían.
 *
 * Por eso esta sección vive FUERA del selector de colegio, al lado de
 * `InvitarTutor` y por el mismo motivo que aquel: una familia no pertenece a
 * ningún colegio, así que preguntarle a esta pantalla «¿de qué colegio?» no
 * tiene respuesta.
 *
 * ===========================================================================
 * POR QUÉ ES UN COMPONENTE DE CLIENTE SI NO TIENE NI UN `onClick`
 * ===========================================================================
 * No por interactividad: `Card`, `Table`, `StatTile` y `EmptyState` de
 * `@cet/ui` resuelven sus textos con `useI18n()`, que es un hook y necesita el
 * contexto que monta `StaffChrome`. Es la misma frontera que ya cruza
 * `AdminPanel`, y por eso lo que llega por props ya viene decidido y
 * serializado desde el servidor.
 *
 * ===========================================================================
 * LO QUE NO SE PINTA
 * ===========================================================================
 * Ni `pin_hash`, ni tokens, ni `token_hash`, ni la IP de nadie, ni el
 * user-agent de la tablet de un niño. Del dispositivo solo se dice SI existe;
 * del enlace, SI está vivo. Un panel de administración que enseña de más sobre
 * un menor no es más útil, es más peligroso.
 */
import type { Locale } from "@cet/shared";
import { Badge, Card, EmptyState, StatTile, Table, type TableColumn } from "@cet/ui";
import type { ReactNode } from "react";

import { formatSchoolTime } from "./dates";
import { fill, ui, type StaffDictionary } from "./i18n";
import type { FamiliaHijo, FamiliesData, InvitacionPendiente } from "./queries";

/**
 * UTC, y dicho en voz alta en la pantalla.
 *
 * El resto del área de personal sella las horas con `schools.timezone` porque
 * una entrega fuera de plazo se decide en la zona del colegio (ver `dates.ts`).
 * Una familia no tiene colegio, así que no hay zona que heredar. Se podría
 * inventar una —la del navegador, la de España— pero inventarla es peor que
 * decir cuál es: aquí ninguna hora decide nada, solo informa, y una hora
 * etiquetada es una hora que se puede convertir.
 */
const ZONA = "UTC";

interface Props {
  readonly data: FamiliesData;
  readonly locale: Locale;
  readonly t: StaffDictionary;
}

export function Familias({ data, locale, t }: Props): ReactNode {
  const F = t.admin.families;
  const cuando = (valor: string | null): string => formatSchoolTime(valor, ZONA, locale, "minute");

  const totalHijos = data.familias.reduce((suma, familia) => suma + familia.hijos.length, 0);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-bold text-ink">{F.title}</h2>
        <p className="mt-1 max-w-prose text-muted">{F.body}</p>
        <p className="mt-1 text-xs text-muted">{F.timezoneNote}</p>
      </header>

      {/* El resumen va ARRIBA y es de tres cifras: cuántas familias, cuántos
          hijos y cuánta gente sigue sin canjear su invitación. Es lo único que
          se puede leer de un vistazo antes de bajar a las tablas. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile value={String(data.familias.length)} label={ui(F.summary.families)} />
        <StatTile value={String(totalHijos)} label={ui(F.summary.children)} />
        <StatTile
          // Si la cola no se pudo leer, la cifra NO es cero: es «no se sabe».
          // Pintar un 0 aquí sería afirmar algo que esta pantalla no comprobó.
          value={data.invitacionesDisponibles ? String(data.invitaciones.length) : t.common.none}
          valueText={data.invitacionesDisponibles ? undefined : t.common.notAvailable}
          label={ui(F.summary.pendingInvites)}
        />
      </div>

      {data.familias.length === 0 ? (
        // Sin `title`: el `h2` de la cabecera de arriba ya dice "Familias", y
        // `Card` pinta otro `h2`. Dos encabezados con el mismo texto seguidos
        // no organizan nada y le hacen leer la sección dos veces a quien navega
        // por encabezados con un lector de pantalla.
        <Card padding="md">
          <EmptyState title={ui(F.empty)} body={ui(F.emptyBody)} />
        </Card>
      ) : (
        <ul className="flex list-none flex-col gap-4 p-0">
          {data.familias.map((familia) => (
            <li key={familia.guardianId}>
              <Card padding="md">
                <h3 className="text-lg font-bold text-ink">{familia.guardianName}</h3>
                <p className="text-sm text-muted">
                  {`${F.guardian} · ${familia.guardianEmail ?? F.noEmail}`}
                </p>

                <div className="mt-3">
                  {familia.hijos.length === 0 ? (
                    // Un tutor que se ha dado de alta y todavía no ha añadido a
                    // nadie es un caso NORMAL, no una tabla rota: se dice con
                    // una frase, no con una tabla de cero filas.
                    <p className="text-muted">{F.noChildren}</p>
                  ) : (
                    <Table<FamiliaHijo>
                      caption={ui(fill(F.childrenCaption, { guardian: familia.guardianName }))}
                      rows={familia.hijos}
                      rowKey={(hijo) => hijo.profileId}
                      columns={columnasDeHijos(t, cuando)}
                    />
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ColaDeInvitaciones data={data} t={t} cuando={cuando} />
    </section>
  );
}

/* ========================================================================== */
/* Los hijos                                                                  */
/* ========================================================================== */

/**
 * El `Badge` nunca va solo: lleva SIEMPRE su palabra dentro. El color no es el
 * portador de la información (WCAG 1.4.1), y en esta tabla la diferencia entre
 * «tiene dispositivo» y «no lo tiene» decide si el superadmin llama al tutor.
 */
function columnasDeHijos(
  t: StaffDictionary,
  cuando: (valor: string | null) => string,
): ReadonlyArray<TableColumn<FamiliaHijo>> {
  const F = t.admin.families;

  return [
    {
      key: "name",
      header: ui(F.child),
      rowHeader: true,
      cell: (hijo) => hijo.fullName,
    },
    {
      key: "code",
      header: ui(F.code),
      // Monoespaciada: `FAM-175377` se dicta por teléfono, y una tipografía de
      // ancho fijo es lo que impide confundir un 0 con una O al leerlo.
      cell: (hijo) => <span className="font-mono">{hijo.studentCode}</span>,
    },
    {
      key: "year",
      header: ui(F.yearLevel),
      align: "end",
      cell: (hijo) => (hijo.yearLevel === 0 ? t.common.none : String(hijo.yearLevel)),
    },
    {
      key: "stage",
      header: ui(F.stage),
      cell: (hijo) => etapa(hijo.stage, t),
    },
    {
      key: "device",
      header: ui(F.device),
      cell: (hijo) =>
        hijo.hayDispositivo ? (
          <Badge tone="success">{F.deviceYes}</Badge>
        ) : (
          <Badge tone="neutral">{F.deviceNo}</Badge>
        ),
    },
    {
      key: "link",
      header: ui(F.link),
      cell: (hijo) =>
        hijo.hayEnlaceVivo ? (
          // `info` y no `warning`: un enlace vivo sin canjear no es una alarma,
          // es el estado esperado de un niño al que su tutor acaba de dar de
          // alta. Lo que dice es «este todavía no ha entrado nunca».
          <Badge tone="info">{F.linkLive}</Badge>
        ) : (
          <Badge tone="neutral">{F.linkNone}</Badge>
        ),
    },
    {
      key: "lastAccess",
      header: ui(F.lastAccess),
      cell: (hijo) =>
        hijo.ultimoAccesoAt === null ? (
          <span className="text-muted">{F.never}</span>
        ) : (
          cuando(hijo.ultimoAccesoAt)
        ),
    },
  ];
}

/**
 * `students.stage` es un valor de base de datos (`primary` / `secondary`). Si
 * mañana apareciera un tercero, se pinta CRUDO en vez de en blanco: un hueco no
 * se puede depurar, y "tertiary" en pantalla dice exactamente qué falta.
 */
function etapa(valor: string, t: StaffDictionary): string {
  if (valor === "primary") return t.admin.families.stagePrimary;
  if (valor === "secondary") return t.admin.families.stageSecondary;
  return valor === "" ? t.common.none : valor;
}

/* ========================================================================== */
/* La cola de invitaciones                                                    */
/* ========================================================================== */

function ColaDeInvitaciones({
  data,
  t,
  cuando,
}: {
  readonly data: FamiliesData;
  readonly t: StaffDictionary;
  readonly cuando: (valor: string | null) => string;
}): ReactNode {
  const I = t.admin.families.invites;

  return (
    // `h3` y no `h2`: cuelga de la cabecera "Familias" de esta misma sección.
    // Un nivel de encabezado no es decoración, es el índice con el que se
    // navega la página con un lector de pantalla.
    <Card padding="md" title={ui(I.title)} headingAs="h3">
      {!data.invitacionesDisponibles ? (
        // NO se pinta un estado vacío aquí. «No hay ninguna invitación» y «no he
        // podido mirar» son dos frases distintas, y confundirlas hace que el
        // superadmin dé por invitada a gente a la que nadie invitó.
        <p
          role="status"
          className="mt-3 rounded-lg border-l-4 border-danger bg-danger/10 px-4 py-3 text-[15px] text-ink"
        >
          {I.unavailable}
        </p>
      ) : data.invitaciones.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={ui(I.empty)} body={ui(I.emptyBody)} />
        </div>
      ) : (
        <div className="mt-3">
          <Table<InvitacionPendiente>
            caption={ui(I.caption)}
            rows={data.invitaciones}
            rowKey={(fila) => fila.id}
            columns={[
              {
                key: "email",
                header: ui(I.email),
                rowHeader: true,
                cell: (fila) => fila.email,
              },
              { key: "issued", header: ui(I.issued), cell: (fila) => cuando(fila.createdAt) },
              { key: "expires", header: ui(I.expires), cell: (fila) => cuando(fila.expiresAt) },
            ]}
          />
        </div>
      )}
    </Card>
  );
}

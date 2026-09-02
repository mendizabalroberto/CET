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
 *
 * ===========================================================================
 * LOS ACCESOS: DESPLEGABLE POR HIJO, Y POR QUÉ NO UNA SECCIÓN APARTE
 * ===========================================================================
 * Un acceso solo significa algo AL LADO del niño al que pertenece. «Santa Cruz
 * de la Sierra, Chrome en Android, hace dos horas» no es información hasta que
 * se sabe de quién es, y una tabla global obligaría a repetir el nombre en cada
 * fila para poder volver a agruparlos con la vista.
 *
 * Cerrado por defecto, con un `<details>` nativo: con dos hijos y cinco accesos
 * abrirlo todo cabría, pero con doscientos hijos la página sería un muro de
 * miles de filas que nadie lee. Y `<details>` no necesita estado ni JavaScript
 * —lo abre el navegador—, así que funciona igual con el teclado y lo anuncia
 * solo un lector de pantalla.
 *
 * Lo que estas tablas NO pintan, y no por olvido: la IP y las coordenadas. La
 * migración 0088 las deja fuera del `GRANT` de `authenticated` porque unas
 * coordenadas con seis decimales se leen como la dirección de un niño cuando
 * son el centroide de su ciudad. Se dice en pantalla (`privacyNote`) para que
 * quien administre esto no lo tome por una carencia y pida ampliarlo.
 */
import type { Locale } from "@cet/shared";
import { Badge, Card, EmptyState, StatTile, Table, type TableColumn } from "@cet/ui";
import type { ReactNode } from "react";

import { formatSchoolTime } from "./dates";
import { fill, ui, type StaffDictionary } from "./i18n";
import type {
  AccesoDeAlumno,
  Familia,
  FamiliaHijo,
  FamiliesData,
  InvitacionPendiente,
} from "./queries";

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

                <AccesosDeLaFamilia familia={familia} t={t} cuando={cuando} />
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
/* Los accesos                                                                */
/* ========================================================================== */

/**
 * Un desplegable por hijo, y ninguno para el que no ha entrado nunca.
 *
 * A un hijo sin accesos NO se le pinta un `<details>` vacío: abrir algo para
 * encontrar «nada» es peor que no ofrecerlo, y esa información ya la da la
 * columna «Último acceso» de la tabla de arriba, que en ese caso dice «No ha
 * entrado nunca». La nota de privacidad, en cambio, se pinta siempre que haya
 * al menos un desplegable: explica un hueco, y el hueco está ahí aunque solo
 * se vea un acceso.
 */
function AccesosDeLaFamilia({
  familia,
  t,
  cuando,
}: {
  readonly familia: Familia;
  readonly t: StaffDictionary;
  readonly cuando: (valor: string | null) => string;
}): ReactNode {
  const A = t.admin.families.accesses;
  const conAccesos = familia.hijos.filter((hijo) => hijo.accesos.length > 0);
  if (conAccesos.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      {conAccesos.map((hijo) => (
        <details
          key={hijo.profileId}
          className="rounded-lg border border-line bg-surface"
        >
          {/* El recuento va DENTRO del resumen y no en un badge al lado: es lo
              único que permite decidir si merece la pena abrirlo, y quien
              navega con un lector de pantalla lo oye en el mismo anuncio. */}
          <summary className="cursor-pointer px-4 py-2 text-sm font-semibold text-ink">
            {fill(A.toggle, { child: hijo.fullName, count: hijo.accesos.length })}
          </summary>
          <div className="px-4 pb-4">
            <Table<AccesoDeAlumno>
              caption={ui(fill(A.caption, { child: hijo.fullName }))}
              rows={hijo.accesos}
              rowKey={(acceso) => acceso.id}
              columns={columnasDeAccesos(t, cuando)}
            />
          </div>
        </details>
      ))}
      <p className="text-xs text-muted">{A.privacyNote}</p>
    </div>
  );
}

function columnasDeAccesos(
  t: StaffDictionary,
  cuando: (valor: string | null) => string,
): ReadonlyArray<TableColumn<AccesoDeAlumno>> {
  const A = t.admin.families.accesses;

  return [
    {
      key: "when",
      header: ui(A.when),
      rowHeader: true,
      cell: (acceso) => cuando(acceso.createdAt),
    },
    {
      key: "kind",
      header: ui(A.kind),
      // El tono lleva SIEMPRE su palabra dentro (WCAG 1.4.1). Y solo el intento
      // fallido es `warning`: un canje o una entrada correcta son el
      // funcionamiento normal, y pintarlos de color entrena a no mirar el que
      // sí importa.
      cell: (acceso) => (
        <Badge tone={acceso.tipo === "login_fallido" ? "warning" : "neutral"}>
          {tipoDeAcceso(acceso.tipo, t)}
        </Badge>
      ),
    },
    {
      key: "from",
      header: ui(A.from),
      cell: (acceso) => <Procedencia acceso={acceso} t={t} />,
    },
    {
      key: "device",
      header: ui(A.device),
      cell: (acceso) =>
        acceso.agenteFamilia === null || acceso.agenteFamilia === "" ? (
          <span className="text-muted">{A.unknownDevice}</span>
        ) : (
          acceso.agenteFamilia
        ),
    },
    {
      key: "signals",
      header: ui(A.signals),
      cell: (acceso) =>
        acceso.senales.length === 0 ? (
          // «Ninguna» y no una celda en blanco: un hueco no se puede distinguir
          // de un fallo de carga, y aquí la ausencia de señales es un hecho.
          <span className="text-muted">{A.noSignals}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {acceso.senales.map((senal) => (
              <Badge key={senal} tone="warning">
                {senalDeAcceso(senal, t)}
              </Badge>
            ))}
          </span>
        ),
    },
  ];
}

/**
 * Ciudad, región y país en una línea, y la zona horaria debajo.
 *
 * Se juntan porque por separado ocupan tres columnas para decir una sola cosa,
 * y porque las tres pueden faltar a la vez: el borde resuelve el país mucho más
 * a menudo que la ciudad. Cuando no se sabe nada se dice «Sin ubicación», que
 * no es lo mismo que una celda vacía.
 *
 * La zona horaria va en segunda línea y en gris porque no es «dónde» sino «en
 * qué hora vive»: es el dato que explica por qué los informes de un niño
 * boliviano salían en UTC, y por eso se enseña aunque no localice a nadie.
 */
function Procedencia({
  acceso,
  t,
}: {
  readonly acceso: AccesoDeAlumno;
  readonly t: StaffDictionary;
}): ReactNode {
  const A = t.admin.families.accesses;
  const partes = [acceso.ciudad, acceso.region, acceso.pais].filter(
    (parte): parte is string => parte !== null && parte !== "",
  );

  return (
    <span className="flex flex-col">
      {partes.length === 0 ? (
        <span className="text-muted">{A.unknownPlace}</span>
      ) : (
        <span>{partes.join(" · ")}</span>
      )}
      {acceso.zonaHoraria === null || acceso.zonaHoraria === "" ? null : (
        <span className="text-xs text-muted">{acceso.zonaHoraria}</span>
      )}
    </span>
  );
}

/**
 * `acceso_tipo` es un enum de la base. Si mañana apareciera un quinto valor se
 * pinta CRUDO, por el mismo motivo que `etapa()`: un hueco no se puede depurar
 * y el identificador en pantalla dice exactamente qué falta traducir.
 */
function tipoDeAcceso(valor: string, t: StaffDictionary): string {
  const A = t.admin.families.accesses;
  if (valor === "enlace_canjeado") return A.kindRedeemed;
  if (valor === "login_ok") return A.kindLoginOk;
  if (valor === "login_fallido") return A.kindLoginFailed;
  if (valor === "dispositivo_olvidado") return A.kindDeviceForgotten;
  return valor === "" ? t.common.none : valor;
}

/**
 * Las cuatro señales de `app.registrar_acceso()`. Una señal desconocida se
 * pinta cruda: las reglas viven en Postgres y se añaden allí, así que esta
 * lista se queda corta ANTES de que nadie toque este fichero — y es mejor leer
 * `senal_nueva` en el panel que no ver nada.
 */
function senalDeAcceso(valor: string, t: StaffDictionary): string {
  const A = t.admin.families.accesses;
  if (valor === "dispositivo_nuevo") return A.signalNewDevice;
  if (valor === "salto_de_pais") return A.signalCountryJump;
  if (valor === "canje_fuera_de_red") return A.signalOutOfNetwork;
  if (valor === "ip_multicuenta") return A.signalSharedIp;
  return valor;
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

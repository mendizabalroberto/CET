#!/usr/bin/env node
/**
 * Mock de DeepSeek para `plan.spec.ts`: un servidor HTTP local que responde
 * al formato de chat completions con las dos respuestas que la cadena del
 * plan necesita — extracción de boletín y propuesta de plan — según el
 * prompt que reciba.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * NO se mockea por bandera dentro de `deepseek.ts`: se mockea por URL. El
 * `webServer` de Playwright arranca `next dev` con `DEEP_SEEK_URL` apuntando
 * aquí (ver `apps/web/playwright.config.ts`, proyecto `plan`), así que el
 * código de producción no sabe que existe este fichero.
 *
 * Las materias de la extracción son las seis que cubre la plataforma
 * (`MATERIAS_CON_CONTENIDO` en `apps/web/src/lib/plan/tipos.ts`) y coinciden
 * carácter a carácter con las líneas de
 * `apps/web/e2e/__fixtures__/generar-boletin-e2e-pdf.mjs`: `validarExtraccion`
 * exige que cada `materia` que el modelo devuelve aparezca literal en el
 * texto del PDF, así que un desajuste entre ambos ficheros tumba el e2e en el
 * paso de «Leer el boletín», no aquí.
 *
 * Uso:
 *   node apps/web/e2e/mock-deepseek.mjs <puerto>
 * o, programáticamente, `arrancarMockDeepSeek()` desde otro módulo (lo usa
 * `plan.spec.ts` como `globalSetup` no es necesario: el mock vive todo el
 * proceso de Playwright, arrancado por el propio `webServer.command`).
 */
import { createServer } from "node:http";

/** El mismo texto, palabra por palabra, que escribe el generador del PDF. */
export const NOTAS_MOCK = [
  { materia: "English", nota: 82 },
  { materia: "Math", nota: 74 },
  { materia: "Science", nota: 88 },
  { materia: "Spanish", nota: 79 },
  { materia: "Social Studies", nota: 91 },
  { materia: "Information & Communication Technology", nota: 85 },
];

function cuerpoDeExtraccion() {
  return {
    gestion: 2026,
    trimestre: 2,
    notas: NOTAS_MOCK,
  };
}

/** Reparto que cumple `propuestaCrudaSchema`: solo pesos no negativos, con
 * las claves de `MATERIAS_CON_CONTENIDO`; `normalizarReparto` los normaliza. */
function cuerpoDePropuesta() {
  return {
    minutos_por_dia: 30,
    reparto: {
      english: 0.3,
      math: 0.3,
      science: 0.1,
      spanish: 0.1,
      socials: 0.1,
      ict: 0.1,
    },
    recomendaciones: ["Practicar Math y English un poco cada día."],
  };
}

function esExtraccion(system) {
  return typeof system === "string" && system.includes("extractor de boletines");
}

function esEstratega(system) {
  return typeof system === "string" && system.includes("planificador de estudio");
}

function respuestaChatCompletions(contenidoJson) {
  return {
    model: "deepseek-chat",
    choices: [{ message: { content: JSON.stringify(contenidoJson) } }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  };
}

/** Arranca el mock y devuelve `{ server, port }`; `port: 0` deja que el SO
 * elija un puerto libre. */
export function arrancarMockDeepSeek(port = 0) {
  const server = createServer((req, res) => {
    if (req.method !== "POST") {
      // GET: solo lo usa el chequeo de disponibilidad del `webServer` de
      // Playwright antes de arrancar los tests — no simula nada de DeepSeek.
      res.writeHead(200, { "content-type": "text/plain" }).end("mock-deepseek");
      return;
    }
    let cuerpo = "";
    req.on("data", (trozo) => {
      cuerpo += trozo;
    });
    req.on("end", () => {
      let peticion;
      try {
        peticion = JSON.parse(cuerpo);
      } catch {
        res.writeHead(400).end();
        return;
      }
      const system = peticion?.messages?.find((m) => m.role === "system")?.content;

      let contenido;
      if (esExtraccion(system)) contenido = cuerpoDeExtraccion();
      else if (esEstratega(system)) contenido = cuerpoDePropuesta();
      else {
        res.writeHead(400).end();
        return;
      }

      const cuerpoRespuesta = JSON.stringify(respuestaChatCompletions(contenido));
      res.writeHead(200, { "content-type": "application/json" }).end(cuerpoRespuesta);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const direccion = server.address();
      resolve({ server, port: direccion.port });
    });
  });
}

const esEjecucionDirecta = process.argv[1]?.endsWith("mock-deepseek.mjs");
if (esEjecucionDirecta) {
  const puertoPedido = Number(process.argv[2] ?? 0);
  const { port } = await arrancarMockDeepSeek(puertoPedido);
  // Un solo dato en stdout, en su propia línea: es lo que lee quien lance
  // este proceso como hijo para saber a qué puerto apuntar `DEEP_SEEK_URL`.
  process.stdout.write(`MOCK_DEEPSEEK_PORT=${port}\n`);
}

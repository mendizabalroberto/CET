/**
 * @cet/ui — bateria de XSS contra el sanitizador.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Este es el test mas importante del paquete. Todo el contenido de leccion y
 * todo enunciado de pregunta pasan por aqui antes de llegar a un navegador.
 *
 * Regla al anadir casos: un payload nuevo se anade con su fuente, y la
 * asercion comprueba la AUSENCIA del vector (no la presencia de una salida
 * concreta), para que el test siga siendo valido si cambia el formato exacto.
 */

import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  htmlToPlainText,
  sanitizeHtml,
  sanitizeSvg,
  sanitizeUrl,
} from "../src/lib/sanitize.js";

/** Comprobacion transversal: ninguna salida puede contener estas cosas. */
function expectInert(output: string): void {
  const lower = output.toLowerCase();
  expect(lower).not.toContain("<script");
  expect(lower).not.toContain("javascript:");
  expect(lower).not.toContain("vbscript:");
  expect(lower).not.toContain("onerror");
  expect(lower).not.toContain("onload");
  expect(lower).not.toContain("onclick");
  expect(lower).not.toContain("onmouseover");
  expect(lower).not.toContain("<iframe");
  expect(lower).not.toContain("<object");
  expect(lower).not.toContain("<embed");
  expect(lower).not.toContain("srcdoc");
  expect(lower).not.toContain("style=");
}

describe("sanitizeHtml — inyeccion de script", () => {
  const payloads: ReadonlyArray<readonly [string, string]> = [
    ["script directo", '<script>alert(1)</script>'],
    ["script con atributos", '<script type="text/javascript">alert(1)</script>'],
    ["script anidado en p", '<p>hola<script>alert(1)</script>adios</p>'],
    ["script partido", '<scr<script>ipt>alert(1)</script>'],
    ["script en mayusculas", '<SCRIPT>alert(1)</SCRIPT>'],
    ["script sin cerrar", '<script>alert(1)'],
    ["img onerror", '<img src=x onerror=alert(1)>'],
    ["img onerror con comillas", '<img src="x" onerror="alert(1)">'],
    ["img ONERROR mayusculas", '<IMG SRC=x ONERROR=alert(1)>'],
    ["body onload", '<body onload=alert(1)>'],
    ["svg onload", '<svg onload=alert(1)>'],
    ["svg con script", '<svg><script>alert(1)</script></svg>'],
    ["iframe javascript", '<iframe src="javascript:alert(1)"></iframe>'],
    ["iframe srcdoc", '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>'],
    ["object data", '<object data="javascript:alert(1)"></object>'],
    ["embed", '<embed src="javascript:alert(1)">'],
    ["a javascript", '<a href="javascript:alert(1)">clic</a>'],
    ["a JaVaScRiPt", '<a href="JaVaScRiPt:alert(1)">clic</a>'],
    ["a vbscript", '<a href="vbscript:msgbox(1)">clic</a>'],
    ["a data html", '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
    ["form action", '<form action="javascript:alert(1)"><input></form>'],
    ["style expression", '<div style="width:expression(alert(1))">x</div>'],
    ["style background url", '<div style="background:url(javascript:alert(1))">x</div>'],
    ["meta refresh", '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'],
    ["link import", '<link rel="import" href="javascript:alert(1)">'],
    ["details ontoggle", '<details open ontoggle=alert(1)>'],
    ["marquee onstart", '<marquee onstart=alert(1)>x</marquee>'],
    ["input autofocus", '<input autofocus onfocus=alert(1)>'],
    ["template escape", '<template><script>alert(1)</script></template>'],
    ["noscript escape", '<noscript><p title="</noscript><img src=x onerror=alert(1)>">'],
    ["mathml", '<math><mtext><script>alert(1)</script></mtext></math>'],
    ["base tag", '<base href="javascript:">'],
  ];

  for (const [name, payload] of payloads) {
    it(`neutraliza: ${name}`, () => {
      const output = sanitizeHtml(payload);
      expectInert(output);
      expectNoExecutableReassembly(output);
    });
  }
});


/**
 * La propiedad de seguridad real: que del payload no quede NADA ejecutable.
 *
 * No basta con prohibir la cadena "alert(1)": ese texto puede aparecer de forma
 * legitima en una leccion de ICT sobre programacion, y el sanitizador debe
 * conservarlo como texto plano. Lo que nunca puede ocurrir es que los fragmentos
 * se reensamblen en una etiqueta o un manejador ejecutable — que es exactamente
 * el ataque de `<scr<script>ipt>`, disenado para derrotar a los sanitizadores
 * que borran `<script>` de una pasada y dejan `<scr` + `ipt>` pegandose solos.
 */
function expectNoExecutableReassembly(output: string): void {
  expect(output).not.toMatch(/<\s*script/i);
  expect(output).not.toMatch(/<\s*\/\s*script/i);
  expect(output).not.toMatch(/\son\w+\s*=/i);
  expect(output).not.toMatch(/(javascript|vbscript|data)\s*:/i);
}

/** Construye el payload con un caracter de control literal, escrito por codigo. */
function makePayload(code: number): string {
  return `<a href="java${String.fromCharCode(code)}script:alert(1)">x</a>`;
}

describe("sanitizeHtml — ofuscacion con entidades", () => {
  const payloads: ReadonlyArray<readonly [string, string]> = [
    ["colon decimal", '<a href="javascript&#58;alert(1)">x</a>'],
    ["colon hex", '<a href="javascript&#x3A;alert(1)">x</a>'],
    ["colon con padding", '<a href="javascript&#0000058alert(1)">x</a>'],
    ["entidad doble", '<a href="javascript&amp;#58;alert(1)">x</a>'],
    ["entidad nombrada", '<a href="javascript&colon;alert(1)">x</a>'],
    ["tab en el esquema", '<a href="java\tscript:alert(1)">x</a>'],
    ["salto de linea en el esquema", '<a href="java\nscript:alert(1)">x</a>'],
    ["retorno de carro", '<a href="java\rscript:alert(1)">x</a>'],
    ["nulo en el esquema", makePayload(0x0000)],
    ["espacio inicial", '<a href="  javascript:alert(1)">x</a>'],
    ["BOM inicial", '<a href="' + String.fromCharCode(0xfeff) + 'javascript:alert(1)">x</a>'],
    ["separador de linea unicode", makePayload(0x2028)],
  ];

  for (const [name, payload] of payloads) {
    it(`neutraliza: ${name}`, () => {
      const output = sanitizeHtml(payload);
      expect(output.toLowerCase()).not.toContain("javascript");
      expect(output).not.toContain("href=");
    });
  }

  it("decodeEntities llega a punto fijo con entidades anidadas", () => {
    expect(decodeEntities("&amp;#58;")).toBe(":");
    expect(decodeEntities("&#x3A;")).toBe(":");
    expect(decodeEntities("&colon;")).toBe(":");
  });

  it("decodeEntities no cuelga con una cadena patologica", () => {
    const bomb = "&amp;".repeat(2000);
    const start = Date.now();
    decodeEntities(bomb);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("sanitizeHtml — URLs", () => {
  it("acepta http, https y mailto", () => {
    expect(sanitizeUrl("https://example.org/a")).toBe("https://example.org/a");
    expect(sanitizeUrl("http://example.org")).toBe("http://example.org");
    expect(sanitizeUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
  });

  it("acepta rutas relativas y anclas", () => {
    expect(sanitizeUrl("/leccion/3")).toBe("/leccion/3");
    expect(sanitizeUrl("./img/a.png")).toBe("./img/a.png");
    expect(sanitizeUrl("#seccion")).toBe("#seccion");
    expect(sanitizeUrl("img/a.png")).toBe("img/a.png");
  });

  it("rechaza esquemas peligrosos", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
    expect(sanitizeUrl("ftp://example.org")).toBeNull();
    expect(sanitizeUrl("blob:https://example.org/x")).toBeNull();
  });

  it("rechaza URLs relativas al protocolo", () => {
    expect(sanitizeUrl("//evil.example/x.js")).toBeNull();
  });

  it("acepta data: solo para imagenes rasterizadas", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(sanitizeUrl(png)).toBe(png);
    expect(sanitizeUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBeNull();
    expect(sanitizeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBeNull();
    expect(sanitizeUrl("data:application/javascript,alert(1)")).toBeNull();
  });
});

describe("sanitizeHtml — lo que SI debe sobrevivir", () => {
  it("conserva el formato basico de los enunciados Y6A", () => {
    const input = "Calcula <b>3 &times; 4</b> y escribe H<sub>2</sub>O y 5<sup>2</sup>.<br>Fin.";
    const output = sanitizeHtml(input);
    expect(output).toContain("<b>");
    expect(output).toContain("<sub>");
    expect(output).toContain("<sup>");
    expect(output).toContain("<br />");
  });

  it("conserva la estructura de fraccion y remapea las clases de Y6A", () => {
    const input = '<span class="f"><span class="a">3</span><span class="b">4</span></span>';
    const output = sanitizeHtml(input);
    expect(output).toContain('class="cet-fraction"');
    expect(output).toContain('class="cet-fraction-num"');
    expect(output).toContain('class="cet-fraction-den"');
  });

  it("las clases de una letra solo valen en span, no en cualquier etiqueta", () => {
    // Un autor escribiendo <div class="b"> no debe acabar con una barra de
    // fraccion, ni ser interpretado como denominador por parseSafeHtml.
    expect(sanitizeHtml('<div class="b">texto</div>')).not.toContain("cet-fraction");
    expect(sanitizeHtml('<div class="f">texto</div>')).not.toContain("cet-fraction");
    expect(sanitizeHtml('<p class="a">texto</p>')).not.toContain("cet-fraction");
    expect(sanitizeHtml('<span class="b">4</span>')).toContain("cet-fraction-den");
  });

  it("descarta clases no permitidas sin tocar el contenido", () => {
    const output = sanitizeHtml('<span class="hacker f">3</span>');
    expect(output).toContain("cet-fraction");
    expect(output).not.toContain("hacker");
    expect(output).toContain("3");
  });

  it("conserva tablas de conversion de unidades", () => {
    const input = "<table><thead><tr><th>km</th></tr></thead><tbody><tr><td>1000 m</td></tr></tbody></table>";
    const output = sanitizeHtml(input);
    expect(output).toContain("<table>");
    expect(output).toContain("<th>");
    expect(output).toContain("1000 m");
  });

  it("anade rel de seguridad a los enlaces con target", () => {
    const output = sanitizeHtml('<a href="https://x.org" target="_blank">x</a>');
    expect(output).toContain('rel="noopener noreferrer"');
  });

  it("pone alt vacio a las imagenes que no lo traen", () => {
    const output = sanitizeHtml('<img src="/a.png">');
    expect(output).toContain('alt=""');
  });
});

describe("sanitizeHtml — robustez del parser", () => {
  it("cierra las etiquetas que quedaron abiertas", () => {
    const output = sanitizeHtml("<p><b>hola");
    expect(output).toBe("<p><b>hola</b></p>");
  });

  it("ignora los cierres huerfanos", () => {
    expect(sanitizeHtml("hola</b></p>")).toBe("hola");
  });

  it("escapa el texto suelto", () => {
    expect(sanitizeHtml("5 < 7 & 8 > 2")).toBe("5 &lt; 7 &amp; 8 &gt; 2");
  });

  it("no rompe con entrada vacia ni con basura", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml("<<<>>>")).not.toContain("<script");
    expect(sanitizeHtml("<!-- <script>alert(1)</script> -->")).not.toContain("alert");
  });

  it("es idempotente", () => {
    const once = sanitizeHtml('<p class="f">hola <b>mundo</b></p>');
    expect(sanitizeHtml(once)).toBe(once);
  });

  it("respeta el limite de longitud", () => {
    const long = "a".repeat(1000);
    expect(sanitizeHtml(long, { maxLength: 10 })).toHaveLength(10);
  });
});

describe("sanitizeSvg", () => {
  it("conserva geometria basica", () => {
    const input = '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="red"/></svg>';
    const output = sanitizeSvg(input);
    expect(output).toContain("<svg");
    expect(output).toContain("<rect");
    expect(output).toContain('viewBox="0 0 10 10"');
  });

  it("elimina script dentro del svg, con su contenido", () => {
    const output = sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>');
    expectInert(output);
    expect(output).not.toContain("alert(1)");
    expect(output).toContain("<rect");
  });

  it("elimina foreignObject entero", () => {
    const output = sanitizeSvg('<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>');
    expectInert(output);
    expect(output).not.toContain("foreignObject");
  });

  it("elimina use e image, que cargan recursos externos", () => {
    const output = sanitizeSvg('<svg><use href="#x"/><image href="data:image/svg+xml,x"/></svg>');
    expect(output).not.toContain("<use");
    expect(output).not.toContain("<image");
  });

  it("elimina animate, que puede reescribir href en ejecucion", () => {
    const output = sanitizeSvg('<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>');
    expect(output).not.toContain("animate");
    expect(output.toLowerCase()).not.toContain("javascript");
  });

  it("elimina manejadores y atributos con espacio de nombres", () => {
    const output = sanitizeSvg('<svg onload="alert(1)"><rect xlink:href="javascript:alert(1)"/></svg>');
    expectInert(output);
    expect(output).not.toContain("xlink");
  });

  it("rechaza valores con url() o esquemas", () => {
    const output = sanitizeSvg('<svg><rect fill="url(javascript:alert(1))"/></svg>');
    expect(output).not.toContain("url(");
  });

  it("no deja pasar id, que permite secuestrar getElementById", () => {
    const output = sanitizeSvg('<svg id="submit-button"><rect id="x"/></svg>');
    expect(output).not.toContain("id=");
  });

  it("conserva las mayusculas de los nombres SVG", () => {
    const output = sanitizeSvg('<svg><lineargradient id="g"><stop offset="0"/></lineargradient></svg>');
    expect(output).toContain("linearGradient");
  });
});

describe("htmlToPlainText", () => {
  it("devuelve solo el texto", () => {
    expect(htmlToPlainText("<p>Hola <b>mundo</b></p>")).toBe("Hola mundo");
  });

  it("descarta el contenido de un script", () => {
    expect(htmlToPlainText("a<script>alert(1)</script>b")).toBe("ab");
  });

  it("decodifica entidades", () => {
    expect(htmlToPlainText("3 &amp; 4")).toBe("3 & 4");
  });
});

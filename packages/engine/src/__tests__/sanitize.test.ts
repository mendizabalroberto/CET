/**
 * El enunciado se pinta como HTML. Este fichero es la prueba de que no se puede
 * colar nada mas que la allowlist.
 *
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 */

import { describe, expect, it } from "vitest";
import { escapeHtml, sanitizeStem, sanitizeSvg } from "../sanitize.js";
import { SanitizationError } from "../errors.js";

describe("sanitizeStem", () => {
  it("deja pasar el marcado que usan los enunciados Y6A", () => {
    const input = 'Simplify <b>now</b> <i>x</i> <u>y</u><br><sub>2</sub><sup>3</sup>';
    expect(sanitizeStem(input)).toBe(input);
  });

  it("deja pasar las fracciones apiladas", () => {
    const input = '<span class="f"><span class="a">3</span><span class="b">4</span></span>';
    expect(sanitizeStem(input)).toBe(input);
  });

  it("escapa lo que no reconoce en modo strip", () => {
    expect(sanitizeStem("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(sanitizeStem('<img src=x onerror="alert(1)">')).toContain("&lt;img");
    expect(sanitizeStem('<div style="position:fixed">x</div>')).toContain("&lt;div");
  });

  it("quita atributos peligrosos aunque la etiqueta este permitida", () => {
    expect(sanitizeStem('<b onclick="steal()">x</b>')).toBe('&lt;b onclick="steal()"&gt;x</b>');
    expect(sanitizeStem('<span class="evil">x</span>')).toContain("&lt;span");
  });

  it("en modo strict lanza en vez de escapar: un generador sucio es un bug", () => {
    expect(() => sanitizeStem("<script>x</script>", "strict")).toThrow(SanitizationError);
    expect(() => sanitizeStem('<b onclick="x">y</b>', "strict")).toThrow(SanitizationError);
    expect(() => sanitizeStem('<span class="hack">y</span>', "strict")).toThrow(SanitizationError);
  });

  it("conserva las entidades que ya vienen escapadas", () => {
    expect(sanitizeStem("a &nbsp; b &gt; c &amp; d &#160; e")).toBe(
      "a &nbsp; b &gt; c &amp; d &#160; e",
    );
  });

  it("escapa los signos sueltos de comparacion", () => {
    expect(sanitizeStem("3 < 4 > 2 & 1")).toBe("3 &lt; 4 &gt; 2 &amp; 1");
  });

  it("es idempotente", () => {
    const once = sanitizeStem('<b>a</b> < c & <script>x</script>');
    expect(sanitizeStem(once)).toBe(once);
  });
});

describe("sanitizeSvg", () => {
  const figure =
    '<svg viewBox="0 0 100 100" width="100" height="100" role="img">' +
    '<g transform="translate(10 10) scale(2)">' +
    '<polygon points="0,0 5,0 5,5" fill="#eef4fb" stroke="#173a63" stroke-width="2"/>' +
    "</g><text x=\"5\" y=\"5\" class=\"dim\">3 cm</text></svg>";

  it("deja pasar la figura que genera math.shape", () => {
    expect(sanitizeSvg(figure, "strict")).toContain("<polygon");
    expect(sanitizeSvg(figure, "strict")).toContain('points="0,0 5,0 5,5"');
  });

  it("elimina scripts y manejadores", () => {
    const dirty = '<svg><script>alert(1)</script><circle onload="x" r="5"/></svg>';
    const clean = sanitizeSvg(dirty);
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onload");
  });

  it("rechaza urls y data: dentro de los atributos", () => {
    expect(sanitizeSvg('<rect fill="url(#x)"/>')).not.toContain("url(");
    expect(sanitizeSvg('<image href="data:image/svg+xml;base64,AAA"/>')).not.toContain("data:");
  });

  it("en modo strict lanza", () => {
    expect(() => sanitizeSvg("<foreignObject></foreignObject>", "strict")).toThrow(SanitizationError);
  });
});

describe("escapeHtml", () => {
  it("escapa todo lo relevante", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});

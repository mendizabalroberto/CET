/**
 * @cet/ui — que oye realmente un lector de pantalla.
 * (c) 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * POR QUE HACE FALTA ESTO
 *
 * Los tests de accesibilidad de una fraccion se escribian mirando el DOM:
 * "el nodo `.cet-fraction` tiene `aria-hidden`". Eso comprueba UNA IMPLEMENTACION,
 * no el requisito. En cuanto la fraccion se dibuja de otra manera —y se ha
 * redibujado— el selector deja de encontrar nada y el test falla aunque la
 * accesibilidad este perfecta; o peor, un dia encuentra el nodo pero los
 * digitos se leen igual por otro camino y el test pasa estando roto.
 *
 * `textoExpuesto` recorre el arbol como lo recorre la accesibilidad:
 *
 *   - un subarbol `aria-hidden="true"` NO existe;
 *   - un nodo con `role="img"` se anuncia por su `aria-label` y no se entra en
 *     el (su contenido no se lee);
 *   - lo demas aporta su texto.
 *
 * Lo que devuelve es, palabra por palabra, lo que se dice en voz alta. Sobre
 * eso si se puede afirmar "dice tres cuartos y no dice tres cuatro".
 */

function esVisibleParaElLector(el: Element): boolean {
  return el.getAttribute("aria-hidden") !== "true";
}

export function textoExpuesto(raiz: Element): string {
  const trozos: string[] = [];

  const visitar = (nodo: Node): void => {
    if (nodo.nodeType === 3) {
      trozos.push(nodo.textContent ?? "");
      return;
    }
    if (nodo.nodeType !== 1) return;
    const el = nodo as Element;
    if (!esVisibleParaElLector(el)) return;

    // Un `role="img"` es una imagen: se anuncia por su nombre y punto.
    const etiqueta = el.getAttribute("aria-label");
    if (el.getAttribute("role") === "img" && etiqueta !== null) {
      trozos.push(` ${etiqueta} `);
      return;
    }

    for (const hijo of Array.from(el.childNodes)) visitar(hijo);
  };

  visitar(raiz);
  return trozos.join("").replace(/\s+/g, " ").trim();
}

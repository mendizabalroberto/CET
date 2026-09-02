/**
 * Preload (`node --require`) que hace IRRESOLUBLE `@napi-rs/canvas`, para
 * reproducir la función de Vercel —donde esa dependencia opcional no está—
 * en una máquina donde sí está instalada.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * pdfjs la pide con `createRequire(import.meta.url)("@napi-rs/canvas")`, o
 * sea por el resolvedor CommonJS: parchear `Module._resolveFilename` es lo que
 * la intercepta, y un hook de `module.register` no.
 */
"use strict";

const Module = require("node:module");

const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...resto) {
  if (request === "@napi-rs/canvas" || request.startsWith("@napi-rs/canvas/")) {
    const error = new Error(`Cannot find module '${request}' (ocultado por sin-canvas.cjs)`);
    error.code = "MODULE_NOT_FOUND";
    throw error;
  }
  return original.call(this, request, ...resto);
};

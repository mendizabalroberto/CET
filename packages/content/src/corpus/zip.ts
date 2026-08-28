/**
 * Lector de ZIP mínimo, sobre `node:zlib`.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Existe para no añadir una dependencia al árbol solo para abrir un .docx. Un
 * OOXML es un ZIP con entradas `deflate` (método 8) o sin comprimir (método 0),
 * y `zlib.inflateRawSync` cubre la primera. Nada más hace falta.
 *
 * Se recorre el DIRECTORIO CENTRAL, no las cabeceras locales. Motivo: cuando el
 * escritor usa descriptor de datos (bit 3 del flag), la cabecera local lleva
 * tamaño 0 y los bytes reales están detrás; caminar la cabecera local en ese
 * caso lee basura silenciosamente. El directorio central siempre tiene los
 * tamaños buenos.
 */

import { inflateRawSync } from "node:zlib";

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

/** Localiza el End Of Central Directory, que vive al final y puede llevar comentario. */
function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 0xffff - 22);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  throw new ZipError("no es un ZIP: no se encontró el directorio central");
}

export interface ZipEntry {
  name: string;
  read(): Buffer;
}

/** Devuelve las entradas del ZIP, perezosas: no se descomprime hasta pedirlo. */
export function readZip(buf: Buffer): Map<string, ZipEntry> {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== SIG_CENTRAL) {
      throw new ZipError(`entrada ${i} del directorio central corrupta`);
    }
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const usize = buf.readUInt32LE(off + 24);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nlen);

    entries.set(name, {
      name,
      read() {
        if (buf.readUInt32LE(localOff) !== SIG_LOCAL) {
          throw new ZipError(`cabecera local de \`${name}\` corrupta`);
        }
        // La cabecera local puede tener extra distinto al del directorio central:
        // hay que leer SUS longitudes, no las de arriba.
        const lnlen = buf.readUInt16LE(localOff + 26);
        const lelen = buf.readUInt16LE(localOff + 28);
        const start = localOff + 30 + lnlen + lelen;
        const raw = buf.subarray(start, start + csize);
        if (method === 0) return Buffer.from(raw);
        if (method === 8) {
          const out = inflateRawSync(raw);
          if (out.length !== usize) {
            throw new ZipError(
              `\`${name}\`: descomprimido ${out.length} bytes, el directorio dice ${usize}`,
            );
          }
          return out;
        }
        throw new ZipError(`\`${name}\`: método de compresión ${method} no soportado`);
      },
    });
    off += 46 + nlen + elen + clen;
  }
  return entries;
}

/** Lee una entrada por nombre exacto. Lanza si no está: un OOXML sin su parte principal no es tal. */
export function mustRead(entries: Map<string, ZipEntry>, name: string): string {
  const e = entries.get(name);
  if (!e) throw new ZipError(`falta \`${name}\` dentro del paquete`);
  return e.read().toString("utf8");
}

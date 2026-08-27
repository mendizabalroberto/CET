/**
 * GET /api/health — sonda de vida.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * Devuelve lo mínimo imprescindible. NO se informa de la versión de Next, ni de
 * las dependencias, ni de si Supabase responde, ni del entorno: un endpoint de
 * salud detallado y sin autenticación es reconocimiento gratuito para quien
 * busca un CVE conocido o quiere saber cuándo está la base de datos tocada.
 *
 * Si hace falta un diagnóstico profundo, va detrás de autenticación de
 * superadmin y en otra ruta.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): NextResponse {
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

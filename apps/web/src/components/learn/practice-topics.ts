/**
 * Los "chips" de tema de la pestaña `practice` de Y6A.
 * © 2026 Roberto Mendizabal. Todos los derechos reservados.
 *
 * El array `TOPICS` original de Y6A era una lista escrita a mano con las nueve
 * familias más `mix`. Aquí la lista se DERIVA del registro de `@cet/engine`: si
 * mañana se registra un generador nuevo, aparece su chip sin tocar la UI, y si
 * se retira uno, desaparece en vez de dejar un botón que revienta al pulsarlo.
 */
import { generate, registry } from "@cet/engine";
import type { GeneratedItem, Locale } from "@cet/shared";

import type { LearnDictionary } from "./dictionary";

/** Id del chip "de todo un poco". El `mix` de Y6A. */
export const MIXED_TOPIC_ID = "mix";

type TopicSlug = keyof LearnDictionary["practice"]["topics"];

export interface PracticeTopic {
  /** Identificador estable usado en la URL. `engineKey` o `mix`. */
  readonly id: string;
  /** `math.simplify` -> `simplify`. La clave del diccionario. */
  readonly slug: TopicSlug;
  /** `skillCode` del generador. `null` para el chip mezclado. */
  readonly skillCode: string | null;
  readonly engineKey: string | null;
}

function slugOf(engineKey: string): string {
  const parts = engineKey.split(".");
  return parts[parts.length - 1] ?? engineKey;
}

function isTopicSlug(value: string, dictionary: LearnDictionary): value is TopicSlug {
  return Object.prototype.hasOwnProperty.call(dictionary.practice.topics, value);
}

/**
 * Los temas disponibles, en el orden del registro (alfabético por `engineKey`),
 * con `mix` al final igual que en Y6A.
 *
 * Un generador sin entrada en el diccionario se OMITE: preferimos un chip de
 * menos a un botón con el texto en blanco delante de un niño.
 */
export function practiceTopics(dictionary: LearnDictionary): PracticeTopic[] {
  const topics: PracticeTopic[] = [];

  for (const generator of registry.all()) {
    const slug = slugOf(generator.key);
    if (!isTopicSlug(slug, dictionary)) continue;
    topics.push({
      id: generator.key,
      slug,
      skillCode: generator.skillCode,
      engineKey: generator.key,
    });
  }

  if (isTopicSlug(MIXED_TOPIC_ID, dictionary)) {
    topics.push({ id: MIXED_TOPIC_ID, slug: MIXED_TOPIC_ID, skillCode: null, engineKey: null });
  }

  return topics;
}

/**
 * Resuelve el segmento `[skillCode]` de la URL.
 *
 * Acepta tres formas porque las tres aparecen de verdad:
 *  - `mix` — el chip mezclado;
 *  - el `skillCode` (`math.fractions.simplify`) — es lo que enlaza una lección;
 *  - el `engineKey` (`math.simplify`) — es lo que enlaza un chip.
 */
export function findPracticeTopic(
  raw: string,
  dictionary: LearnDictionary,
): PracticeTopic | undefined {
  const value = decodeURIComponent(raw).trim().toLowerCase();
  const topics = practiceTopics(dictionary);
  return (
    topics.find((topic) => topic.id === value) ??
    topics.find((topic) => topic.skillCode === value)
  );
}

/* -------------------------------------------------------------------------- */
/* Semilla y generación                                                        */
/* -------------------------------------------------------------------------- */

/** 2^53 - 1: el tope del contrato `seed` de `@cet/shared`. */
const MAX_SEED = Number.MAX_SAFE_INTEGER;

/**
 * Semilla de 53 bits generada EN EL CLIENTE.
 *
 * `crypto.getRandomValues` y no `Math.random`: no por seguridad —la práctica no
 * puntúa— sino porque `Math.random` en algunos navegadores comparte estado entre
 * pestañas y produciría dos alumnos con la misma secuencia de preguntas.
 */
export function newPracticeSeed(): number {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof webCrypto?.getRandomValues === "function") {
    const words = new Uint32Array(2);
    webCrypto.getRandomValues(words);
    const high = (words[0] ?? 0) & 0x1fffff; // 21 bits
    const low = words[1] ?? 0; // 32 bits
    return high * 0x1_0000_0000 + low;
  }
  return Math.floor(Math.random() * MAX_SEED);
}

/**
 * Genera una pregunta del tema pedido. Puro respecto de `(topic, seed, locale)`:
 * el sorteo del generador dentro de `mix` también se deriva de la semilla, así
 * que un `seed` guardado reproduce exactamente lo que vio el alumno — incluido
 * QUÉ generador le tocó.
 */
export function generatePracticeItem(
  topic: PracticeTopic,
  seed: number,
  locale: Locale,
): { readonly engineKey: string; readonly item: GeneratedItem } {
  const engineKey = topic.engineKey ?? pickMixedEngineKey(seed);
  return { engineKey, item: generate(engineKey, { locale }, seed) };
}

function pickMixedEngineKey(seed: number): string {
  const keys = registry.keys();
  if (keys.length === 0) {
    throw new Error("No hay generadores registrados en @cet/engine.");
  }
  const index = seed % keys.length;
  return keys[index] ?? keys[0] ?? "";
}

/* -------------------------------------------------------------------------- */
/* Identidad visual                                                            */
/* -------------------------------------------------------------------------- */

/**
 * La MATERIA a la que pertenece un tema de práctica, para que su tarjeta use la
 * misma identidad que la de `/learn`.
 *
 * Sale del primer segmento de la clave del generador (`math.compare` -> `math`),
 * que es de donde ya sale todo lo demás en este fichero: la lista de temas se
 * DERIVA del registro de `@cet/engine`, así que el día que se registre un
 * generador de otra materia su tarjeta cambia de color sin tocar la interfaz. No
 * hay tabla escrita a mano que se quede desfasada.
 *
 * `mix` no tiene generador —es un sorteo entre los demás— y por eso devuelve la
 * cadena vacía: `subjectIdentity()` la resuelve a la identidad NEUTRA (`otra`),
 * que es exactamente lo que es. No se le asigna el color de matemáticas a
 * propósito: sería decir que pertenece a una materia cuando lo que hace es
 * cruzarlas.
 *
 * Aviso de siempre en esta casa: el color NO identifica nada. Aquí lo que
 * distingue un tema de otro son su nombre y su pista, que van escritos en la
 * tarjeta. El rail de color es refuerzo, y en escala de grises los siete tonos
 * son el mismo gris. Ver `packages/ui/src/navigation/subject-identity.ts`.
 */
export function topicSubjectCode(topic: PracticeTopic): string {
  const key = topic.engineKey;
  if (key === null) return "";
  const [head] = key.split(".");
  return head ?? "";
}

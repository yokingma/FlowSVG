/** Raw address handling. Own only showcase query fields; unrelated tokens and the fragment remain opaque. */
import type { ShowcaseSession } from "./session.js";

export const ADDRESS_FIELDS = ["example", "theme", "reduced", "time"] as const;
export type AddressField = typeof ADDRESS_FIELDS[number];

interface AddressParts {
  readonly prefix: string;
  readonly tokens: readonly string[];
  readonly fragment: string;
}

/** Decode query values without reserializing unrelated raw query tokens. */
export function readAddress(address: string): ReadonlyMap<AddressField, readonly string[]> {
  const fields = new Map<AddressField, string[]>();
  for (const token of splitAddress(address).tokens) {
    const { name, value } = readToken(token);
    if (!isAddressField(name)) continue;
    fields.set(name, [...fields.get(name) ?? [], value]);
  }
  return fields;
}

/** Write complete selected state, retaining unknown query bytes, deployment path and fragment exactly. */
export function writeAddress(address: string, session: ShowcaseSession): string {
  const { prefix, tokens, fragment } = splitAddress(address);
  const unrelated = tokens.filter((token) => !isAddressField(readToken(token).name));
  const fields = session.exampleId === null || session.settings === null ? [] : [
    `example=${encodeURIComponent(session.exampleId)}`,
    `theme=${session.settings.theme}`,
    `reduced=${session.settings.reducedMotion ? "1" : "0"}`,
    `time=${decimalTime(session.timeMs)}`
  ];
  const query = [...unrelated, ...fields].join("&");
  return `${prefix}${query ? `?${query}` : ""}${fragment}`;
}

function splitAddress(address: string): AddressParts {
  const hashIndex = address.indexOf("#");
  const fragment = hashIndex < 0 ? "" : address.slice(hashIndex);
  const beforeHash = hashIndex < 0 ? address : address.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf("?");
  return {
    prefix: queryIndex < 0 ? beforeHash : beforeHash.slice(0, queryIndex),
    tokens: queryIndex < 0 || beforeHash.slice(queryIndex + 1) === "" ? [] : beforeHash.slice(queryIndex + 1).split("&"),
    fragment
  };
}

function readToken(token: string): { name: string; value: string } {
  const separator = token.indexOf("=");
  return {
    name: decodeQuery(separator < 0 ? token : token.slice(0, separator)),
    value: decodeQuery(separator < 0 ? "" : token.slice(separator + 1))
  };
}

function decodeQuery(value: string): string {
  try { return decodeURIComponent(value.replaceAll("+", " ")); }
  // Malformed escapes remain invalid field data; the original raw token is still safe to preserve.
  catch { return value; }
}

function isAddressField(value: string): value is AddressField {
  return ADDRESS_FIELDS.some((field) => field === value);
}

/** Expand scientific notation so every generated time is accepted by the decimal-only parser. */
function decimalTime(value: number): string {
  const text = String(value);
  if (!text.includes("e")) return text;
  const [coefficient, exponent] = text.split("e");
  const digits = coefficient.replace(".", "");
  const position = (coefficient.indexOf(".") < 0 ? coefficient.length : coefficient.indexOf(".")) + Number(exponent);
  if (position <= 0) return `0.${"0".repeat(-position)}${digits}`;
  if (position >= digits.length) return digits + "0".repeat(position - digits.length);
  return `${digits.slice(0, position)}.${digits.slice(position)}`;
}

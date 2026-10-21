/** Reject author values that JSON serialization would omit, coerce or execute. */
export function assertJsonData(value: unknown, path: string, ancestors: ReadonlySet<object> = new Set()): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) return;
  if (typeof value !== "object" || value === null) reject(path);
  if (ancestors.has(value)) reject(path);
  const prototype: unknown = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) reject(path);
  const next = new Set([...ancestors, value]);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) reject(`${path}[${index}]`);
    }
  }
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    if (typeof key !== "string") reject(path);
    const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) reject(childPath);
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (!descriptor.enumerable || !("value" in descriptor)) reject(childPath);
    assertJsonData(descriptor.value, childPath, next);
  }
}

function reject(path: string): never {
  throw new Error(`${path}: must contain lossless JSON data only`);
}

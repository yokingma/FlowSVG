/**
 * Shared SVG number serialization. Geometry and SVG serialization use this
 * deterministic format so moving either implementation cannot change output.
 */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** Pure color interpolation shared by timeline visuals and node-content painting. */

/** Interpolate validated hexadecimal RGB/RGBA channels; preserve endpoint strings and normalize intermediate colors. */
export function mixColor(source: string, target: string, progress: number): string {
  if (progress === 0) return source;
  if (progress === 1) return target;
  const channels = (color: string): number[] => {
    const hex = color.slice(1);
    const expanded = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return [0, 2, 4, 6].map((offset) => offset < expanded.length ? parseInt(expanded.slice(offset, offset + 2), 16) : 255);
  };
  const from = channels(source);
  const to = channels(target);
  const values = from.map((value, index) => Math.round(value + (to[index]! - value) * progress));
  const hex = values.map((value) => value.toString(16).padStart(2, "0"));
  return `#${hex.slice(0, values[3] === 255 ? 3 : 4).join("")}`;
}

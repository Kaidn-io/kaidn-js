/**
 * Defensive readers over ThumbmarkJS's nested `components` object. Its exact key
 * layout shifts between versions, so we flatten and match by key name rather than
 * hard-coding a path — a missing value degrades gracefully to `undefined`.
 */
export type ComponentTree = {
  [key: string]: string | string[] | number | boolean | ComponentTree;
};

/** Flatten a nested component tree to dotted string paths → scalar string values. */
export function flattenComponents(tree: ComponentTree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenComponents(value as ComponentTree, path));
    } else if (Array.isArray(value)) {
      out[path] = value.join(",");
    } else {
      out[path] = String(value);
    }
  }
  return out;
}

/** Pull the unmasked WebGL renderer string, wherever ThumbmarkJS put it. */
export function pickWebglRenderer(tree: ComponentTree | undefined): string | undefined {
  if (!tree) return undefined;
  const flat = flattenComponents(tree);
  for (const [key, value] of Object.entries(flat)) {
    if (/webgl.*renderer|renderer.*webgl|unmasked.*renderer/i.test(key) && value) {
      return value;
    }
  }
  return undefined;
}

/** Count the fonts ThumbmarkJS detected (its `fonts` component is a list). A
 *  desktop OS exposes dozens; a spoofed/anti-detect profile often exposes few. */
export function countFonts(tree: ComponentTree | undefined): number | undefined {
  if (!tree) return undefined;
  const flat = flattenComponents(tree);
  for (const [key, value] of Object.entries(flat)) {
    // flattenComponents joins array values with commas → count the entries
    if (/(^|\.)fonts?($|\.)/i.test(key) && typeof value === "string" && value.length > 0) {
      return value.split(",").filter(Boolean).length;
    }
  }
  return undefined;
}

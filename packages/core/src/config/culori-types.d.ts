// Minimal ambient declarations for the culori functions used by helpers.ts.
// culori is a JS-only library with no bundled types.
declare module 'culori' {
  type Color = Record<string, unknown> & { mode: string };

  function parse(value: string): Color | undefined;
  function formatHex(color: Color | string | undefined): string | undefined;
  function differenceCiede2000(): (a: Color | string, b: Color | string) => number;
  function wcagContrast(a: Color | string, b: Color | string): number;
}

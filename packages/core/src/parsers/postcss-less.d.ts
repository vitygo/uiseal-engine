// postcss-less ships no type definitions (and the DefinitelyTyped package is
// stale relative to the major version we use), so declare the minimal sync
// parse API we rely on.
declare module 'postcss-less' {
  import type { Root, ProcessOptions } from 'postcss';

  export function parse(source: string, opts?: Pick<ProcessOptions, 'from'>): Root;
}

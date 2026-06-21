import { parse } from '@typescript-eslint/parser';
import type { TSESTree } from '@typescript-eslint/types';

export type ParseResult = TSESTree.Program;

export function parseJsx(code: string): ParseResult {
  return parse(code, {
    jsx: true,
    loc: true,
    range: true,
  });
}

// Parses an Angular *.component.ts file: reuses the existing TS/JSX parser
// (@typescript-eslint/parser) to get a real AST, then looks for a
// @Component({ ... }) decorator on a class and extracts its inline
// `styles` (array of CSS strings) and `template` (HTML string), the same
// way Angular CLI-generated components write them.
//
// Scoping decision: the decorator is matched by name ('Component') only,
// not by resolving the import binding back to '@angular/core' — full
// binding resolution is disproportionate for what is, in practice, never
// ambiguous (nobody names an unrelated decorator "Component" in an Angular
// codebase). styleUrls/templateUrl (external files) are intentionally not
// resolved here: external .scss/.css already have their own parser, and
// external .component.html gets its own registry entry (parsers/angular-
// template.ts) — this module only ever looks at what's written inline.
import type { TSESTree } from '@typescript-eslint/types';
import postcss from 'postcss';
import type { Root } from 'postcss';
import { parseJsx } from './jsx.js';

export interface AngularStyleBlock {
  content: string;
  root: Root;
  /** add to a postcss-reported line number to get the true .component.ts line */
  offset: number;
}

export interface AngularTemplateInfo {
  content: string;
  /** add to a line number found within `content` to get the true .component.ts line */
  offset: number;
}

export type AngularParsedFile = {
  kind: 'angular';
  /** false when no @Component decorator was found — the file isn't an Angular component and should be skipped entirely. */
  isComponent: boolean;
  styles: AngularStyleBlock[];
  template: AngularTemplateInfo | null;
};

interface StaticString {
  text: string;
  loc: TSESTree.SourceLocation;
}

// Only a plain string literal or a template literal with no interpolations
// is statically known — `template: \`<div>${dynamic}</div>\`` or
// `template: someVariable` are skipped, matching how every other adapter in
// this codebase treats dynamic values.
function staticStringValue(node: TSESTree.Node): StaticString | null {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return { text: node.value, loc: node.loc };
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0 && node.quasis.length === 1) {
    return { text: node.quasis[0]!.value.cooked ?? '', loc: node.loc };
  }
  return null;
}

function classDeclFromStatement(stmt: TSESTree.Node): TSESTree.ClassDeclaration | null {
  if (stmt.type === 'ClassDeclaration') return stmt;
  if (
    (stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration') &&
    stmt.declaration?.type === 'ClassDeclaration'
  ) {
    return stmt.declaration;
  }
  return null;
}

function findComponentDecoratorCall(program: TSESTree.Program): TSESTree.CallExpression | null {
  for (const stmt of program.body) {
    const classDecl = classDeclFromStatement(stmt);
    if (!classDecl) continue;

    for (const decorator of classDecl.decorators ?? []) {
      const expr = decorator.expression;
      if (expr.type === 'CallExpression' && expr.callee.type === 'Identifier' && expr.callee.name === 'Component') {
        return expr;
      }
    }
  }
  return null;
}

const NOT_A_COMPONENT: AngularParsedFile = { kind: 'angular', isComponent: false, styles: [], template: null };

export function parseAngular(source: string): AngularParsedFile {
  let program: TSESTree.Program;
  try {
    program = parseJsx(source);
  } catch {
    return NOT_A_COMPONENT;
  }

  const call = findComponentDecoratorCall(program);
  const configArg = call?.arguments[0];
  if (!call || !configArg || configArg.type !== 'ObjectExpression') {
    return NOT_A_COMPONENT;
  }

  const styles: AngularStyleBlock[] = [];
  let template: AngularTemplateInfo | null = null;

  for (const prop of configArg.properties) {
    if (prop.type !== 'Property') continue;
    const key =
      prop.key.type === 'Identifier'
        ? prop.key.name
        : prop.key.type === 'Literal' && typeof prop.key.value === 'string'
          ? prop.key.value
          : null;

    if (key === 'styles' && prop.value.type === 'ArrayExpression') {
      for (const el of prop.value.elements) {
        if (!el) continue;
        const str = staticStringValue(el);
        if (!str) continue;
        styles.push({
          content: str.text,
          root: postcss.parse(str.text),
          offset: str.loc.start.line - 1,
        });
      }
    } else if (key === 'template') {
      const str = staticStringValue(prop.value);
      if (str) {
        template = { content: str.text, offset: str.loc.start.line - 1 };
      }
    }
    // styleUrls / templateUrl: intentionally not resolved here — see module doc comment.
  }

  return { kind: 'angular', isComponent: true, styles, template };
}

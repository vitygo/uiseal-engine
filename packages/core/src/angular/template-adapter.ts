// Converts Angular template bindings into either postcss Declaration-like
// objects (style-bearing attributes) or Tailwind class-string segments
// (class-bearing attributes) — reusing the exact same shared adapters as
// the Vue template adapter (adapters/object-expr-to-decls.ts,
// parse-expression-text.ts, class-expr-to-strings.ts), since
// [ngStyle]="{}" / [ngClass]="{}" are the same JS-object-binding shape as
// Vue's :style / :class, just spelled differently.
import type { Declaration } from 'postcss';
import { objectExpressionToDecls, makeSyntheticDecl } from '../adapters/object-expr-to-decls.js';
import { parseExpressionText } from '../adapters/parse-expression-text.js';
import { extractClassStringsFromExpr } from '../adapters/class-expr-to-strings.js';
import { scanAngularTags, type AngularTag } from './template-scanner.js';

export interface AngularClassSegment {
  text: string;
  line: number;
  column: number;
}

// [style.padding.px]="13" -> property 'padding', unit 'px'.
// [style.color]="'#fff'" -> property 'color', no unit.
const STYLE_PROPERTY_BINDING_RE = /^\[style\.([\w-]+)(?:\.([\w%]+))?\]$/;

function inlineStyleDeclsForTag(tag: AngularTag): Declaration[] {
  const pos = { line: tag.line, column: tag.column };
  const decls: Declaration[] = [];

  for (const [name, value] of tag.attrs) {
    if (name === 'style') {
      for (const part of value.split(';')) {
        const colonIdx = part.indexOf(':');
        if (colonIdx === -1) continue;
        const cssProp = part.slice(0, colonIdx).trim();
        const cssValue = part.slice(colonIdx + 1).trim();
        if (!cssProp || !cssValue) continue;
        decls.push(makeSyntheticDecl(cssProp, cssValue, pos));
      }
      continue;
    }

    if (name === '[ngStyle]') {
      const stmt = parseExpressionText(value);
      if (!stmt || stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'ObjectExpression') continue;
      decls.push(...objectExpressionToDecls(stmt.expression, pos));
      continue;
    }

    const bindingMatch = STYLE_PROPERTY_BINDING_RE.exec(name);
    if (!bindingMatch) continue;
    const cssProp = bindingMatch[1]!;
    const unit = bindingMatch[2];

    const stmt = parseExpressionText(value);
    if (!stmt || stmt.type !== 'ExpressionStatement' || stmt.expression.type !== 'Literal') continue;
    const literal = stmt.expression.value;

    if (typeof literal === 'number' && unit) {
      decls.push(makeSyntheticDecl(cssProp, `${literal}${unit}`, pos));
    } else if (typeof literal === 'string') {
      decls.push(makeSyntheticDecl(cssProp, literal, pos));
    }
    // A bare unitless number ([style.z-index]="5") is ambiguous — could be
    // a legitimately unitless CSS property — and not one of the checked
    // categories anyway without a px/rem/hex shape, so it's skipped.
  }

  return decls;
}

function classSegmentsForTag(tag: AngularTag): AngularClassSegment[] {
  const pos = { line: tag.line, column: tag.column };
  const segments: AngularClassSegment[] = [];

  for (const [name, value] of tag.attrs) {
    if (name === 'class') {
      segments.push({ text: value, ...pos });
      continue;
    }
    if (name === '[class]' || name === '[ngClass]') {
      const stmt = parseExpressionText(value);
      if (!stmt || stmt.type !== 'ExpressionStatement') continue;
      const names = extractClassStringsFromExpr(stmt.expression);
      if (names.length === 0) continue;
      segments.push({ text: names.join(' '), ...pos });
    }
  }

  return segments;
}

export function extractAngularInlineStyleDecls(html: string): Declaration[] {
  return scanAngularTags(html).flatMap(inlineStyleDeclsForTag);
}

export function extractAngularClassSegments(html: string): AngularClassSegment[] {
  return scanAngularTags(html).flatMap(classSegmentsForTag);
}

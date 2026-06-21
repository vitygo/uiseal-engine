import type { TSESTree } from '@typescript-eslint/types';
import { parseJsx } from '../parsers/jsx.js';
import { buildJsxIgnoreMap } from '../ignore.js';
import type { uisealConfig } from '../config/schema.js';
import type { SkeletonNode, Violation } from '../types.js';

const PASCAL_CASE_RE = /^[A-Z][A-Za-z0-9]*$/;
const STRIP_SUFFIXES = [
  'Primary', 'Secondary', 'Main', 'New', 'Old', 'V2', 'Alt',
  'Custom', 'Base', 'Wrapper', 'Container',
];
const MIN_COMPONENTS = 5;
const PAIR_CAP = 50;
const SIMILARITY_THRESHOLD = 0.75;
const NAME_THRESHOLD = 0.5;
const SKEL_MAX_DEPTH = 4;
const SKEL_MAX_CHILDREN = 6;

export interface ComponentFingerprint {
  name: string;
  file: string;
  line: number;
  column: number;
  props: Set<string>;
  structure: string[];
  code: string;
  skeleton: SkeletonNode;
}

// ── Name similarity ───────────────────────────────────────────────────────────

function stripNameAffixes(name: string): string {
  let result = name;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of STRIP_SUFFIXES) {
      if (result !== suffix && result.endsWith(suffix)) {
        result = result.slice(0, result.length - suffix.length);
        changed = true;
        break;
      }
    }
  }
  return result || name;
}

function levenshteinSim(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]!
          : 1 + Math.min(prev[j - 1]!, prev[j]!, curr[j - 1]!);
    }
    [prev, curr] = [curr, prev];
  }

  return 1 - prev[n]! / Math.max(m, n);
}

function nameSimilarity(a: string, b: string): number {
  const rootA = stripNameAffixes(a);
  const rootB = stripNameAffixes(b);
  if (rootA.toLowerCase() === rootB.toLowerCase()) return 1.0;
  return levenshteinSim(a.toLowerCase(), b.toLowerCase());
}

// ── Jaccard similarity ────────────────────────────────────────────────────────

function jaccardSim(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function jaccardArraySim(a: string[], b: string[]): number {
  return jaccardSim(new Set(a), new Set(b));
}

// ── AST helpers ───────────────────────────────────────────────────────────────

function walkGeneric(node: TSESTree.Node, visit: (n: TSESTree.Node) => void): void {
  visit(node);
  const rec = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const child = rec[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && 'type' in item) {
          walkGeneric(item as TSESTree.Node, visit);
        }
      }
    } else if (child && typeof child === 'object' && 'type' in child) {
      walkGeneric(child as TSESTree.Node, visit);
    }
  }
}

// Returns true if the direct return value(s) of a function body contain JSX.
// Does NOT recurse into nested function bodies.
function directlyReturnsJsx(body: TSESTree.BlockStatement | TSESTree.Expression): boolean {
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') return true;
  if (body.type !== 'BlockStatement') return false;
  return body.body.some(stmtReturnsJsx);
}

function stmtReturnsJsx(stmt: TSESTree.Statement): boolean {
  if (stmt.type === 'ReturnStatement') {
    return stmt.argument !== null && exprContainsJsx(stmt.argument);
  }
  if (stmt.type === 'IfStatement') {
    return (
      stmtReturnsJsx(stmt.consequent) ||
      (stmt.alternate !== null && stmtReturnsJsx(stmt.alternate))
    );
  }
  if (stmt.type === 'BlockStatement') {
    return stmt.body.some(stmtReturnsJsx);
  }
  if (stmt.type === 'SwitchStatement') {
    return stmt.cases.some((c) => c.consequent.some(stmtReturnsJsx));
  }
  return false;
}

function exprContainsJsx(expr: TSESTree.Expression): boolean {
  if (expr.type === 'JSXElement' || expr.type === 'JSXFragment') return true;
  if (expr.type === 'ConditionalExpression') {
    return exprContainsJsx(expr.consequent) || exprContainsJsx(expr.alternate);
  }
  if (expr.type === 'LogicalExpression') {
    return exprContainsJsx(expr.left) || exprContainsJsx(expr.right);
  }
  return false;
}

// ── JSX structure collection ──────────────────────────────────────────────────

function getJsxTagName(name: TSESTree.JSXTagNameExpression): string | null {
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') {
    const obj = getJsxTagName(name.object as TSESTree.JSXTagNameExpression);
    return obj ? `${obj}.${name.property.name}` : null;
  }
  if (name.type === 'JSXNamespacedName') {
    return `${name.namespace.name}:${name.name.name}`;
  }
  return null;
}

function walkJsxTree(
  node: TSESTree.JSXElement | TSESTree.JSXFragment,
  elements: string[],
): void {
  if (node.type === 'JSXElement') {
    const tag = getJsxTagName(node.openingElement.name);
    if (tag) {
      const attrs = node.openingElement.attributes
        .filter((a): a is TSESTree.JSXAttribute => a.type === 'JSXAttribute')
        .map((a) => (a.name.type === 'JSXIdentifier' ? a.name.name : null))
        .filter((n): n is string => n !== null)
        .sort();
      elements.push(attrs.length > 0 ? `${tag}.${attrs.join('.')}` : tag);
    }
  }

  const children =
    node.type === 'JSXElement' ? node.children : node.children;

  for (const child of children) {
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
      walkJsxTree(child, elements);
    } else if (child.type === 'JSXExpressionContainer') {
      const expr = child.expression;
      if (expr.type !== 'JSXEmptyExpression') {
        collectJsxFromExpr(expr as TSESTree.Expression, elements);
      }
    }
  }
}

function collectJsxFromExpr(expr: TSESTree.Expression, elements: string[]): void {
  if (expr.type === 'JSXElement' || expr.type === 'JSXFragment') {
    walkJsxTree(expr, elements);
    return;
  }
  if (expr.type === 'ConditionalExpression') {
    collectJsxFromExpr(expr.consequent, elements);
    collectJsxFromExpr(expr.alternate, elements);
    return;
  }
  if (expr.type === 'LogicalExpression') {
    collectJsxFromExpr(expr.left, elements);
    collectJsxFromExpr(expr.right, elements);
  }
}

function collectStructureFromBody(
  body: TSESTree.BlockStatement | TSESTree.Expression,
): string[] {
  const elements: string[] = [];

  if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
    walkJsxTree(body, elements);
    return elements;
  }

  if (body.type !== 'BlockStatement') return elements;

  function fromStmt(stmt: TSESTree.Statement): void {
    if (stmt.type === 'ReturnStatement' && stmt.argument) {
      collectJsxFromExpr(stmt.argument, elements);
      return;
    }
    if (stmt.type === 'IfStatement') {
      fromStmt(stmt.consequent);
      if (stmt.alternate) fromStmt(stmt.alternate);
      return;
    }
    if (stmt.type === 'BlockStatement') {
      stmt.body.forEach(fromStmt);
      return;
    }
    if (stmt.type === 'SwitchStatement') {
      stmt.cases.forEach((c) => c.consequent.forEach(fromStmt));
    }
  }

  body.body.forEach(fromStmt);
  return elements;
}

// ── Skeleton building ─────────────────────────────────────────────────────────

function extractClassName(
  openingEl: TSESTree.JSXOpeningElement,
): string | undefined {
  for (const attr of openingEl.attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    const attrName =
      attr.name.type === 'JSXIdentifier' ? attr.name.name : null;
    if (attrName !== 'className' && attrName !== 'class') continue;
    if (!attr.value) continue;
    if (
      attr.value.type === 'Literal' &&
      typeof attr.value.value === 'string'
    ) {
      return attr.value.value.split(/\s+/)[0] || undefined;
    }
    if (attr.value.type === 'JSXExpressionContainer') {
      const expr = attr.value.expression;
      if (
        expr.type !== 'JSXEmptyExpression' &&
        expr.type === 'Literal' &&
        typeof (expr as TSESTree.Literal).value === 'string'
      ) {
        const val = (expr as TSESTree.Literal).value as string;
        return val.split(/\s+/)[0] || undefined;
      }
    }
  }
  return undefined;
}

function findFirstJsx(
  expr: TSESTree.Expression,
): TSESTree.JSXElement | TSESTree.JSXFragment | null {
  if (expr.type === 'JSXElement' || expr.type === 'JSXFragment') return expr;
  if (expr.type === 'ConditionalExpression') {
    return findFirstJsx(expr.consequent) ?? findFirstJsx(expr.alternate);
  }
  if (expr.type === 'LogicalExpression') {
    return findFirstJsx(expr.left) ?? findFirstJsx(expr.right);
  }
  return null;
}

function findJsxInStmts(
  stmts: TSESTree.Statement[],
): TSESTree.JSXElement | TSESTree.JSXFragment | null {
  for (const stmt of stmts) {
    if (stmt.type === 'ReturnStatement' && stmt.argument) {
      const found = findFirstJsx(stmt.argument);
      if (found) return found;
    }
    if (stmt.type === 'IfStatement') {
      const cBody = stmt.consequent.type === 'BlockStatement'
        ? stmt.consequent.body : [stmt.consequent];
      const found = findJsxInStmts(cBody);
      if (found) return found;
      if (stmt.alternate) {
        const aBody = stmt.alternate.type === 'BlockStatement'
          ? stmt.alternate.body : [stmt.alternate];
        const found2 = findJsxInStmts(aBody);
        if (found2) return found2;
      }
    }
    if (stmt.type === 'BlockStatement') {
      const found = findJsxInStmts(stmt.body);
      if (found) return found;
    }
  }
  return null;
}

function getMapRepeatCount(call: TSESTree.CallExpression): number {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return 3;
  const obj = callee.object;
  if (obj.type === 'ArrayExpression' && obj.elements.length > 0) {
    return obj.elements.length;
  }
  return 3;
}

function getJsxFromCallback(
  fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): TSESTree.JSXElement | TSESTree.JSXFragment | null {
  const body = fn.body;
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') return body;
  if (body.type === 'BlockStatement') {
    for (const stmt of body.body) {
      if (stmt.type === 'ReturnStatement' && stmt.argument) {
        return findFirstJsx(stmt.argument);
      }
    }
  }
  return null;
}

function buildSkeletonNode(
  node: TSESTree.JSXElement | TSESTree.JSXFragment,
  depth: number,
): SkeletonNode {
  let tag = 'fragment';
  let className: string | undefined;

  if (node.type === 'JSXElement') {
    const tagName = getJsxTagName(node.openingElement.name);
    tag = tagName ?? 'element';
    className = extractClassName(node.openingElement);
  }

  const result: SkeletonNode = { tag, children: [] };
  if (className) result.className = className;

  if (depth >= SKEL_MAX_DEPTH) return result;

  const allChildren: SkeletonNode[] = [];
  for (const child of node.children) {
    if (child.type === 'JSXText') continue;
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
      allChildren.push(buildSkeletonNode(child, depth + 1));
    } else if (child.type === 'JSXExpressionContainer') {
      const expr = child.expression;
      if (expr.type === 'JSXEmptyExpression') continue;
      const childNodes = collectSkeletonFromExpr(
        expr as TSESTree.Expression,
        depth + 1,
      );
      allChildren.push(...childNodes);
    }
  }

  if (allChildren.length <= SKEL_MAX_CHILDREN) {
    result.children = allChildren;
  } else {
    result.children = [
      ...allChildren.slice(0, SKEL_MAX_CHILDREN),
      { tag: `+${allChildren.length - SKEL_MAX_CHILDREN} more`, children: [] },
    ];
  }

  return result;
}

function collectSkeletonFromExpr(
  expr: TSESTree.Expression,
  depth: number,
): SkeletonNode[] {
  if (expr.type === 'JSXElement' || expr.type === 'JSXFragment') {
    return [buildSkeletonNode(expr, depth)];
  }
  if (expr.type === 'ConditionalExpression') {
    return collectSkeletonFromExpr(expr.consequent, depth);
  }
  if (expr.type === 'LogicalExpression') {
    return collectSkeletonFromExpr(expr.right, depth);
  }
  if (
    expr.type === 'CallExpression' &&
    expr.callee.type === 'MemberExpression' &&
    expr.callee.property.type === 'Identifier' &&
    expr.callee.property.name === 'map'
  ) {
    const repeat = getMapRepeatCount(expr);
    const callback = expr.arguments[0];
    if (
      callback &&
      (callback.type === 'ArrowFunctionExpression' ||
        callback.type === 'FunctionExpression')
    ) {
      const jsxNode = getJsxFromCallback(callback);
      if (jsxNode) {
        const child = buildSkeletonNode(jsxNode, depth);
        if (repeat > 1) child.repeat = repeat;
        return [child];
      }
    }
  }
  return [];
}

function buildSkeletonFromBody(
  body: TSESTree.BlockStatement | TSESTree.Expression,
): SkeletonNode {
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
    return buildSkeletonNode(body, 0);
  }
  if (body.type !== 'BlockStatement') {
    return { tag: 'fragment', children: [] };
  }

  // Prefer the last top-level return (main render path; guards are early returns)
  for (let i = body.body.length - 1; i >= 0; i--) {
    const stmt = body.body[i]!;
    if (stmt.type === 'ReturnStatement' && stmt.argument) {
      const jsx = findFirstJsx(stmt.argument);
      if (jsx) return buildSkeletonNode(jsx, 0);
    }
  }

  // Fallback: any return containing JSX anywhere in the body
  const fallback = findJsxInStmts(body.body);
  if (fallback) return buildSkeletonNode(fallback, 0);

  return { tag: 'fragment', children: [] };
}

// ── Props collection ──────────────────────────────────────────────────────────

function propsFromDestructuring(pattern: TSESTree.ObjectPattern): Set<string> {
  const props = new Set<string>();
  for (const prop of pattern.properties) {
    if (prop.type === 'Property' && prop.key.type === 'Identifier') {
      props.add(prop.key.name);
    }
  }
  return props;
}

function propsFromIdentifierParam(paramName: string, body: TSESTree.Node): Set<string> {
  const props = new Set<string>();
  walkGeneric(body, (n) => {
    if (
      n.type === 'MemberExpression' &&
      !n.computed &&
      n.object.type === 'Identifier' &&
      n.object.name === paramName &&
      n.property.type === 'Identifier'
    ) {
      props.add(n.property.name);
    }
  });
  return props;
}

function propsFromClassBody(classBody: TSESTree.ClassBody): Set<string> {
  const props = new Set<string>();
  walkGeneric(classBody as TSESTree.Node, (n) => {
    if (
      n.type === 'MemberExpression' &&
      !n.computed &&
      n.object.type === 'MemberExpression' &&
      !n.object.computed &&
      n.object.object.type === 'ThisExpression' &&
      n.object.property.type === 'Identifier' &&
      n.object.property.name === 'props' &&
      n.property.type === 'Identifier'
    ) {
      props.add(n.property.name);
    }
  });
  return props;
}

function propsFromParams(
  params: TSESTree.Parameter[],
  body: TSESTree.BlockStatement | TSESTree.Expression,
): Set<string> {
  if (params.length === 0) return new Set();
  const first = params[0]!;

  if (first.type === 'ObjectPattern') {
    return propsFromDestructuring(first);
  }
  if (
    first.type === 'AssignmentPattern' &&
    first.left.type === 'ObjectPattern'
  ) {
    return propsFromDestructuring(first.left as TSESTree.ObjectPattern);
  }
  if (first.type === 'Identifier') {
    return propsFromIdentifierParam(first.name, body as TSESTree.Node);
  }
  return new Set();
}

// ── Component extraction from AST ─────────────────────────────────────────────

function buildFingerprint(
  name: string,
  loc: { line: number; column: number },
  params: TSESTree.Parameter[],
  body: TSESTree.BlockStatement | TSESTree.Expression,
  filePath: string,
  codeSlice: string,
): ComponentFingerprint {
  return {
    name,
    file: filePath,
    line: loc.line,
    column: loc.column,
    props: propsFromParams(params, body),
    structure: collectStructureFromBody(body),
    code: codeSlice,
    skeleton: buildSkeletonFromBody(body),
  };
}

function findRenderMethod(
  classBody: TSESTree.ClassBody,
): TSESTree.MethodDefinition | null {
  for (const member of classBody.body) {
    if (
      member.type === 'MethodDefinition' &&
      member.key.type === 'Identifier' &&
      member.key.name === 'render'
    ) {
      return member;
    }
  }
  return null;
}

function extractFromStatement(
  stmt: TSESTree.Statement | TSESTree.ModuleDeclaration,
  filePath: string,
  code: string,
  out: ComponentFingerprint[],
): void {
  if (
    stmt.type === 'FunctionDeclaration' &&
    stmt.id &&
    PASCAL_CASE_RE.test(stmt.id.name) &&
    directlyReturnsJsx(stmt.body)
  ) {
    const codeSlice = stmt.range ? code.slice(stmt.range[0], stmt.range[1]) : '';
    out.push(
      buildFingerprint(
        stmt.id.name,
        stmt.loc!.start,
        stmt.params,
        stmt.body,
        filePath,
        codeSlice,
      ),
    );
    return;
  }

  if (stmt.type === 'VariableDeclaration') {
    const stmtSlice = stmt.range ? code.slice(stmt.range[0], stmt.range[1]) : '';
    for (const decl of stmt.declarations) {
      if (
        decl.id.type !== 'Identifier' ||
        !PASCAL_CASE_RE.test(decl.id.name) ||
        !decl.init
      ) {
        continue;
      }
      const fn = decl.init;
      if (
        (fn.type === 'ArrowFunctionExpression' ||
          fn.type === 'FunctionExpression') &&
        directlyReturnsJsx(fn.body)
      ) {
        out.push(
          buildFingerprint(
            decl.id.name,
            decl.id.loc!.start,
            fn.params,
            fn.body,
            filePath,
            stmtSlice,
          ),
        );
      }
    }
    return;
  }

  if (
    stmt.type === 'ClassDeclaration' &&
    stmt.id &&
    PASCAL_CASE_RE.test(stmt.id.name)
  ) {
    const renderMethod = findRenderMethod(stmt.body);
    if (renderMethod?.value.type === 'FunctionExpression') {
      const body = renderMethod.value.body;
      if (directlyReturnsJsx(body)) {
        const codeSlice = stmt.range ? code.slice(stmt.range[0], stmt.range[1]) : '';
        out.push({
          name: stmt.id.name,
          file: filePath,
          line: stmt.loc!.start.line,
          column: stmt.loc!.start.column,
          props: propsFromClassBody(stmt.body),
          structure: collectStructureFromBody(body),
          code: codeSlice,
          skeleton: buildSkeletonFromBody(body),
        });
      }
    }
    return;
  }

  if (stmt.type === 'ExportNamedDeclaration' && stmt.declaration) {
    extractFromStatement(
      stmt.declaration as TSESTree.Statement,
      filePath,
      code,
      out,
    );
    return;
  }

  if (stmt.type === 'ExportDefaultDeclaration') {
    const decl = stmt.declaration;
    if (
      decl.type === 'FunctionDeclaration' ||
      decl.type === 'ClassDeclaration'
    ) {
      extractFromStatement(decl as TSESTree.Statement, filePath, code, out);
    }
  }
}

function collectFileComponents(
  filePath: string,
  code: string,
): { fingerprints: ComponentFingerprint[]; ignoreMap: Map<number, Set<string>> } {
  let ast: TSESTree.Program;
  try {
    ast = parseJsx(code);
  } catch {
    return { fingerprints: [], ignoreMap: new Map() };
  }

  const ignoreMap = buildJsxIgnoreMap(code, ast);
  const fingerprints: ComponentFingerprint[] = [];
  for (const stmt of ast.body) {
    extractFromStatement(stmt, filePath, code, fingerprints);
  }
  return { fingerprints, ignoreMap };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computeSimilarity(
  a: ComponentFingerprint,
  b: ComponentFingerprint,
): { total: number; nameScore: number } {
  const nameScore = nameSimilarity(a.name, b.name);
  const propsScore = jaccardSim(a.props, b.props);
  const structureScore = jaccardArraySim(a.structure, b.structure);
  const total = 0.3 * nameScore + 0.35 * propsScore + 0.35 * structureScore;
  return { total, nameScore };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function analyzeVariantSprawl(
  files: Map<string, string>,
  config: uisealConfig,
): Violation[] {
  if (config.rules['variant-sprawl'] === 'off') return [];

  const allFingerprints: ComponentFingerprint[] = [];
  const fileIgnoreMaps = new Map<string, Map<number, Set<string>>>();

  const sortedFiles = [...files.entries()]
    .filter(([p]) => /\.(tsx|jsx)$/i.test(p))
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [filePath, code] of sortedFiles) {
    const { fingerprints, ignoreMap } = collectFileComponents(filePath, code);
    allFingerprints.push(...fingerprints);
    fileIgnoreMaps.set(filePath, ignoreMap);
  }

  if (allFingerprints.length < MIN_COMPONENTS) return [];

  // Sort into canonical scan order: alphabetical file, then line
  allFingerprints.sort((a, b) => {
    const fc = a.file.localeCompare(b.file);
    return fc !== 0 ? fc : a.line - b.line;
  });

  const flaggedPairs: Array<{
    earlier: ComponentFingerprint;
    later: ComponentFingerprint;
    score: number;
  }> = [];

  for (let i = 0; i < allFingerprints.length; i++) {
    for (let j = i + 1; j < allFingerprints.length; j++) {
      const a = allFingerprints[i]!;
      const b = allFingerprints[j]!;
      const { total, nameScore } = computeSimilarity(a, b);
      if (total >= SIMILARITY_THRESHOLD && nameScore >= NAME_THRESHOLD) {
        flaggedPairs.push({ earlier: a, later: b, score: total });
      }
    }
  }

  if (flaggedPairs.length > PAIR_CAP) {
    const first = allFingerprints[0]!;
    return [
      {
        ruleId: 'variant-sprawl',
        severity: 'warning',
        message: `High component duplication detected (${flaggedPairs.length} near-duplicate pairs). Your component library likely needs consolidation.`,
        file: first.file,
        line: first.line,
        column: first.column,
      },
    ];
  }

  const violations: Violation[] = [];

  for (const { earlier, later, score } of flaggedPairs) {
    const ignoreMap = fileIgnoreMaps.get(later.file);
    if (ignoreMap) {
      const entry = ignoreMap.get(later.line);
      if (entry !== undefined) {
        if (entry.size === 0 || entry.has('variant-sprawl')) continue;
      }
    }

    const pct = Math.round(score * 100);
    violations.push({
      ruleId: 'variant-sprawl',
      severity: 'warning',
      message: `Component ${later.name} is ${pct}% similar to ${earlier.name} (${earlier.file}:${earlier.line}). Possible duplicate variant — consider merging into one configurable component.`,
      file: later.file,
      line: later.line,
      column: later.column,
      compare: {
        a: {
          code: earlier.code,
          props: [...earlier.props].sort(),
          structure: earlier.structure,
          skeleton: earlier.skeleton,
          file: earlier.file,
          name: earlier.name,
          line: earlier.line,
        },
        b: {
          code: later.code,
          props: [...later.props].sort(),
          structure: later.structure,
          skeleton: later.skeleton,
          file: later.file,
          name: later.name,
          line: later.line,
        },
      },
    });
  }

  return violations;
}

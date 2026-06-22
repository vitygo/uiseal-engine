import path from 'node:path';
import type { Violation } from '../types.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const WHITE = '\x1b[37m';

function red(s: string): string { return RED + s + RESET; }
function yellow(s: string): string { return YELLOW + s + RESET; }
function bold(s: string): string { return BOLD + s + RESET; }
function dim(s: string): string { return DIM + s + RESET; }

function relativeFile(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return rel.startsWith('..') ? file : rel;
}

const A11Y_RULE_IDS = new Set([
  'no-img-without-alt',
  'no-div-button',
  'no-empty-button',
  'no-missing-form-label',
  'no-positive-tabindex',
  'no-autofocus',
]);

function isA11yRule(ruleId: string): boolean {
  return A11Y_RULE_IDS.has(ruleId);
}

function wrapWords(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const words = text.split(' ');
  const result: string[] = [];
  let cur = '';

  for (const word of words) {
    if (!cur) {
      cur = word;
    } else if (cur.length + 1 + word.length <= width) {
      cur += ' ' + word;
    } else {
      result.push(cur);
      cur = word;
    }
  }
  result.push(cur);
  return result.length ? result : [''];
}

// Indentation scheme:
//   file header  →  2 spaces
//   location     →  4 spaces
//   sev/msg/fix  →  6 spaces
//
// Visible prefix lengths used for wrap-width calculations:
//   "      error  " = 6+5+2 = 13
//   "      fix: "  = 6+4+1 = 11
const FILE_PREFIX = '  ';
const LOC_PREFIX = '    ';
const SEV_PREFIX = '      ';
const MSG_VIS = 13;
const FIX_VIS = 11;
const MSG_CONT = ' '.repeat(MSG_VIS);
const FIX_CONT = ' '.repeat(FIX_VIS);

export interface FormatOptions {
  verbose?: boolean;
}

// Append verbose-format lines for a single violation (location line already pushed by caller).
function appendVerboseLines(v: Violation, lines: string[], cols: number): void {
  const sev = v.severity === 'error' ? red('error') : yellow('warn ');
  const ruleIdPlain = `[${v.ruleId}]`;
  const a11y = isA11yRule(v.ruleId) ? '♿ ' : '';

  if (v.ruleId === 'variant-sprawl') {
    // Extract the embedded "(/path/to/file.ext:line)" from the message and
    // render it on its own "Duplicate:" label line.
    const pathMatch = v.message.match(/\(([^)\s]+\.(tsx?|jsx?|css):\d+)\)/);

    if (pathMatch?.[1]) {
      const filePath = pathMatch[1]!;
      const matchStr = pathMatch[0]!;
      const matchIdx = v.message.indexOf(matchStr);
      const beforePath = v.message.slice(0, matchIdx).trimEnd();
      let afterPath = v.message.slice(matchIdx + matchStr.length);
      // Strip "… Possible duplicate variant — " boilerplate between path and
      // the actionable advice fragment.
      afterPath = afterPath
        .replace(/^\s*\.?\s*Possible duplicate variant\s*[—–-]\s*/i, '')
        .trim();
      if (afterPath) {
        afterPath = afterPath.charAt(0).toUpperCase() + afterPath.slice(1);
      }

      lines.push(`${SEV_PREFIX}${sev}  ${WHITE}${beforePath}${RESET}`);
      lines.push(`${MSG_CONT}${dim('Duplicate:')} ${filePath}`);
      if (afterPath) {
        if (MSG_VIS + afterPath.length + 2 + ruleIdPlain.length <= cols) {
          lines.push(`${MSG_CONT}${WHITE}${afterPath}${RESET}  ${dim(ruleIdPlain)}`);
        } else {
          lines.push(`${MSG_CONT}${WHITE}${afterPath}${RESET}`);
          lines.push(`${MSG_CONT}${dim(ruleIdPlain)}`);
        }
      } else {
        lines.push(`${MSG_CONT}${dim(ruleIdPlain)}`);
      }
      return;
    }
    // Fall through to standard verbose if no path found in message (capped summary).
  }

  // Standard verbose: wrapped message with ruleId appended to last segment.
  const msgPrefix = `${SEV_PREFIX}${sev}  `;
  const msgWidth = cols - MSG_VIS;
  const segments = wrapWords(a11y + v.message, msgWidth);

  segments.forEach((seg, i) => {
    const prefix = i === 0 ? msgPrefix : MSG_CONT;
    const isLast = i === segments.length - 1;
    if (isLast) {
      if (MSG_VIS + seg.length + 2 + ruleIdPlain.length <= cols) {
        lines.push(`${prefix}${WHITE}${seg}${RESET}  ${dim(ruleIdPlain)}`);
      } else {
        lines.push(`${prefix}${WHITE}${seg}${RESET}`);
        lines.push(`${MSG_CONT}${dim(ruleIdPlain)}`);
      }
    } else {
      lines.push(`${prefix}${WHITE}${seg}${RESET}`);
    }
  });

  if (v.fix) {
    const fixPrefix = `${SEV_PREFIX}${dim('fix:')} `;
    const fixWidth = cols - FIX_VIS;
    const fixSegs = wrapWords(v.fix.suggested, fixWidth);
    fixSegs.forEach((seg, i) => {
      lines.push(`${i === 0 ? fixPrefix : FIX_CONT}${seg}`);
    });
  }
}

export function formatReport(violations: Violation[], opts?: FormatOptions): string {
  if (violations.length === 0) {
    return bold('✔  No violations found.\n');
  }

  // Compact mode is default when violation count exceeds 50; --verbose overrides.
  const useVerbose = opts?.verbose === true || violations.length <= 50;

  // Group violations by file, preserving scan order within each file.
  const grouped = new Map<string, Violation[]>();
  for (const v of violations) {
    const arr = grouped.get(v.file);
    if (arr) arr.push(v);
    else grouped.set(v.file, [v]);
  }

  const cols = process.stdout.columns ?? 80;
  const lines: string[] = [''];

  for (const [file, fileViolations] of grouped) {
    lines.push(`${FILE_PREFIX}${dim(relativeFile(file))}`);

    for (const v of fileViolations) {
      const isVariantSprawl = v.ruleId === 'variant-sprawl';

      if (useVerbose || isVariantSprawl) {
        // Verbose: location on its own line, then wrapped sev+message+ruleId.
        lines.push(`${LOC_PREFIX}${dim(`${v.line}:${v.column}`)}`);
        appendVerboseLines(v, lines, cols);
      } else {
        // Compact: single line — loc (padded to 6) + sev + ruleId + message.
        const loc = `${v.line}:${v.column}`;
        const sev = v.severity === 'error' ? red('error') : yellow('warn ');
        const a11y = isA11yRule(v.ruleId) ? '♿ ' : '';
        lines.push(
          `${LOC_PREFIX}${dim(loc.padEnd(6))}${sev}  ${dim(v.ruleId)}  ${WHITE}${a11y}${v.message}${RESET}`,
        );
      }
    }

    lines.push('');
  }

  // Summary — printed exactly once, at the end.
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warnCount = violations.filter((v) => v.severity === 'warning').length;
  const fileCount = grouped.size;

  const parts: string[] = [];
  if (errorCount > 0) parts.push(red(`${errorCount} error${errorCount !== 1 ? 's' : ''}`));
  if (warnCount > 0) parts.push(yellow(`${warnCount} warning${warnCount !== 1 ? 's' : ''}`));

  lines.push(bold(`✖  ${parts.join(', ')} in ${fileCount} file${fileCount !== 1 ? 's' : ''}`));
  lines.push('');

  return lines.join('\n');
}

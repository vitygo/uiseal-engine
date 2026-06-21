import path from 'node:path';
import type { Violation } from '../types.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

function red(s: string): string { return RED + s + RESET; }
function yellow(s: string): string { return YELLOW + s + RESET; }
function cyan(s: string): string { return CYAN + s + RESET; }
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

// Word-wraps plain text. Returns one segment per output line.
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

export function formatReport(violations: Violation[]): string {
  if (violations.length === 0) {
    return bold('✔  No violations found.\n');
  }

  const cols = process.stdout.columns ?? 80;
  const lines: string[] = [''];

  // Visible widths of fixed prefixes:
  //   msg line:  '  ' (2) + sev (5) + '  ' (2) = 9
  //   fix line:  '  ' (2) + 'fix:' (4) + ' ' (1) = 7
  const MSG_PREFIX_VIS = 9;
  const FIX_PREFIX_VIS = 7;
  const msgIndent = ' '.repeat(MSG_PREFIX_VIS);
  const fixIndent = ' '.repeat(FIX_PREFIX_VIS);

  const filesSeen = new Set<string>();
  for (const v of violations) {
    filesSeen.add(v.file);

    // File path + location: own line, never wrapped.
    const file = cyan(relativeFile(v.file));
    const loc = dim(`${v.line}:${v.column}`);
    lines.push(`${file}:${loc}`);

    // Severity + message + ruleId: message wraps, continuation indented to MSG_PREFIX_VIS.
    const sev = v.severity === 'error' ? red('error') : yellow('warn ');
    const msgPrefix = `  ${sev}  `;
    const ruleIdPlain = `[${v.ruleId}]`;
    const a11yPrefix = isA11yRule(v.ruleId) ? '♿ ' : '';
    const msgWidth = cols - MSG_PREFIX_VIS;
    const segments = wrapWords(a11yPrefix + v.message, msgWidth);

    segments.forEach((seg, i) => {
      const prefix = i === 0 ? msgPrefix : msgIndent;
      const isLast = i === segments.length - 1;
      if (isLast) {
        // Append ruleId to last segment if it fits, otherwise on a continuation line.
        if (MSG_PREFIX_VIS + seg.length + 2 + ruleIdPlain.length <= cols) {
          lines.push(`${prefix}${WHITE}${seg}${RESET}  ${dim(ruleIdPlain)}`);
        } else {
          lines.push(`${prefix}${WHITE}${seg}${RESET}`);
          lines.push(`${msgIndent}${dim(ruleIdPlain)}`);
        }
      } else {
        lines.push(`${prefix}${WHITE}${seg}${RESET}`);
      }
    });

    // Fix suggestion: wraps, continuation indented to FIX_PREFIX_VIS.
    if (v.fix) {
      const fixPrefix = `  ${dim('fix:')} `;
      const fixWidth = cols - FIX_PREFIX_VIS;
      const fixSegments = wrapWords(v.fix.suggested, fixWidth);
      fixSegments.forEach((seg, i) => {
        lines.push(`${i === 0 ? fixPrefix : fixIndent}${seg}`);
      });
    }
  }

  lines.push('');

  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warnCount = violations.filter((v) => v.severity === 'warning').length;
  const fileCount = filesSeen.size;

  const parts: string[] = [];
  if (errorCount > 0) parts.push(red(`${errorCount} error${errorCount !== 1 ? 's' : ''}`));
  if (warnCount > 0) parts.push(yellow(`${warnCount} warning${warnCount !== 1 ? 's' : ''}`));

  lines.push(
    bold(`✖  ${parts.join(', ')} in ${fileCount} file${fileCount !== 1 ? 's' : ''}`),
  );
  lines.push('');

  return lines.join('\n');
}

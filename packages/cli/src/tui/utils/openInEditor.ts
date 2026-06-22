import { execSync } from 'node:child_process';

export function openInEditor(filePath: string, line: number, col: number = 1): void {
  const editors = [
    process.env['VISUAL'],
    process.env['EDITOR'],
    'code',
    'cursor',
    'nano',
  ].filter(Boolean) as string[];

  for (const editor of editors) {
    try {
      if (editor === 'code' || editor === 'cursor') {
        execSync(`${editor} --goto "${filePath}:${line}:${col}"`, {
          stdio: 'ignore',
          timeout: 3000,
        });
      } else {
        execSync(`${editor} +${line} "${filePath}"`, {
          stdio: 'ignore',
          timeout: 3000,
        });
      }
      return;
    } catch {
      continue;
    }
  }
}

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_BIN = resolve(__dirname, '../../dist/index.js');
const TEMPLATE_FIXTURE = resolve(__dirname, '../__fixtures__/template-fixture');

function runCli(args: string[], cwd: string) {
  return spawnSync('node', [CLI_BIN, ...args], { cwd, encoding: 'utf8' });
}

describe('Backend template smoke test — buildGlob() picks up Blade/Jinja2/ERB/Twig', () => {
  it('discovers and flags violations in view.blade.php', () => {
    const result = runCli(['check'], TEMPLATE_FIXTURE);
    expect(result.stdout).toContain('view.blade.php');
    expect(result.stdout).toContain('mt-[13px]');
    expect(result.stdout).toContain('no-hardcoded-color');
    expect(result.status).toBe(1);
  });

  it('discovers and flags violations in page.j2', () => {
    const result = runCli(['check'], TEMPLATE_FIXTURE);
    expect(result.stdout).toContain('page.j2');
    expect(result.stdout).toContain('text-[#abc]');
  });

  it('discovers and flags violations in partial.html.erb', () => {
    const result = runCli(['check'], TEMPLATE_FIXTURE);
    expect(result.stdout).toContain('partial.html.erb');
  });

  it('discovers and flags violations in layout.html.twig', () => {
    const result = runCli(['check'], TEMPLATE_FIXTURE);
    expect(result.stdout).toContain('layout.html.twig');
    expect(result.stdout).toContain('text-[15px]');
  });

  it('never scans bare .html or plain .php files', () => {
    const result = runCli(['check'], TEMPLATE_FIXTURE);
    expect(result.stdout).not.toContain('plain.html');
    expect(result.stdout).not.toContain('UserController.php');
    expect(result.stdout).not.toContain('mt-[999px]');
  });

  it('never flags template expressions or standard Tailwind utilities', () => {
    const result = runCli(['check', '--verbose'], TEMPLATE_FIXTURE);
    expect(result.stdout).not.toContain('$isActive');
    expect(result.stdout).not.toContain('extra_classes');
    expect(result.stdout).not.toContain('dynamic_class');
    expect(result.stdout).not.toMatch(/\bpx-4\b/);
  });
});

describe('Backend template --fix', () => {
  it('fixes a Tailwind arbitrary value in a .blade.php file without corrupting template tags', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uiseal-template-fix-'));
    try {
      fs.copyFileSync(
        path.join(TEMPLATE_FIXTURE, 'uiseal.config.json'),
        path.join(dir, 'uiseal.config.json'),
      );
      const original = fs.readFileSync(path.join(TEMPLATE_FIXTURE, 'view.blade.php'), 'utf8');
      fs.writeFileSync(path.join(dir, 'view.blade.php'), original);

      const result = runCli(['check', '--fix'], dir);
      // no-hardcoded-color on #ff0000 has no suggested token (not close to
      // any configured color), so it stays unfixed — exit code reflects that.
      expect(result.status).toBe(1);

      const fixed = fs.readFileSync(path.join(dir, 'view.blade.php'), 'utf8');
      expect(fixed).toContain('mt-[16px]'); // nearest token for 13px given [4,8,16,24]
      expect(fixed).not.toContain('mt-[13px]');
      expect(fixed).toContain('#ff0000'); // left as-is: no fix suggestion available
      // Template tags must survive --fix untouched.
      expect(fixed).toContain("{{ $isActive ? 'bg-red-500' : '' }}");
      expect(fixed).toContain('{{ $name }}');
      expect(fixed).toContain('@if($show)');
      expect(fixed).toContain('@endif');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

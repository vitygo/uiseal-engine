import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { shouldIgnorePath } from './watch.js';

function fileStats(): fs.Stats {
  return { isDirectory: () => false, isFile: () => true } as fs.Stats;
}

function dirStats(): fs.Stats {
  return { isDirectory: () => true, isFile: () => false } as fs.Stats;
}

describe('shouldIgnorePath', () => {
  // Regression test: chokidar calls `ignored` WITHOUT stats for paths it
  // hasn't visited yet — notably the watch root itself on startup. Gating
  // solely on stats?.isDirectory() (undefined when stats is absent) and
  // falling through to the extension check pruned the entire watch root
  // before chokidar ever descended into it, so the watcher silently ended
  // up watching nothing.
  it('does not ignore a path when stats are not yet available, even though it fails the extension check', () => {
    expect(shouldIgnorePath('/repo', undefined, [])).toBe(false);
    expect(shouldIgnorePath('/repo/src', undefined, [])).toBe(false);
  });

  it('does not ignore a known directory once stats confirm it is a directory', () => {
    expect(shouldIgnorePath('/repo/src', dirStats(), [])).toBe(false);
  });

  it('ignores a file whose extension has no registered parser', () => {
    expect(shouldIgnorePath('/repo/README.md', fileStats(), [])).toBe(true);
  });

  it('does not ignore a file with a supported extension', () => {
    expect(shouldIgnorePath('/repo/src/App.tsx', fileStats(), [])).toBe(false);
    expect(shouldIgnorePath('/repo/src/styles.css', fileStats(), [])).toBe(false);
  });

  it('always ignores node_modules and .git, regardless of stats', () => {
    expect(shouldIgnorePath('/repo/node_modules/foo/index.tsx', undefined, [])).toBe(true);
    expect(shouldIgnorePath('/repo/node_modules/foo/index.tsx', fileStats(), [])).toBe(true);
    expect(shouldIgnorePath('/repo/.git/HEAD', fileStats(), [])).toBe(true);
  });

  it('respects config.ignore patterns for both directories and files', () => {
    const ignore = ['**/dist/**', '**/*.generated.tsx'];
    expect(shouldIgnorePath('/repo/dist/bundle.tsx', fileStats(), ignore)).toBe(true);
    expect(shouldIgnorePath('/repo/src/Foo.generated.tsx', fileStats(), ignore)).toBe(true);
    expect(shouldIgnorePath('/repo/src/Foo.tsx', fileStats(), ignore)).toBe(false);
  });

  it('does not ignore backend template files (Blade, Jinja2, ERB, Twig)', () => {
    expect(shouldIgnorePath('/repo/resources/views/home.blade.php', fileStats(), [])).toBe(false);
    expect(shouldIgnorePath('/repo/templates/page.j2', fileStats(), [])).toBe(false);
    expect(shouldIgnorePath('/repo/app/views/partial.html.erb', fileStats(), [])).toBe(false);
    expect(shouldIgnorePath('/repo/templates/layout.html.twig', fileStats(), [])).toBe(false);
  });

  it('still ignores a plain .php file (not *.blade.php) and bare .html', () => {
    expect(shouldIgnorePath('/repo/app/UserController.php', fileStats(), [])).toBe(true);
    expect(shouldIgnorePath('/repo/public/index.html', fileStats(), [])).toBe(true);
  });
});

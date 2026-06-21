import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';

const LINT_STAGED_PATTERN = '*.{tsx,jsx,css}';
const LINT_STAGED_CMD = 'uiseal check --staged';
const PRE_COMMIT_CONTENT = 'npx lint-staged\n';

function detectPm(cwd: string): string {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export const installHooksCommand = new Command('install-hooks')
  .description('Wire up husky + lint-staged so uiseal runs on every commit')
  .action(() => {
    const cwd = process.cwd();
    const pkgPath = path.join(cwd, 'package.json');

    if (!fs.existsSync(pkgPath)) {
      process.stderr.write('No package.json found. Run this command from your project root.\n');
      process.exit(1);
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
    const added: string[] = [];
    const skipped: string[] = [];
    let pkgDirty = false;
    let needsInstall = false;

    // --- devDependencies ---
    const devDeps = (pkg['devDependencies'] ?? {}) as Record<string, string>;

    if (!devDeps['husky']) {
      devDeps['husky'] = '^9.0.0';
      pkg['devDependencies'] = devDeps;
      added.push('husky ^9.0.0 to devDependencies');
      pkgDirty = true;
      needsInstall = true;
    } else {
      skipped.push('husky (already in devDependencies)');
    }

    if (!devDeps['lint-staged']) {
      devDeps['lint-staged'] = '^15.0.0';
      pkg['devDependencies'] = devDeps;
      added.push('lint-staged ^15.0.0 to devDependencies');
      pkgDirty = true;
      needsInstall = true;
    } else {
      skipped.push('lint-staged (already in devDependencies)');
    }

    // --- prepare script ---
    const scripts = (pkg['scripts'] ?? {}) as Record<string, string>;
    if (scripts['prepare'] === 'husky') {
      skipped.push('scripts.prepare (already set to "husky")');
    } else if (scripts['prepare']) {
      skipped.push(`scripts.prepare (already set to "${scripts['prepare']}", not overwriting)`);
    } else {
      scripts['prepare'] = 'husky';
      pkg['scripts'] = scripts;
      added.push('scripts.prepare = "husky"');
      pkgDirty = true;
    }

    // --- lint-staged config ---
    const lintStagedCfg = (pkg['lint-staged'] ?? {}) as Record<string, string>;
    if (lintStagedCfg[LINT_STAGED_PATTERN] === LINT_STAGED_CMD) {
      skipped.push(`lint-staged["${LINT_STAGED_PATTERN}"] (already correct)`);
    } else {
      lintStagedCfg[LINT_STAGED_PATTERN] = LINT_STAGED_CMD;
      pkg['lint-staged'] = lintStagedCfg;
      added.push(`lint-staged["${LINT_STAGED_PATTERN}"] = "${LINT_STAGED_CMD}"`);
      pkgDirty = true;
    }

    if (pkgDirty) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }

    // --- .husky/pre-commit ---
    const huskyDir = path.join(cwd, '.husky');
    const preCommitPath = path.join(huskyDir, 'pre-commit');

    if (!fs.existsSync(huskyDir)) {
      fs.mkdirSync(huskyDir, { recursive: true });
    }

    if (fs.existsSync(preCommitPath)) {
      const existing = fs.readFileSync(preCommitPath, 'utf8');
      if (existing.includes('lint-staged')) {
        skipped.push('.husky/pre-commit (already invokes lint-staged)');
      } else {
        fs.appendFileSync(preCommitPath, '\n' + PRE_COMMIT_CONTENT);
        added.push('.husky/pre-commit (appended "npx lint-staged")');
      }
    } else {
      fs.writeFileSync(preCommitPath, PRE_COMMIT_CONTENT, { mode: 0o755 });
      added.push('.husky/pre-commit');
    }

    // --- output ---
    if (added.length === 0) {
      process.stdout.write('Nothing to do — hook setup is already complete.\n');
    } else {
      process.stdout.write('\nAdded:\n');
      for (const item of added) {
        process.stdout.write(`  + ${item}\n`);
      }
      if (skipped.length > 0) {
        process.stdout.write('\nAlready present (skipped):\n');
        for (const item of skipped) {
          process.stdout.write(`  ~ ${item}\n`);
        }
      }
      if (needsInstall) {
        const pm = detectPm(cwd);
        const installCmd = pm === 'yarn' ? 'yarn' : `${pm} install`;
        process.stdout.write(`\nRun \`${installCmd}\` to install husky and lint-staged.\n`);
      }
    }

    process.stdout.write(
      '\nNote: hooks can be bypassed with --no-verify; CI checking remains the guarantee.\n',
    );
  });

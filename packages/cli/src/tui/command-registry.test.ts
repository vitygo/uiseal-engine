import { describe, it, expect } from 'vitest';
import { getCompletions } from './command-registry.js';

describe('getCompletions', () => {
  it('returns all command names for empty input', () => {
    const completions = getCompletions('');
    expect(completions).toEqual([
      'check',
      'init',
      'baseline',
      'diff',
      'drift',
      'watch',
      'install-hooks',
    ]);
  });

  it('filters command names by prefix', () => {
    expect(getCompletions('ch')).toEqual(['check']);
  });

  it('returns all flags for a command once a trailing space is typed', () => {
    const completions = getCompletions('check ');
    expect(completions).toEqual(
      expect.arrayContaining(['--config', '--staged', '--fix', '--dry-run', '--format', '--output']),
    );
  });

  it('filters flags by prefix', () => {
    expect(getCompletions('check --f')).toEqual(['--fix', '--format']);
  });

  it('filters out flags already present in the input', () => {
    const completions = getCompletions('check --fix ');
    expect(completions).not.toContain('--fix');
    expect(completions).toContain('--format');
  });

  it('suggests enum values for a flag that takes one', () => {
    expect(getCompletions('check --format ')).toEqual(['pretty', 'json', 'sarif']);
  });

  it('suggests baseline subcommands', () => {
    expect(getCompletions('baseline ')).toEqual(['update', 'disable', 'status', 'prune']);
  });

  it('suggests --from values for init', () => {
    expect(getCompletions('init --from ')).toEqual(['tailwind', 'css-vars', 'code']);
  });

  it('suggests --source values for drift', () => {
    expect(getCompletions('drift --source ')).toEqual(['tailwind', 'css-vars', 'code-scan']);
  });

  it('returns empty for an unknown command', () => {
    expect(getCompletions('nope')).toEqual([]);
    expect(getCompletions('nope ')).toEqual([]);
  });

  it('returns empty for an unknown subcommand', () => {
    expect(getCompletions('baseline nope ')).toEqual([]);
  });

  it('filters baseline subcommands and flags for a chosen subcommand', () => {
    expect(getCompletions('baseline up')).toEqual(['update']);
    expect(getCompletions('baseline update ')).toEqual(['--config']);
  });

  it('suggests remaining flags after a boolean flag with no value', () => {
    const completions = getCompletions('drift --json ');
    expect(completions).not.toContain('--json');
    expect(completions).toEqual(expect.arrayContaining(['--source', '--config', '--verbose']));
  });
});

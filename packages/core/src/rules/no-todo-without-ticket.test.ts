import { describe, it, expect } from 'vitest';
import { analyze } from '../runner.js';
import { noTodoWithoutTicket } from './no-todo-without-ticket.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: { colors: {}, spacing: [], fontSizes: [], fontFamilies: [], radii: [] },
  rules: {},
  ignore: [],
};

async function runCss(code: string) {
  const { violations } = await analyze({
    files: new Map([['test.css', code]]),
    config: baseConfig,
    rules: [noTodoWithoutTicket],
  });
  return violations;
}

async function runJsx(code: string) {
  const { violations } = await analyze({
    files: new Map([['test.tsx', code]]),
    config: baseConfig,
    rules: [noTodoWithoutTicket],
  });
  return violations;
}

describe('no-todo-without-ticket — CSS', () => {
  it('flags TODO without a ticket in CSS comment', async () => {
    const vs = await runCss('.a { color: red; } /* TODO: fix this later */');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-todo-without-ticket');
    expect(vs[0]!.severity).toBe('warning');
    expect(vs[0]!.message).toContain('TODO/FIXME without a ticket');
  });

  it('flags FIXME without a ticket in CSS comment', async () => {
    const vs = await runCss('/* FIXME cleanup */');
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-todo-without-ticket');
  });

  it('flags TODO case-insensitively in CSS', async () => {
    const vs = await runCss('/* todo: remove this */');
    expect(vs).toHaveLength(1);
  });

  it('does not flag TODO with a #issue reference in CSS', async () => {
    const vs = await runCss('/* TODO(#123): fix this */');
    expect(vs).toHaveLength(0);
  });

  it('does not flag FIXME with a URL in CSS', async () => {
    const vs = await runCss('/* FIXME: https://example.com/issues/42 */');
    expect(vs).toHaveLength(0);
  });

  it('does not flag TODO with PROJ-456 ticket in CSS', async () => {
    const vs = await runCss('/* TODO: PROJ-456 cleanup */');
    expect(vs).toHaveLength(0);
  });

  it('does not flag TODO with bracketed ticket [JIRA-99] in CSS', async () => {
    const vs = await runCss('/* TODO [JIRA-99] add animation */');
    expect(vs).toHaveLength(0);
  });

  it('does not flag TODO with GH-123 in CSS', async () => {
    const vs = await runCss('/* TODO: GH-123 revisit */');
    expect(vs).toHaveLength(0);
  });

  it('does not flag a plain CSS comment with no TODO/FIXME', async () => {
    const vs = await runCss('/* this is a normal comment */');
    expect(vs).toHaveLength(0);
  });
});

describe('no-todo-without-ticket — JSX/TS (line comments)', () => {
  it('flags TODO without a ticket in a line comment', async () => {
    const vs = await runJsx(`// TODO: fix this later\nconst x = 1;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-todo-without-ticket');
    expect(vs[0]!.severity).toBe('warning');
  });

  it('flags FIXME without a ticket in a line comment', async () => {
    const vs = await runJsx(`// FIXME cleanup\nconst x = 1;`);
    expect(vs).toHaveLength(1);
  });

  it('flags todo lowercase in line comment', async () => {
    const vs = await runJsx(`// todo: remove\nconst x = 1;`);
    expect(vs).toHaveLength(1);
  });

  it('does not flag TODO with #issue reference in line comment', async () => {
    const vs = await runJsx(`// TODO(#123): fix this\nconst x = 1;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag FIXME with a URL in line comment', async () => {
    const vs = await runJsx(`// FIXME: https://example.com\nconst x = 1;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag TODO with PROJ-456 in line comment', async () => {
    const vs = await runJsx(`// TODO: PROJ-456 cleanup\nconst x = 1;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag a plain line comment', async () => {
    const vs = await runJsx(`// this is just a comment\nconst x = 1;`);
    expect(vs).toHaveLength(0);
  });
});

describe('no-todo-without-ticket — JSX/TS (block comments)', () => {
  it('flags TODO without a ticket in a block comment', async () => {
    const vs = await runJsx(`/* TODO: fix this later */\nconst x = 1;`);
    expect(vs).toHaveLength(1);
    expect(vs[0]!.ruleId).toBe('no-todo-without-ticket');
  });

  it('does not flag TODO with GH-123 in block comment', async () => {
    const vs = await runJsx(`/* TODO GH-123 revisit */\nconst x = 1;`);
    expect(vs).toHaveLength(0);
  });

  it('does not flag TODO with [JIRA-99] in block comment', async () => {
    const vs = await runJsx(`/* TODO [JIRA-99] add animation */\nconst x = 1;`);
    expect(vs).toHaveLength(0);
  });
});

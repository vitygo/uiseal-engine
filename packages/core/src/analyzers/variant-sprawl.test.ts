import { describe, it, expect } from 'vitest';
import { analyzeVariantSprawl } from './variant-sprawl.js';
import type { uisealConfig } from '../config/schema.js';

const baseConfig: uisealConfig = {
  tokens: {
    colors: {},
    spacing: [4, 8, 16, 24, 32],
    fontSizes: [14, 16],
    fontFamilies: ['Inter'],
    radii: [4],
  },
  rules: {},
  ignore: [],
};

// Pad a file map with non-similar filler components so the 5-component threshold is met.
function withFillers(
  map: Map<string, string>,
  count: number,
): Map<string, string> {
  const result = new Map(map);
  const fillers = [
    `export function Modal({ isOpen }: any) { return <dialog open={isOpen}><p>content</p></dialog>; }`,
    `export function Tooltip({ text }: any) { return <span title={text} />; }`,
    `export function Badge({ label }: any) { return <span className="badge">{label}</span>; }`,
    `export function Avatar({ src }: any) { return <img src={src} alt="" />; }`,
    `export function Spinner() { return <div className="spinner" />; }`,
  ];
  for (let i = 0; i < count && i < fillers.length; i++) {
    result.set(`filler${i}.tsx`, fillers[i]!);
  }
  return result;
}

describe('variant-sprawl analyzer', () => {
  it('test 1 — ButtonPrimary and ButtonMain with same props+structure are flagged (~100%)', () => {
    const files = withFillers(
      new Map([
        [
          'a.tsx',
          `export function ButtonPrimary({ onClick, label }: any) {
  return <div className="btn"><button onClick={onClick}>{label}</button></div>;
}`,
        ],
        [
          'b.tsx',
          `export function ButtonMain({ onClick, label }: any) {
  return <div className="btn"><button onClick={onClick}>{label}</button></div>;
}`,
        ],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const v = violations.filter((x) => x.ruleId === 'variant-sprawl');
    expect(v.length).toBeGreaterThanOrEqual(1);

    const pair = v.find(
      (x) =>
        x.message.includes('ButtonMain') && x.message.includes('ButtonPrimary'),
    );
    expect(pair).toBeDefined();
    expect(pair!.severity).toBe('warning');
    expect(pair!.message).toMatch(/\d+%/);
    // Score should be close to 100 %
    const pct = parseInt(pair!.message.match(/(\d+)%/)![1]!);
    expect(pct).toBeGreaterThanOrEqual(95);
    // Violation is on the LATER component (b.tsx > a.tsx alphabetically)
    expect(pair!.file).toBe('b.tsx');
  });

  it('test 2 — UserCard and ProductCard are NOT flagged (name score too low)', () => {
    // "Card" is not a stripped suffix, so roots are UserCard/ProductCard → no 1.0 name match.
    // Levenshtein distance between full names keeps name score below 0.5.
    const files = withFillers(
      new Map([
        [
          'c.tsx',
          `export function UserCard({ avatar, username, bio }: any) {
  return <div className="card"><img src={avatar} alt="" /><h3>{username}</h3><p>{bio}</p></div>;
}`,
        ],
        [
          'd.tsx',
          `export function ProductCard({ avatar, username, bio }: any) {
  return <div className="card"><img src={avatar} alt="" /><h3>{username}</h3><p>{bio}</p></div>;
}`,
        ],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const v = violations.filter(
      (x) =>
        x.ruleId === 'variant-sprawl' &&
        (x.message.includes('UserCard') || x.message.includes('ProductCard')),
    );
    expect(v).toHaveLength(0);
  });

  it('test 3 — Button and Modal with totally different structure are NOT flagged', () => {
    const files = withFillers(
      new Map([
        [
          'e.tsx',
          `export function Button({ onClick, label }: any) {
  return <button onClick={onClick}>{label}</button>;
}`,
        ],
        [
          'f.tsx',
          `export function Modal({ isOpen, title, children }: any) {
  return <dialog open={isOpen}><header><h2>{title}</h2></header><main>{children}</main></dialog>;
}`,
        ],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const v = violations.filter(
      (x) =>
        x.ruleId === 'variant-sprawl' &&
        (x.message.includes('Button') || x.message.includes('Modal')),
    );
    expect(v).toHaveLength(0);
  });

  it('test 4 — three near-identical buttons produce exactly 3 pair violations', () => {
    const shared = `{ onClick, label }: any) {
  return <div className="btn"><button onClick={onClick}>{label}</button></div>;
}`;

    const files = withFillers(
      new Map([
        ['g.tsx', `export function ButtonA(${shared}`],
        ['h.tsx', `export function ButtonB(${shared}`],
        ['i.tsx', `export function ButtonC(${shared}`],
      ]),
      2,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const sprawl = violations.filter((x) => x.ruleId === 'variant-sprawl');
    // Pairs: (A,B), (A,C), (B,C) → 3 violations
    expect(sprawl).toHaveLength(3);
    // Each pair reported exactly once (no duplicates of the same pair)
    const messages = sprawl.map((v) => v.message);
    const unique = new Set(messages);
    expect(unique.size).toBe(3);
  });

  it('test 5 — project with 3 components does not run (below threshold)', () => {
    const files = new Map([
      [
        'x.tsx',
        `export function ButtonAlpha({ onClick, label }: any) {
  return <button onClick={onClick}>{label}</button>;
}`,
      ],
      [
        'y.tsx',
        `export function ButtonBeta({ onClick, label }: any) {
  return <button onClick={onClick}>{label}</button>;
}`,
      ],
      [
        'z.tsx',
        `export function ButtonGamma({ onClick, label }: any) {
  return <button onClick={onClick}>{label}</button>;
}`,
      ],
    ]);

    const violations = analyzeVariantSprawl(files, baseConfig);
    expect(violations.filter((x) => x.ruleId === 'variant-sprawl')).toHaveLength(0);
  });

  it('test 6 — uiseal-ignore on a component suppresses its sprawl warning', () => {
    const files = withFillers(
      new Map([
        [
          'p.tsx',
          `export function ButtonPrimary({ onClick, label }: any) {
  return <div className="btn"><button onClick={onClick}>{label}</button></div>;
}`,
        ],
        [
          'q.tsx',
          `// uiseal-ignore variant-sprawl
export function ButtonIgnored({ onClick, label }: any) {
  return <div className="btn"><button onClick={onClick}>{label}</button></div>;
}`,
        ],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const v = violations.filter(
      (x) =>
        x.ruleId === 'variant-sprawl' && x.message.includes('ButtonIgnored'),
    );
    expect(v).toHaveLength(0);
  });

  it('test 7 — more than 50 pairs → single summary violation', () => {
    // 11 components → 11*10/2 = 55 pairs > 50
    const shared = `{ onClick, label }: any) {
  return <div className="btn"><button onClick={onClick}>{label}</button></div>;
}`;

    const files = new Map<string, string>();
    for (let i = 0; i < 11; i++) {
      files.set(
        `comp${i}.tsx`,
        `export function Button${i}(${shared}`,
      );
    }

    const violations = analyzeVariantSprawl(files, baseConfig);
    const sprawl = violations.filter((x) => x.ruleId === 'variant-sprawl');
    expect(sprawl).toHaveLength(1);
    expect(sprawl[0]!.message).toContain('High component duplication detected');
    expect(sprawl[0]!.message).toContain('near-duplicate pairs');
    expect(sprawl[0]!.severity).toBe('warning');
  });

  it('respects variant-sprawl: off config override', () => {
    const config: uisealConfig = {
      ...baseConfig,
      rules: { 'variant-sprawl': 'off' },
    };

    const shared = `({ onClick, label }: any) {
  return <div className="btn"><button onClick={onClick}>{label}</button></div>;
}`;

    const files = withFillers(
      new Map([
        ['r.tsx', `export function ButtonPrimary(${shared}`],
        ['s.tsx', `export function ButtonMain(${shared}`],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, config);
    expect(violations.filter((x) => x.ruleId === 'variant-sprawl')).toHaveLength(0);
  });

  it('correctly points violation to the later file in alphabetical order', () => {
    const shared = `{ onClick, label }: any) {
  return <div className="btn"><button onClick={onClick}>{label}</button></div>;
}`;

    // 'z.tsx' comes after 'a.tsx' alphabetically → violation on z.tsx
    const files = withFillers(
      new Map([
        ['a-btn.tsx', `export function ButtonPrimary(${shared}`],
        ['z-btn.tsx', `export function ButtonMain(${shared}`],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const v = violations.find(
      (x) =>
        x.ruleId === 'variant-sprawl' &&
        x.message.includes('ButtonMain'),
    );
    expect(v).toBeDefined();
    expect(v!.file).toBe('z-btn.tsx');
  });

  // ── Skeleton tests ──────────────────────────────────────────────────────────

  it('skeleton: .map() over 3-item array literal → child has repeat 3', () => {
    const files = withFillers(
      new Map([
        [
          'list-a.tsx',
          `export function ListPrimary({ items }: any) {
  return <ul>{[1, 2, 3].map(i => <li key={i}>{i}</li>)}</ul>;
}`,
        ],
        [
          'list-b.tsx',
          `export function ListMain({ items }: any) {
  return <ul>{[1, 2, 3].map(i => <li key={i}>{i}</li>)}</ul>;
}`,
        ],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const v = violations.find(
      (x) => x.ruleId === 'variant-sprawl' && x.compare != null,
    );
    expect(v).toBeDefined();

    const skel = v!.compare!.b.skeleton;
    expect(skel.tag).toBe('ul');
    const listItem = skel.children[0];
    expect(listItem).toBeDefined();
    expect(listItem!.tag).toBe('li');
    expect(listItem!.repeat).toBe(3);
  });

  it('skeleton: .map() over unknown-length array → repeat defaults to 3', () => {
    const files = withFillers(
      new Map([
        [
          'list-c.tsx',
          `export function ListPrimary({ items }: any) {
  return <ul>{items.map((i: any) => <li key={i.id}>{i.name}</li>)}</ul>;
}`,
        ],
        [
          'list-d.tsx',
          `export function ListMain({ items }: any) {
  return <ul>{items.map((i: any) => <li key={i.id}>{i.name}</li>)}</ul>;
}`,
        ],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const v = violations.find(
      (x) => x.ruleId === 'variant-sprawl' && x.compare != null,
    );
    expect(v).toBeDefined();

    const skel = v!.compare!.b.skeleton;
    expect(skel.tag).toBe('ul');
    const listItem = skel.children[0];
    expect(listItem).toBeDefined();
    expect(listItem!.tag).toBe('li');
    expect(listItem!.repeat).toBe(3);
  });

  it('skeleton: nesting deeper than 4 levels is truncated at depth 4', () => {
    // 5 nested divs + a span at depth 5 — the span must not appear
    const deepJsx =
      '<div><div><div><div><div><span>deep</span></div></div></div></div></div>';
    const files = withFillers(
      new Map([
        [
          'deep-a.tsx',
          `export function DeepPrimary({ x }: any) { return ${deepJsx}; }`,
        ],
        [
          'deep-b.tsx',
          `export function DeepMain({ x }: any) { return ${deepJsx}; }`,
        ],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const v = violations.find(
      (x) => x.ruleId === 'variant-sprawl' && x.compare != null,
    );
    expect(v).toBeDefined();

    // Tree: div(0)→div(1)→div(2)→div(3)→div(4=leaf, children=[])
    const skel = v!.compare!.b.skeleton;
    expect(skel.tag).toBe('div');
    const d1 = skel.children[0];
    expect(d1?.tag).toBe('div');
    const d2 = d1!.children[0];
    expect(d2?.tag).toBe('div');
    const d3 = d2!.children[0];
    expect(d3?.tag).toBe('div');
    const d4 = d3!.children[0];
    expect(d4?.tag).toBe('div');
    // depth 4 node must have no children (span is beyond the limit)
    expect(d4!.children).toHaveLength(0);
  });

  it('skeleton: more than 6 children at one level → truncated with +N more marker', () => {
    // 8 span children → first 6 shown, then "+2 more" marker
    const kids = '<span/><span/><span/><span/><span/><span/><span/><span/>';
    const jsx = `<div>${kids}</div>`;
    const files = withFillers(
      new Map([
        [
          'card-a.tsx',
          `export function CardPrimary({ x }: any) { return ${jsx}; }`,
        ],
        [
          'card-b.tsx',
          `export function CardMain({ x }: any) { return ${jsx}; }`,
        ],
      ]),
      3,
    );

    const violations = analyzeVariantSprawl(files, baseConfig);
    const v = violations.find(
      (x) => x.ruleId === 'variant-sprawl' && x.compare != null,
    );
    expect(v).toBeDefined();

    const skel = v!.compare!.b.skeleton;
    expect(skel.tag).toBe('div');
    // 6 real children + 1 "+2 more" marker = 7
    expect(skel.children).toHaveLength(7);
    const marker = skel.children[6];
    expect(marker!.tag).toMatch(/^\+\d+ more$/);
    expect(marker!.tag).toBe('+2 more');
  });
});

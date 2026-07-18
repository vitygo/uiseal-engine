import { describe, it, expect } from 'vitest';
import { analyze } from './runner.js';
import { allRules } from './rules/index.js';
import type { uisealConfig } from './config/schema.js';

// spacing scale kept under 5 entries so spacing-near-token (which only
// activates at >=5 tokens) stays off, keeping expected violations
// predictable: plain no-arbitrary-spacing fires for every off-scale value
// rather than sometimes being superseded by a near-miss suggestion.
const config: uisealConfig = {
  tokens: {
    colors: { primary: '#3b82f6' },
    spacing: [4, 8, 16, 24],
    fontSizes: [12, 14, 16],
    fontFamilies: ['Inter'],
    radii: [4, 8],
  },
  rules: {},
  ignore: [],
};

async function run(file: string, content: string) {
  const { violations } = await analyze({ files: new Map([[file, content]]), config, rules: allRules });
  return violations;
}

const ruleIds = (vs: { ruleId: string }[]) => vs.map((v) => v.ruleId);
const messages = (vs: { message: string }[]) => vs.map((v) => v.message).join('\n');

describe('backend template dialects — full analyze() pipeline', () => {
  it('Blade: flags Tailwind arbitrary values, style violations, and skips {{ }}/@directive/standard utilities', async () => {
    const src = [
      '<div class="px-4 mt-[13px] text-blue-500 bg-[#ff5733]"',
      '     style="padding: 13px; color: #ff0000">',
      "  <p class=\"{{ \$isActive ? 'bg-red-500' : '' }} rounded-[7px]\">",
      '    {{ $name }}',
      '  </p>',
      '  @if($show)',
      '    <span style="font-size: 15px">Hello</span>',
      '  @endif',
      '</div>',
    ].join('\n');
    const violations = await run('view.blade.php', src);

    expect(ruleIds(violations)).toEqual(
      expect.arrayContaining([
        'no-tailwind-arbitrary', // mt-[13px]
        'no-tailwind-arbitrary', // bg-[#ff5733]
        'no-tailwind-arbitrary', // rounded-[7px]
        'no-arbitrary-spacing', // padding: 13px
        'no-hardcoded-color', // color: #ff0000
        'no-arbitrary-font-size', // font-size: 15px
      ]),
    );
    expect(messages(violations)).not.toContain('$isActive');
    expect(messages(violations)).not.toContain('$name');
    expect(messages(violations)).not.toMatch(/\bpx-4\b/);
    expect(messages(violations)).not.toContain('text-blue-500');
  });

  it('Jinja2: flags Tailwind arbitrary + style violations, skips {{ }}/{% %} and standard utilities', async () => {
    const src = [
      '<div class="px-4 mt-[13px] {{ extra_classes }}"',
      '     style="padding: 13px">',
      '  {% if show %}',
      '    <span class="text-[#abc]" style="margin: 7px">',
      '      {{ name }}',
      '    </span>',
      '  {% endif %}',
      '</div>',
    ].join('\n');
    const violations = await run('page.j2', src);

    expect(ruleIds(violations)).toEqual(expect.arrayContaining(['no-tailwind-arbitrary', 'no-arbitrary-spacing']));
    const arbitraryMessages = violations.filter((v) => v.ruleId === 'no-tailwind-arbitrary').map((v) => v.message);
    expect(arbitraryMessages.some((m) => m.includes('mt-[13px]'))).toBe(true);
    expect(arbitraryMessages.some((m) => m.includes('text-[#abc]'))).toBe(true);
    expect(messages(violations)).not.toContain('extra_classes');
    expect(messages(violations)).not.toMatch(/\bpx-4\b/);
  });

  it('ERB: flags Tailwind arbitrary + style violations, skips <%= %>/<% %> and standard utilities', async () => {
    const src = [
      '<div class="px-4 mt-[13px] <%= classes %>"',
      '     style="color: #ff0000">',
      '  <% if show %>',
      '    <p style="padding: 9px"><%= content %></p>',
      '  <% end %>',
      '</div>',
    ].join('\n');
    const violations = await run('partial.html.erb', src);

    expect(ruleIds(violations)).toEqual(
      expect.arrayContaining(['no-tailwind-arbitrary', 'no-hardcoded-color', 'no-arbitrary-spacing']),
    );
    expect(messages(violations)).not.toContain('classes %>');
    expect(messages(violations)).not.toMatch(/\bpx-4\b/);
  });

  it('Twig: flags Tailwind arbitrary + style violations, skips {{ }}/{% block %} and standard utilities', async () => {
    const src = [
      '<div class="mt-[13px] bg-[#fff]" style="border-radius: 7px">',
      '  {% block content %}',
      '    <span class="{{ dynamic_class }} text-[15px]">',
      '      {{ name }}',
      '    </span>',
      '  {% endblock %}',
      '</div>',
    ].join('\n');
    const violations = await run('layout.html.twig', src);

    const arbitraryMessages = violations.filter((v) => v.ruleId === 'no-tailwind-arbitrary').map((v) => v.message);
    expect(arbitraryMessages.some((m) => m.includes('mt-[13px]'))).toBe(true);
    expect(arbitraryMessages.some((m) => m.includes('bg-[#fff]'))).toBe(true);
    expect(arbitraryMessages.some((m) => m.includes('text-[15px]'))).toBe(true);
    expect(ruleIds(violations)).toContain('no-arbitrary-radius');
    expect(messages(violations)).not.toContain('dynamic_class');
  });

  it('position preservation: a violation nested inside a stripped directive reports the correct original line', async () => {
    const src = [
      '<div>',
      '  @if($show)',
      '    <span style="font-size: 15px">Hello</span>',
      '  @endif',
      '</div>',
    ].join('\n');
    const violations = await run('nested.blade.php', src);
    const fontSizeViolation = violations.find((v) => v.ruleId === 'no-arbitrary-font-size');
    expect(fontSizeViolation?.line).toBe(3);
  });
});

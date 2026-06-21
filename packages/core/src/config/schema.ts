import { z } from 'zod';

export const uisealConfigSchema = z.object({
  tokens: z.object({
    colors: z.record(z.string(), z.string()),
    spacing: z.array(z.number()),
    fontSizes: z.array(z.number()),
    fontFamilies: z.array(z.string()),
    radii: z.array(z.number()),
  }),
  rules: z.record(z.string(), z.enum(['off', 'warn', 'error'])),
  wcag: z
    .object({ level: z.enum(['AA', 'AAA']) })
    .optional(),
  ignore: z
    .array(z.string())
    .default(['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/*.min.css']),
  baseline: z
    .object({
      enabled: z.boolean().default(false),
      path: z.string().default('.uiseal-baseline.json'),
    })
    .default({ enabled: false, path: '.uiseal-baseline.json' }),
});

export type uisealConfig = z.infer<typeof uisealConfigSchema>;

export function defineConfig(config: z.input<typeof uisealConfigSchema>): z.input<typeof uisealConfigSchema> {
  return config;
}

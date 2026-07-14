// Token-source abstraction: a source reads a CONFIG or design-token file
// (or, for code-scan, source code) and returns tokens in uiseal's shape —
// distinct from the extractor's own `ExtractedTokens` (extractor/index.ts),
// which holds raw usage counts (Map<value, count>) for the interactive
// init review flow. SourceTokens here is already flattened/deduped, ready
// to drop into a uiseal.config.json.

export interface SourceTokens {
  /** name → hex/rgb value */
  colors: Record<string, string>;
  /** px values */
  spacing: number[];
  /** px values */
  fontSizes: number[];
  fontFamilies: string[];
  /** px values */
  radii: number[];
}

export interface DetectResult {
  found: boolean;
  /** path to the detected config/file, when found */
  file?: string;
  /** 0-1, for ranking when multiple sources are detected */
  confidence: number;
}

export interface TokenSource {
  /** 'tailwind' | 'css-vars' | 'code-scan' | ... */
  id: string;
  /** human-readable label for CLI prompts, e.g. 'Tailwind CSS config' */
  label: string;
  detect(cwd: string): Promise<DetectResult>;
  extract(cwd: string, options?: Record<string, unknown>): Promise<SourceTokens>;
}

export type SkeletonNode = {
  tag: string;
  className?: string;
  repeat?: number;
  children: SkeletonNode[];
};

export interface Violation {
  ruleId: string;
  severity: 'error' | 'warning';
  message: string;
  file: string;
  line: number;
  column: number;
  fix?: { suggested: string };
  /** Set when baseline is active: true = in baseline snapshot (debt), false/absent = new issue */
  frozen?: boolean;
  /** Present on variant-sprawl violations: side-by-side structural comparison data */
  compare?: {
    a: { code: string; props: string[]; structure: string[]; skeleton: SkeletonNode; file: string; name: string; line: number };
    b: { code: string; props: string[]; structure: string[]; skeleton: SkeletonNode; file: string; name: string; line: number };
  };
}

// Collapses a burst of rapid file-system events into one flush call.
// Keyed by path so several quick writes to the same file collapse to just
// its latest content, and a change immediately followed by a delete ends
// up as a delete — not both. Generic and timer-based so it's testable in
// isolation with fake timers, independent of chokidar or the terminal.
export class ChangeBatcher<T> {
  private pending = new Map<string, T>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly delayMs: number,
    private readonly onFlush: (items: T[]) => void,
  ) {}

  add(key: string, item: T): void {
    this.pending.set(key, item);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;
    const items = [...this.pending.values()];
    this.pending.clear();
    this.onFlush(items);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
  }
}

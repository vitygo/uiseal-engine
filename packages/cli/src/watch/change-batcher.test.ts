import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChangeBatcher } from './change-batcher.js';

describe('ChangeBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not flush before the delay elapses', () => {
    const onFlush = vi.fn();
    const batcher = new ChangeBatcher<string>(300, onFlush);

    batcher.add('a.ts', 'content-a');
    vi.advanceTimersByTime(299);

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('flushes once the delay elapses since the LAST add (rapid saves reset the timer)', () => {
    const onFlush = vi.fn();
    const batcher = new ChangeBatcher<string>(300, onFlush);

    batcher.add('a.ts', 'v1');
    vi.advanceTimersByTime(200);
    batcher.add('a.ts', 'v2'); // resets the timer
    vi.advanceTimersByTime(200);
    expect(onFlush).not.toHaveBeenCalled(); // only 200ms since the last add

    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(['v2']); // only the latest value for that key survives
  });

  it('collapses multiple rapid changes to the SAME key into one item (the latest)', () => {
    const onFlush = vi.fn();
    const batcher = new ChangeBatcher<string>(300, onFlush);

    batcher.add('a.ts', 'v1');
    batcher.add('a.ts', 'v2');
    batcher.add('a.ts', 'v3');
    vi.advanceTimersByTime(300);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(['v3']);
  });

  it('batches changes to DIFFERENT keys into a single flush', () => {
    const onFlush = vi.fn();
    const batcher = new ChangeBatcher<string>(300, onFlush);

    batcher.add('a.ts', 'a');
    batcher.add('b.ts', 'b');
    batcher.add('c.ts', 'c');
    vi.advanceTimersByTime(300);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0]![0]).toEqual(expect.arrayContaining(['a', 'b', 'c']));
    expect(onFlush.mock.calls[0]![0]).toHaveLength(3);
  });

  it('a change immediately followed by a delete for the same key resolves as the delete', () => {
    const onFlush = vi.fn<(items: { type: string }[]) => void>();
    const batcher = new ChangeBatcher<{ type: string }>(300, onFlush);

    batcher.add('a.ts', { type: 'change' });
    batcher.add('a.ts', { type: 'unlink' });
    vi.advanceTimersByTime(300);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([{ type: 'unlink' }]);
  });

  it('flush() manually triggers immediately without waiting for the timer', () => {
    const onFlush = vi.fn();
    const batcher = new ChangeBatcher<string>(300, onFlush);

    batcher.add('a.ts', 'v1');
    batcher.flush();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(['v1']);
  });

  it('flush() is a no-op when nothing is pending', () => {
    const onFlush = vi.fn();
    const batcher = new ChangeBatcher<string>(300, onFlush);

    batcher.flush();

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('cancel() discards pending items and prevents the scheduled flush', () => {
    const onFlush = vi.fn();
    const batcher = new ChangeBatcher<string>(300, onFlush);

    batcher.add('a.ts', 'v1');
    batcher.cancel();
    vi.advanceTimersByTime(1000);

    expect(onFlush).not.toHaveBeenCalled();
  });

  it('supports another add()/flush() cycle after a flush', () => {
    const onFlush = vi.fn();
    const batcher = new ChangeBatcher<string>(300, onFlush);

    batcher.add('a.ts', 'v1');
    vi.advanceTimersByTime(300);
    batcher.add('b.ts', 'v2');
    vi.advanceTimersByTime(300);

    expect(onFlush).toHaveBeenCalledTimes(2);
    expect(onFlush).toHaveBeenNthCalledWith(1, ['v1']);
    expect(onFlush).toHaveBeenNthCalledWith(2, ['v2']);
  });
});

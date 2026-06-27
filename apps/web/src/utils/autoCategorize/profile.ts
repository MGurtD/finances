/**
 * Phase 6: Performance profiling for the auto-categorisation pipeline.
 *
 * The pipeline runs 9 strategies per description. On a 1000-row import
 * that's 9000 invocations. Most are cheap (regex + array filter), but
 * the fuzzy merchant match uses a token-by-token similarity comparison
 * that's O(n × m). This module measures wall-clock time per strategy
 * and per stage so we can spot regressions.
 *
 * Profiling is opt-in: call `startProfiling()` once, then read the
 * results via `getProfileReport()`.
 */

interface StrategyTiming {
  count: number;
  totalMs: number;
  maxMs: number;
  minMs: number;
}

let enabled = false;
const strategyTimes = new Map<string, StrategyTiming>();
const pipelineStarts = new Map<string, number>();

export function startProfiling(): void {
  enabled = true;
  strategyTimes.clear();
  pipelineStarts.clear();
}

export function stopProfiling(): void {
  enabled = false;
}

export function isProfiling(): boolean {
  return enabled;
}

/** Time a single strategy call. */
export function timeStrategy<R>(name: string, fn: () => R): R {
  if (!enabled) return fn();
  const t0 = performance.now();
  const result = fn();
  const dt = performance.now() - t0;
  const cur = strategyTimes.get(name) ?? {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    minMs: Infinity,
  };
  cur.count++;
  cur.totalMs += dt;
  cur.maxMs = Math.max(cur.maxMs, dt);
  cur.minMs = Math.min(cur.minMs, dt);
  strategyTimes.set(name, cur);
  return result;
}

/** Mark the start of a full pipeline run. */
export function markPipelineStart(label: string): void {
  if (!enabled) return;
  pipelineStarts.set(label, performance.now());
}

export function markPipelineEnd(label: string): void {
  if (!enabled) return;
  const t0 = pipelineStarts.get(label);
  if (t0 === undefined) return;
  const dt = performance.now() - t0;
  pipelineStarts.delete(label);
  const cur = strategyTimes.get('__pipeline__') ?? {
    count: 0,
    totalMs: 0,
    maxMs: 0,
    minMs: Infinity,
  };
  cur.count++;
  cur.totalMs += dt;
  cur.maxMs = Math.max(cur.maxMs, dt);
  cur.minMs = Math.min(cur.minMs, dt);
  strategyTimes.set('__pipeline__', cur);
}

export function getProfileReport(): string {
  if (strategyTimes.size === 0) return '(no profiling data)';
  const lines: string[] = ['strategy                          count   total    avg     max'];
  const sorted = Array.from(strategyTimes.entries()).sort(
    (a, b) => b[1].totalMs - a[1].totalMs,
  );
  for (const [name, t] of sorted) {
    const avg = t.totalMs / t.count;
    lines.push(
      `${name.padEnd(34)} ${String(t.count).padStart(5)} ${t.totalMs.toFixed(2).padStart(7)}ms ${avg.toFixed(3).padStart(7)}ms ${t.maxMs.toFixed(3).padStart(7)}ms`,
    );
  }
  return lines.join('\n');
}

export function resetProfile(): void {
  strategyTimes.clear();
  pipelineStarts.clear();
}
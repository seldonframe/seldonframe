// poll — wait until a value crosses a threshold, injected effects → zero-timer tests.
export type PollDeps = {
  startUsd: number;
  getBalanceUsd: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  maxAttempts: number;
  intervalMs?: number;
};
export async function pollUntilFunded(deps: PollDeps): Promise<boolean> {
  for (let attempt = 0; attempt < deps.maxAttempts; attempt++) {
    if (attempt > 0) await deps.sleep(deps.intervalMs ?? 3000);
    let current = deps.startUsd;
    try { current = await deps.getBalanceUsd(); } catch { current = deps.startUsd; }
    if (current > deps.startUsd) return true;
  }
  return false;
}

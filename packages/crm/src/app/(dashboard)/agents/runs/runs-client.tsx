"use client";

// Client-side state for /agents/runs: drawer open/close, polling
// refresh, resume/cancel button handlers. Server page loads the
// initial snapshot; this component handles everything reactive.
//
// L-18: this file is client-only by design — `"use client"` + React
// hooks at module top. It imports ONLY from shared UI primitives
// and types. API calls go through fetch(), never through server
// modules.

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { SerializedRun, SerializedStepResult, SerializedWait } from "./page";

type Props = {
  initialRuns: SerializedRun[];
  initialWaits: SerializedWait[];
  initialStepResults: SerializedStepResult[];
};

const POLL_INTERVAL_MS = 2000; // §6.5: 2s polling refresh in v1.

function relativeTimeTo(iso: string): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((target - now) / 1000);
  if (diffSec <= 0) return "overdue";
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m`;
  if (diffSec < 86_400) return `${Math.round(diffSec / 3600)}h`;
  return `${Math.round(diffSec / 86_400)}d`;
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "running":
      return "default";
    case "waiting":
      return "secondary";
    case "completed":
      return "outline";
    case "failed":
      return "destructive";
    case "cancelled":
      return "outline";
  }
  return "secondary";
}

export function RunsClient({ initialRuns, initialWaits, initialStepResults }: Props) {
  const [runs, setRuns] = useState(initialRuns);
  const [waits, setWaits] = useState(initialWaits);
  const [stepResults, setStepResults] = useState(initialStepResults);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // Polling refresh. Re-hits the same page (as an HTML fetch +
  // regex-extracted JSON would be brittle); instead, call a lightweight
  // JSON endpoint. For M3 minimalism we re-fetch via a server action
  // pattern — but simpler for now is to set up an API route later. In
  // the meantime, refresh-on-focus via document.visibilitychange +
  // manual refresh button.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => {
      if (!document.hidden) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        refreshSnapshot().then((snapshot) => {
          if (snapshot) {
            setRuns(snapshot.runs);
            setWaits(snapshot.waits);
            setStepResults(snapshot.stepResults);
          }
        });
      }
    };
    const interval = setInterval(handler, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", handler);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handler);
    };
  }, []);

  const selectedRun = openRunId ? runs.find((r) => r.id === openRunId) ?? null : null;
  const selectedWaits = openRunId ? waits.filter((w) => w.runId === openRunId) : [];
  const selectedResults = openRunId
    ? stepResults.filter((r) => r.runId === openRunId)
    : [];
  const selectedPendingWait = selectedWaits.find((w) => w.resumedAt === null) ?? null;

  async function handleResume(runId: string) {
    setActionBusy(true);
    try {
      const res = await fetch(`/api/v1/workflow-runs/${runId}/resume`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Resume failed: ${body.reason ?? body.error ?? res.status}`);
      }
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCancel(runId: string) {
    if (!confirm("Cancel this run? Waiting events will be discarded.")) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/v1/workflow-runs/${runId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Cancel failed: ${body.reason ?? body.error ?? res.status}`);
      }
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Archetype</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Current step</TableHead>
            <TableHead>Waiting for</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No runs yet. Trigger an archetype to see it here.
              </TableCell>
            </TableRow>
          ) : (
            runs.map((run) => {
              const pendingWait = waits.find((w) => w.runId === run.id && !w.resumedAt);
              return (
                <TableRow
                  key={run.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setOpenRunId(run.id)}
                >
                  <TableCell className="font-medium">{run.archetypeId}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{run.currentStepId ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {pendingWait ? (
                      <>
                        <span className="font-mono">{pendingWait.eventType}</span>
                        <span className="text-muted-foreground ml-2">
                          (timeout in {relativeTimeTo(pendingWait.timeoutAt)})
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(run.updatedAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Sheet open={openRunId !== null} onOpenChange={(open) => !open && setOpenRunId(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedRun?.specSnapshot.name ?? selectedRun?.archetypeId ?? "Run"}
            </SheetTitle>
          </SheetHeader>

          {selectedRun ? (
            <div className="mt-4 space-y-4 text-sm">
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Run id</dt>
                <dd className="font-mono text-xs">{selectedRun.id}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd><Badge variant={statusBadgeVariant(selectedRun.status)}>{selectedRun.status}</Badge></dd>
                <dt className="text-muted-foreground">Current step</dt>
                <dd className="font-mono text-xs">{selectedRun.currentStepId ?? "—"}</dd>
                <dt className="text-muted-foreground">Started</dt>
                <dd className="text-xs">{new Date(selectedRun.createdAt).toLocaleString()}</dd>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="text-xs">{new Date(selectedRun.updatedAt).toLocaleString()}</dd>
              </dl>

              {selectedPendingWait ? (
                <section className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <h3 className="font-medium">Waiting for event</h3>
                  <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Event type</dt>
                    <dd className="font-mono">{selectedPendingWait.eventType}</dd>
                    <dt className="text-muted-foreground">Timeout</dt>
                    <dd>
                      {new Date(selectedPendingWait.timeoutAt).toLocaleString()}
                      <span className="text-muted-foreground ml-2">
                        ({relativeTimeTo(selectedPendingWait.timeoutAt)})
                      </span>
                    </dd>
                    {selectedPendingWait.matchPredicate ? (
                      <>
                        <dt className="text-muted-foreground">Match predicate</dt>
                        <dd>
                          <pre className="font-mono text-[11px] bg-background border border-border rounded p-2 overflow-x-auto">
                            {JSON.stringify(selectedPendingWait.matchPredicate, null, 2)}
                          </pre>
                        </dd>
                      </>
                    ) : null}
                  </dl>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="default"
                      disabled={actionBusy}
                      onClick={() => handleResume(selectedRun.id)}
                    >
                      Resume manually
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionBusy}
                      onClick={() => handleCancel(selectedRun.id)}
                    >
                      Cancel run
                    </Button>
                  </div>
                </section>
              ) : null}

              <section>
                <h3 className="font-medium mb-2">Step trace</h3>
                {selectedResults.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No steps executed yet.</p>
                ) : (
                  <ol className="space-y-1 text-xs">
                    {selectedResults.map((r) => (
                      <li key={r.id} className="flex items-start gap-2">
                        <Badge variant={outcomeBadgeVariant(r.outcome)} className="mt-0.5 shrink-0">
                          {r.outcome}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <span className="font-mono">{r.stepId}</span>
                          <span className="text-muted-foreground"> · {r.stepType} · {r.durationMs}ms</span>
                          {r.errorMessage ? (
                            <p className="text-destructive mt-0.5">{r.errorMessage}</p>
                          ) : null}
                          {r.captureValue ? (
                            <pre className="font-mono text-[10px] text-muted-foreground mt-0.5 overflow-x-auto">
                              {JSON.stringify(r.captureValue, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {selectedRun.status === "failed" || selectedRun.status === "cancelled" ? null : (
                !selectedPendingWait ? (
                  <section>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionBusy || selectedRun.status === "completed"}
                      onClick={() => handleCancel(selectedRun.id)}
                    >
                      Cancel run
                    </Button>
                  </section>
                ) : null
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function outcomeBadgeVariant(outcome: string): "default" | "secondary" | "destructive" | "outline" {
  switch (outcome) {
    case "advanced":
      return "default";
    case "paused":
      return "secondary";
    case "failed":
      return "destructive";
  }
  return "outline";
}

// Refetch the server snapshot. Uses Next.js's router.refresh() route
// for simplicity — the server page is already `force-dynamic` so
// router.refresh invalidates + re-renders it. But the client state
// above holds its own copy, so we need a JSON endpoint to update.
// For M3 we keep the simplest possible implementation: trigger a
// hard reload when stale. Production refinement in a follow-up.
async function refreshSnapshot(): Promise<{
  runs: SerializedRun[];
  waits: SerializedWait[];
  stepResults: SerializedStepResult[];
} | null> {
  try {
    const res = await fetch("/api/v1/workflow-runs", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      runs: SerializedRun[];
      waits: SerializedWait[];
      stepResults: SerializedStepResult[];
    };
    return data;
  } catch {
    return null;
  }
}

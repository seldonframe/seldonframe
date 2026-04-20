"use client";

import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { moveDealStageAction } from "@/lib/deals/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import { CrmViewRenderer } from "@/components/crm/crm-view-renderer";
import type { CrmRecord, CrmScopedOverride } from "@/components/crm/types";

export function DealsCrmSurface({
  blockMd,
  records,
  stageProbabilities,
  scopedOverride,
  endClientMode = false,
  route,
  viewName,
}: {
  blockMd: string;
  records: CrmRecord[];
  stageProbabilities: Record<string, number>;
  scopedOverride?: CrmScopedOverride;
  endClientMode?: boolean;
  route: string;
  viewName?: string;
}) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();
  const router = useRouter();
  const resolvedScopedOverride = useMemo<CrmScopedOverride>(
    () => ({
      ...scopedOverride,
      laneOrder: scopedOverride?.laneOrder ?? Object.keys(stageProbabilities),
    }),
    [scopedOverride, stageProbabilities]
  );

  return (
    <div data-pending={pending}>
      <CrmViewRenderer
        blockMd={blockMd}
        viewName={viewName}
        route={route}
        records={records}
        scopedOverride={resolvedScopedOverride}
        endClientMode={endClientMode}
        onMoveCard={({ recordId, toLane }) => {
          startTransition(async () => {
            try {
              if (isDemoReadonlyClient) {
                showDemoToast();
                return;
              }

              await moveDealStageAction(recordId, toLane, stageProbabilities[toLane] ?? 0);
              router.refresh();
            } catch (error) {
              if (isDemoBlockedError(error)) {
                showDemoToast();
                return;
              }

              throw error;
            }
          });
        }}
      />
    </div>
  );
}

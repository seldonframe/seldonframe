"use client";

import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import { CrmViewRenderer } from "@/components/crm/crm-view-renderer";
import type { CrmRecord, CrmScopedOverride } from "@/components/crm/types";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { moveCustomObjectLaneAction, updateCustomObjectFieldAction } from "@/lib/crm/custom-object-actions";

export function CustomObjectCrmSurface({
  blockMd,
  records,
  objectSlug,
  route,
  viewName,
  scopedOverride,
  endClientMode = false,
  clientId,
  editableFields,
}: {
  blockMd: string;
  records: CrmRecord[];
  objectSlug: string;
  route: string;
  viewName?: string;
  scopedOverride?: CrmScopedOverride;
  endClientMode?: boolean;
  clientId?: string | null;
  editableFields: string[];
}) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();
  const router = useRouter();
  const resolvedScopedOverride = useMemo<CrmScopedOverride>(
    () => ({
      ...scopedOverride,
      editableFields: scopedOverride?.editableFields ?? editableFields,
    }),
    [editableFields, scopedOverride]
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
        onInlineEdit={({ recordId, field, value }) => {
          startTransition(async () => {
            try {
              if (isDemoReadonlyClient) {
                showDemoToast();
                return;
              }

              await updateCustomObjectFieldAction({
                objectSlug,
                recordId,
                field,
                value,
                clientId,
              });
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
        onMoveCard={({ recordId, laneField, toLane }) => {
          startTransition(async () => {
            try {
              if (isDemoReadonlyClient) {
                showDemoToast();
                return;
              }

              await moveCustomObjectLaneAction({
                objectSlug,
                recordId,
                laneField,
                toLane,
                clientId,
              });
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

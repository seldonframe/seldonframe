"use client";

import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";
import { updateContactFieldAction } from "@/lib/contacts/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import { CrmViewRenderer } from "@/components/crm/crm-view-renderer";
import type { CrmRecord, CrmScopedOverride } from "@/components/crm/types";

export function ContactsCrmSurface({
  blockMd,
  records,
  scopedOverride,
  endClientMode = false,
  route = "/contacts",
  viewName,
}: {
  blockMd: string;
  records: CrmRecord[];
  scopedOverride?: CrmScopedOverride;
  endClientMode?: boolean;
  route?: string;
  viewName?: string;
}) {
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();
  const router = useRouter();
  const resolvedScopedOverride = useMemo<CrmScopedOverride>(
    () => ({
      ...scopedOverride,
      editableFields: scopedOverride?.editableFields ?? ["firstName", "lastName", "email", "status"],
    }),
    [scopedOverride]
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

              await updateContactFieldAction({
                contactId: recordId,
                field: field as "firstName" | "lastName" | "email" | "status",
                value: String(value ?? ""),
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

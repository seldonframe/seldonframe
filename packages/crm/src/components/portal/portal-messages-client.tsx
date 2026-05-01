"use client";

import { useOptimistic, useRef } from "react";
import {
  PortalMessageComposer,
  type PortalMessageComposerHandle,
} from "./portal-message-composer";
import { PortalMessagesFeed } from "./portal-messages-feed";

export type PortalMessageRow = {
  id: string;
  subject: string | null;
  body: string;
  senderType: string;
  senderName: string | null;
  createdAt: Date;
  readAt: Date | null;
  isPinned: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  pending?: boolean;
};

export function PortalMessagesClient({
  orgSlug,
  rows,
  clientName,
}: {
  orgSlug: string;
  rows: PortalMessageRow[];
  clientName: string | null;
}) {
  const composerFormRef = useRef<HTMLFormElement>(null);
  const composerHandleRef = useRef<PortalMessageComposerHandle>(null);

  const [optimisticRows, addOptimistic] = useOptimistic<PortalMessageRow[], PortalMessageRow>(
    rows,
    (state, optimistic) => [optimistic, ...state]
  );

  const handleReply = (subject: string | null) => {
    const stripped = (subject ?? "").replace(/^(re:\s*)+/i, "").trim();
    const next = stripped ? `Re: ${stripped}` : "Re:";
    composerFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => composerHandleRef.current?.prefillSubject(next), 200);
  };

  return (
    <>
      <PortalMessageComposer
        orgSlug={orgSlug}
        clientName={clientName}
        formRef={composerFormRef}
        handleRef={composerHandleRef}
        addOptimistic={addOptimistic}
      />
      <div className="crm-card space-y-4 p-4">
        <PortalMessagesFeed orgSlug={orgSlug} rows={optimisticRows} onReply={handleReply} />
      </div>
    </>
  );
}

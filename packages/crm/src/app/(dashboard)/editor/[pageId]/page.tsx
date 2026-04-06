"use client";

import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { puckConfig } from "@/lib/puck/config";

type PuckData = Record<string, unknown>;

const emptyPuckData: PuckData = {
  content: [],
  root: { props: {} },
  zones: {},
};

export default function PageEditor() {
  const params = useParams<{ pageId: string }>();
  const router = useRouter();
  const [pageData, setPageData] = useState<PuckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params?.pageId) return;

    fetch(`/api/v1/pages/${params.pageId}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load page");
        }
        return res.json();
      })
      .then((payload: { data?: { puckData?: PuckData } }) => {
        setPageData(payload.data?.puckData ?? emptyPuckData);
      })
      .catch(() => {
        setPageData(emptyPuckData);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [params?.pageId]);

  const handlePublish = async (data: PuckData) => {
    if (!params?.pageId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/v1/pages/${params.pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puckData: data }),
      });

      if (!res.ok) {
        throw new Error("Failed to save page");
      }

      setPageData(data);
      router.refresh();
    } catch {
      // no-op for now; editor keeps state for retry
    } finally {
      setSaving(false);
    }
  };

  if (loading || !pageData) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400">Loading editor...</div>
      </div>
    );
  }

  return (
    <div className="h-screen">
      <Puck config={puckConfig} data={pageData as never} onPublish={handlePublish as never}>
        <div className="fixed right-4 top-4 z-50 rounded-md bg-zinc-900/90 px-3 py-1 text-xs text-zinc-300 ring-1 ring-zinc-700">
          {saving ? "Saving..." : "Editor"}
        </div>
      </Puck>
    </div>
  );
}

"use client";

import { Render } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { puckConfig } from "@/lib/puck/config";

export function PuckPageRenderer({
  data,
  orgId,
}: {
  data: Record<string, unknown>;
  orgId: string;
}) {
  return <Render config={puckConfig} data={data} metadata={{ orgId }} />;
}

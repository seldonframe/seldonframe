// 2026-05-17 — Pipeline settings becomes a real editor (was a 19-line
// read-only display before). Stage rename / reorder / color / win
// probability / add+remove, all persisted via
// saveDefaultPipelineStagesAction on the default pipeline row.

import { getDefaultPipeline } from "@/lib/deals/actions";
import { PipelineEditor } from "./pipeline-editor";

export default async function SettingsPipelinePage() {
  const pipeline = await getDefaultPipeline();

  return (
    <PipelineEditor
      initialStages={pipeline?.stages ?? []}
      pipelineName={pipeline?.name ?? "Default pipeline"}
    />
  );
}

// 2026-05-17 — Custom Fields settings becomes a real editor (was a
// 19-line read-only display before). Operators can add / rename /
// remove fields under contact + deal tabs, persisted into
// soul.suggestedFields via saveSuggestedFieldsAction.

import { getSoul } from "@/lib/soul/server";
import { FieldsEditor } from "./fields-editor";

export default async function SettingsFieldsPage() {
  const soul = await getSoul();

  return (
    <FieldsEditor
      initialContactFields={soul?.suggestedFields.contact ?? []}
      initialDealFields={soul?.suggestedFields.deal ?? []}
    />
  );
}

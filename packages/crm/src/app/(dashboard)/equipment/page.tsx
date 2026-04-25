// /equipment route — re-exports the scaffolded admin page from
// packages/crm/src/blocks/hvac-equipment/admin/equipment.page.tsx.
//
// SLICE 9 PR 1 C8 polish: wires the scaffolded block page into a
// Next route. Data loader is the scaffolder's empty stub for PR 1;
// PR 2 wires real persistence (currently equipment lives in
// contact.customFields.primary_equipment per seed-hvac-arizona.ts).

export { default } from "@/blocks/hvac-equipment/admin/equipment.page";

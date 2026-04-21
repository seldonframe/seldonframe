import type { Archetype } from "./types";
import { speedToLeadArchetype } from "./speed-to-lead";

// Archetype registry. One export per archetype file; adding a new
// archetype is a new file + one import + one entry here. Keeps the
// synthesis engine's discovery simple (look up by id; iterate for
// pickers) without needing a dynamic loader.

export const archetypes: Record<string, Archetype> = {
  "speed-to-lead": speedToLeadArchetype,
};

export function listArchetypes(): Archetype[] {
  return Object.values(archetypes);
}

export function getArchetype(id: string): Archetype | null {
  return archetypes[id] ?? null;
}

export type { Archetype, ArchetypePlaceholder, ArchetypeKnownLimitation } from "./types";

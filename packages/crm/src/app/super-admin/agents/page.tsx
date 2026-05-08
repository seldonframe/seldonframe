import { PlaceholderTab } from "../placeholder-tab";

export default function AgentsTabPage() {
  return (
    <PlaceholderTab
      title="Agents"
      ship="v1.35.3"
      summary="Are agents working? Is the eval gate catching things? Where's the skill-pack work needed?"
      bullets={[
        "Platform-wide eval pass rate (current + 30-day trend)",
        "Critical-fail rate broken down by validator (no_state_change_hallucination, no_pii_leak, etc.)",
        "Agent regen rate — how often the v1.28.6 self-correction architecture fires",
        "Top failing scenarios across all workspaces (drives skill-pack improvement priorities)",
        "Per-archetype health: website-chatbot vs voice-receptionist vs sms-followup-bot",
        "Agent fleet health (red/amber/green count by status)",
      ]}
    />
  );
}

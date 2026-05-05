// v1.7.0 — /auth?atok=... — device-flow approval page.
//
// Rendered when the operator clicks the magic-link in the device-auth
// email. Shows the workspace name + device label + Yes/No buttons.
// On click, the small client component below POSTs to
// /api/v1/auth/approve (or /reject), then renders a success / failure
// state. The polling MCP server's poll resolves on approval.

import { lookupDeviceAuthForApprovalPage } from "@/lib/auth/device-auth";
import { ApprovalActions } from "./actions-client";

export const dynamic = "force-dynamic";

export default async function DeviceAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ atok?: string }>;
}) {
  const sp = await searchParams;
  const atok = (sp.atok ?? "").trim();

  if (!atok) {
    return (
      <Frame title="Authorization link missing">
        <p style={{ color: "#666" }}>
          The link you opened doesn&apos;t include an authorization code.
          Make sure you clicked the most recent email from SeldonFrame.
        </p>
      </Frame>
    );
  }

  const result = await lookupDeviceAuthForApprovalPage(atok);

  if (!result.ok) {
    if (result.error === "expired") {
      return (
        <Frame title="This link has expired">
          <p style={{ color: "#666" }}>
            Authorization links are valid for 5 minutes for your security.
            Run <code>connect_workspace</code> again from your IDE to get
            a fresh link.
          </p>
        </Frame>
      );
    }
    return (
      <Frame title="Authorization link not found">
        <p style={{ color: "#666" }}>
          This link is invalid or has already been used. Run{" "}
          <code>connect_workspace</code> again to get a fresh link.
        </p>
      </Frame>
    );
  }

  if (result.status === "approved" || result.status === "claimed") {
    return (
      <Frame title="Already approved">
        <p style={{ color: "#666" }}>
          You already approved this request. Your device should be
          connected — return to your IDE to continue.
        </p>
        <Detail label="Workspace" value={result.workspace.name} />
        <Detail label="Device" value={result.device_label} />
      </Frame>
    );
  }

  if (result.status === "rejected") {
    return (
      <Frame title="Request rejected">
        <p style={{ color: "#666" }}>
          You rejected this authorization request. The device cannot
          connect to {result.workspace.name}.
        </p>
      </Frame>
    );
  }

  if (result.status === "expired") {
    return (
      <Frame title="This link has expired">
        <p style={{ color: "#666" }}>
          Run <code>connect_workspace</code> again from your IDE to get
          a fresh link.
        </p>
      </Frame>
    );
  }

  return (
    <Frame title={`Authorize a new device for ${result.workspace.name}`}>
      <p style={{ color: "#444", marginBottom: 24 }}>
        A request was made to connect <strong>{result.device_label}</strong>{" "}
        to your <strong>{result.workspace.name}</strong> workspace.
      </p>

      <Detail label="Workspace" value={result.workspace.name} />
      <Detail label="Device" value={result.device_label} />
      <Detail label="Sent to" value={result.email} />

      <p style={{ color: "#666", fontSize: 14, marginTop: 24 }}>
        If you don&apos;t recognize this device, click <strong>No, this wasn&apos;t me</strong>.
      </p>

      <ApprovalActions atok={atok} />
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f5f5f3",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        color: "#111",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e5e5e1",
          borderRadius: 12,
          padding: 32,
          maxWidth: 520,
          width: "100%",
        }}
      >
        <h1
          style={{
            margin: "0 0 16px",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h1>
        {children}
        <p style={{ margin: "32px 0 0", color: "#999", fontSize: 12 }}>
          SeldonFrame ·{" "}
          <a href="https://seldonframe.com" style={{ color: "#666" }}>
            seldonframe.com
          </a>
        </p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid #f0f0ec",
        fontSize: 14,
      }}
    >
      <span style={{ color: "#999" }}>{label}</span>
      <span style={{ color: "#222", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

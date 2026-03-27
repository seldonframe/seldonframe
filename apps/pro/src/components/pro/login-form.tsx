"use client";

import { useState } from "react";
import { loginProAction } from "@/lib/auth/actions";

export function ProLoginForm() {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={async (formData) => {
        try {
          setError(null);
          await loginProAction(formData);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Login failed");
        }
      }}
      style={{
        width: "100%",
        maxWidth: 420,
        border: "1px solid #1e293b",
        borderRadius: 12,
        padding: 20,
        background: "#111827",
        display: "grid",
        gap: 12,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22 }}>Pro Admin Login</h1>
      <input name="email" type="email" placeholder="admin@seldonframe.com" required style={{ height: 40, padding: "0 12px" }} />
      <input name="password" type="password" placeholder="Password" required style={{ height: 40, padding: "0 12px" }} />
      {error ? <p style={{ margin: 0, color: "#f87171", fontSize: 13 }}>{error}</p> : null}
      <button type="submit" style={{ height: 40, borderRadius: 8, border: 0, background: "#22d3ee", fontWeight: 700, cursor: "pointer" }}>
        Sign In
      </button>
    </form>
  );
}

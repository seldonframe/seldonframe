import Link from "next/link";
import { loginCloudAction } from "@/lib/auth/actions";

export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={loginCloudAction} style={{ width: "100%", maxWidth: 420, border: "1px solid #1e293b", borderRadius: 12, background: "#111827", padding: 20, display: "grid", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Cloud Login</h1>
        <input name="email" type="email" placeholder="you@example.com" required style={{ height: 40, padding: "0 10px" }} />
        <input name="password" type="password" placeholder="Password" required style={{ height: 40, padding: "0 10px" }} />
        <button type="submit" style={{ height: 40 }}>Sign In</button>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
          New here? <Link href="/signup">Create a cloud workspace</Link>
        </p>
      </form>
    </main>
  );
}

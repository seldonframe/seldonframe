import Link from "next/link";
import { signupCloudAction } from "@/lib/auth/actions";

export default function SignupPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <form action={signupCloudAction} style={{ width: "100%", maxWidth: 480, border: "1px solid #1e293b", borderRadius: 12, background: "#111827", padding: 20, display: "grid", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Cloud Signup</h1>
        <input name="orgName" placeholder="Organization name" required style={{ height: 40, padding: "0 10px" }} />
        <input name="name" placeholder="Your name" required style={{ height: 40, padding: "0 10px" }} />
        <input name="email" type="email" placeholder="you@example.com" required style={{ height: 40, padding: "0 10px" }} />
        <input name="password" type="password" placeholder="Password (min 8 chars)" required style={{ height: 40, padding: "0 10px" }} />
        <button type="submit" style={{ height: 40 }}>Create Workspace</button>
        <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}

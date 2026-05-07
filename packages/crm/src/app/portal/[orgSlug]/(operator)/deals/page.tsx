// v1.25.0 — /portal/<slug>/deals redirects to /deals (admin shell)
import { redirect } from "next/navigation";

export default async function Redirect() {
  redirect("/deals");
}

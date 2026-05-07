// v1.25.0 — /portal/<slug>/contacts redirects to /contacts (admin shell)
import { redirect } from "next/navigation";

export default async function Redirect() {
  redirect("/contacts");
}

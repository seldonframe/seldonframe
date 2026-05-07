// v1.25.0 — /portal/<slug>/bookings redirects to /bookings (admin shell)
import { redirect } from "next/navigation";

export default async function Redirect() {
  redirect("/bookings");
}

import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

async function subscribeViaKit(email: string) {
  const formId = process.env.KIT_FORM_ID;
  const apiKey = process.env.KIT_API_KEY;

  if (!formId || !apiKey) {
    return false;
  }

  const response = await fetch(`https://api.convertkit.com/v3/forms/${formId}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      email,
    }),
  });

  return response.ok;
}

async function subscribeViaNeon(email: string) {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return false;
  }

  const sql = neon(databaseUrl);

  await sql`
    create table if not exists waitlist_subscribers (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      source text not null default 'web',
      created_at timestamptz not null default now()
    );
  `;

  await sql`
    insert into waitlist_subscribers (email, source)
    values (${email}, 'web')
    on conflict (email) do nothing;
  `;

  return true;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    const subscribed = (await subscribeViaKit(email)) || (await subscribeViaNeon(email));

    if (!subscribed) {
      return NextResponse.json({ ok: false, error: "Subscription provider unavailable" }, { status: 503 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to subscribe" }, { status: 500 });
  }
}

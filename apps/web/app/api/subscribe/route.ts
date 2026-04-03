import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

async function subscribeViaKit(email: string, businessType?: string, referralCode?: string) {
  const formId = process.env.KIT_FORM_ID;
  const apiToken = process.env.KIT_API_KEY;

  if (!formId || !apiToken) {
    return false;
  }

  const response = await fetch(`https://api.kit.com/v4/forms/${formId}/subscribers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      email_address: email,
      fields: {
        business_type: businessType ?? "other",
        referral_code: referralCode ?? "",
      },
    }),
  });

  return response.ok;
}

type WaitlistRow = {
  id: string;
  created_at: string;
};

type WaitlistStats = {
  position: number;
  total: number;
};

const BUSINESS_TYPES = ["coach", "therapist", "trainer", "consultant", "freelancer", "other"] as const;

function normalizeBusinessType(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return BUSINESS_TYPES.includes(normalized as (typeof BUSINESS_TYPES)[number]) ? normalized : "other";
}

async function sendResendConfirmation(email: string, position: number) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return;
  }

  const from = process.env.RESEND_FROM_EMAIL ?? process.env.DEFAULT_FROM_EMAIL ?? "SeldonFrame <support@seldonframe.com>";

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "You're on the SeldonFrame waitlist",
      html: `<p>Hey there, you're #${position} on the waitlist for SeldonFrame — the operating system for your business.</p><p>We'll email you when early access is ready.</p><p>In the meantime, star us on GitHub: <a href=\"https://github.com/seldonframe/crm\">https://github.com/seldonframe/crm</a></p>`,
    }),
  });
}

async function getWaitlistCount() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return 0;
  }

  const sql = neon(databaseUrl);

  await sql`create extension if not exists pgcrypto;`;

  await sql`
    create table if not exists waitlist (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      business_type text,
      referral_code text,
      created_at timestamptz not null default now()
    );
  `;

  const result = (await sql`
    select count(*)::int as total
    from waitlist;
  `) as { total: number }[];

  return result[0]?.total ?? 0;
}

async function subscribeViaNeon(email: string, businessType: string, referralCode?: string): Promise<WaitlistStats | null> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  const sql = neon(databaseUrl);

  await sql`create extension if not exists pgcrypto;`;

  await sql`
    create table if not exists waitlist (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      business_type text,
      referral_code text,
      created_at timestamptz not null default now()
    );
  `;

  const upserted = (await sql`
    insert into waitlist (email, business_type, referral_code)
    values (${email}, ${businessType}, ${referralCode ?? null})
    on conflict (email)
    do update set
      business_type = excluded.business_type,
      referral_code = excluded.referral_code
    returning id, created_at;
  `) as WaitlistRow[];

  const row = upserted[0];

  if (!row) {
    return null;
  }

  const [positionResult] = (await sql`
    select count(*)::int as position
    from waitlist
    where created_at < ${row.created_at}
       or (created_at = ${row.created_at} and id <= ${row.id});
  `) as { position: number }[];

  const [totalResult] = (await sql`
    select count(*)::int as total
    from waitlist;
  `) as { total: number }[];

  return {
    position: positionResult?.position ?? 1,
    total: totalResult?.total ?? 1,
  };
}

export async function GET() {
  try {
    const total = await getWaitlistCount();
    return NextResponse.json({ ok: true, total });
  } catch {
    return NextResponse.json({ ok: false, total: 0 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; businessType?: string; referralCode?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    const businessType = normalizeBusinessType(body.businessType);
    const referralCode = String(body.referralCode ?? "").trim() || undefined;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    await subscribeViaKit(email, businessType, referralCode);

    const subscribed = await subscribeViaNeon(email, businessType, referralCode);

    if (!subscribed) {
      return NextResponse.json({ ok: false, error: "Subscription provider unavailable" }, { status: 503 });
    }

    await sendResendConfirmation(email, subscribed.position);

    return NextResponse.json({ ok: true, position: subscribed.position, total: subscribed.total });
  } catch {
    return NextResponse.json({ ok: false, error: "Failed to subscribe" }, { status: 500 });
  }
}

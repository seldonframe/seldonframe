import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, bookings } from "@/db/schema";

type GoogleAccountRow = {
  userId: string;
  providerAccountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
};

type SyncBookingInput = {
  bookingId: string;
  userId: string | null;
  title: string;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  externalEventId?: string | null;
};

type ReconcileBookingInput = {
  bookingId: string;
  status: string;
  userId: string | null;
  externalEventId: string | null;
};

const tokenRefreshThresholdSeconds = 60;

function isGoogleCalendarEnvConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || "primary";
}

async function getGoogleAccountForUser(userId: string): Promise<GoogleAccountRow | null> {
  const [account] = await db
    .select({
      userId: accounts.userId,
      providerAccountId: accounts.providerAccountId,
      accessToken: accounts.accessToken,
      refreshToken: accounts.refreshToken,
      expiresAt: accounts.expiresAt,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")))
    .limit(1);

  return account ?? null;
}

async function refreshGoogleAccessToken(account: GoogleAccountRow) {
  if (!account.refreshToken || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: account.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token) {
    return null;
  }

  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(0, Number(payload.expires_in ?? 3600));

  await db
    .update(accounts)
    .set({
      accessToken: payload.access_token,
      expiresAt,
    })
    .where(and(eq(accounts.provider, "google"), eq(accounts.providerAccountId, account.providerAccountId)));

  return payload.access_token;
}

async function getGoogleAccessToken(account: GoogleAccountRow) {
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (account.accessToken && account.expiresAt && account.expiresAt > nowSeconds + tokenRefreshThresholdSeconds) {
    return account.accessToken;
  }

  if (account.accessToken && !account.expiresAt) {
    return account.accessToken;
  }

  return refreshGoogleAccessToken(account);
}

async function fetchGoogleCalendarEvent(eventId: string, token: string) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(getCalendarId())}/events/${encodeURIComponent(eventId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as {
    id?: string;
    htmlLink?: string;
    status?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    hangoutLink?: string;
  };
}

async function upsertGoogleCalendarEvent(input: SyncBookingInput, token: string) {
  const payload = {
    summary: input.title,
    description: input.notes ?? "",
    start: {
      dateTime: input.startsAt.toISOString(),
    },
    end: {
      dateTime: input.endsAt.toISOString(),
    },
    conferenceData: {
      createRequest: {
        requestId: `seldon-${input.bookingId}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const calendarId = encodeURIComponent(getCalendarId());
  const eventId = input.externalEventId ? encodeURIComponent(input.externalEventId) : null;
  const method = eventId ? "PATCH" : "POST";
  const url = eventId
    ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}?conferenceDataVersion=1`
    : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return null;
  }

  const event = (await response.json()) as {
    id?: string;
    htmlLink?: string;
    hangoutLink?: string;
  };

  return {
    externalEventId: event.id ?? null,
    meetingUrl: event.hangoutLink ?? event.htmlLink ?? null,
  };
}

export async function syncBookingWithGoogleCalendar(input: SyncBookingInput) {
  if (!isGoogleCalendarEnvConfigured() || !input.userId) {
    return { externalEventId: null as string | null, meetingUrl: null as string | null };
  }

  const account = await getGoogleAccountForUser(input.userId);

  if (!account) {
    return { externalEventId: null as string | null, meetingUrl: null as string | null };
  }

  const token = await getGoogleAccessToken(account);

  if (!token) {
    return { externalEventId: null as string | null, meetingUrl: null as string | null };
  }

  const synced = await upsertGoogleCalendarEvent(input, token);

  if (!synced) {
    return { externalEventId: null as string | null, meetingUrl: null as string | null };
  }

  return synced;
}

export async function deleteGoogleCalendarBookingEvent({ userId, externalEventId }: { userId: string | null; externalEventId: string | null }) {
  if (!isGoogleCalendarEnvConfigured() || !userId || !externalEventId) {
    return;
  }

  const account = await getGoogleAccountForUser(userId);

  if (!account) {
    return;
  }

  const token = await getGoogleAccessToken(account);

  if (!token) {
    return;
  }

  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(getCalendarId())}/events/${encodeURIComponent(externalEventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
}

export async function reconcileGoogleCalendarBookings(rows: ReconcileBookingInput[]) {
  if (!isGoogleCalendarEnvConfigured() || rows.length === 0) {
    return;
  }

  for (const row of rows) {
    if (!row.userId || !row.externalEventId || (row.status !== "scheduled" && row.status !== "pending_payment")) {
      continue;
    }

    const account = await getGoogleAccountForUser(row.userId);

    if (!account) {
      continue;
    }

    const token = await getGoogleAccessToken(account);

    if (!token) {
      continue;
    }

    const event = await fetchGoogleCalendarEvent(row.externalEventId, token);

    if (event === undefined) {
      continue;
    }

    if (event === null || event.status === "cancelled") {
      await db
        .update(bookings)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(bookings.id, row.bookingId));
      continue;
    }

    const startsAt = event.start?.dateTime ? new Date(event.start.dateTime) : null;
    const endsAt = event.end?.dateTime ? new Date(event.end.dateTime) : null;

    if (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      continue;
    }

    await db
      .update(bookings)
      .set({
        startsAt,
        endsAt,
        meetingUrl: event.hangoutLink ?? event.htmlLink ?? null,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, row.bookingId));
  }
}

import Link from "next/link";
import { listBookings } from "@/lib/bookings/actions";
import { listContacts } from "@/lib/contacts/actions";
import { getAvailableBookingProviders } from "@/lib/bookings/providers";
import { CreateBookingForm } from "@/components/bookings/create-booking-form";

export default async function BookingsPage() {
  const [bookings, contacts, providers] = await Promise.all([listBookings(), listContacts(), getAvailableBookingProviders()]);

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">Bookings</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Schedule calls and meetings with integrated providers.</p>
      </div>

      <CreateBookingForm contacts={contacts} providers={providers} />

      <div className="crm-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[hsl(var(--color-surface-raised))] text-left text-label">
            <tr>
              <th className="px-3 py-3">Title</th>
              <th className="px-3 py-3">When</th>
              <th className="px-3 py-3">Provider</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Join</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((row) => (
              <tr key={row.id} className="crm-table-row">
                <td className="px-3 py-3 font-medium text-foreground">{row.title}</td>
                <td className="px-3 py-3 text-[hsl(var(--color-text-secondary))]">
                  {new Date(row.startsAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </td>
                <td className="px-3 py-3">{row.provider}</td>
                <td className="px-3 py-3">
                  <span className="crm-badge">{row.status}</span>
                </td>
                <td className="px-3 py-3">
                  {row.meetingUrl ? (
                    <Link href={row.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                      Open
                    </Link>
                  ) : (
                    <span className="text-[hsl(var(--color-text-muted))]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

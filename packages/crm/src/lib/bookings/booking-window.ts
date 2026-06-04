// lib/bookings/booking-window.ts
//
// Single source of truth for how far ahead the PUBLIC booking page lets a
// customer schedule. Imported by BOTH:
//   • the slot generator   (listPublicBookingSlotsAction in ./actions) — caps
//     which requested dates return available times, and
//   • the date picker       (components/bookings/public-booking-form) — disables
//     calendar dates beyond the horizon.
//
// Keeping them on ONE constant prevents the dead-zone bug where the picker let
// you select a date the generator then refused with "No times available"
// (picker horizon was 60d while the generator capped at 14d). 100 days suits
// healthcare + service businesses where customers routinely book weeks out.
export const PUBLIC_BOOKING_WINDOW_DAYS = 100;

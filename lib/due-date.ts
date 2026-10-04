// A due date (`yyyy-mm-dd`) for people, e.g. "Mon, Oct 5". Read as UTC on purpose: the string is a calendar day, so
// formatting it in the viewer's time zone would show the previous day west of Greenwich, and the server and the
// browser would disagree.
const format = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDueDate(dueDate: string): string {
  return format.format(new Date(`${dueDate}T00:00:00Z`));
}

// Today as a calendar day (`yyyy-mm-dd`) in the server's time zone, which stands in for the user's.
export function localToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA");
}

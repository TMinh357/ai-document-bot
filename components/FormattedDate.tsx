// Renders a timestamp identically on the server and the client.
//
// Formatting with the visitor's implicit locale/timezone made the server and
// client disagree, so this previously deferred all formatting to an effect —
// which left every timestamp in the app blank until hydration finished. Fixing
// the locale and timezone instead makes the output deterministic, so the date
// is present in the server-rendered HTML and needs no effect at all.

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const LOCALE = "en-GB";

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type FormattedDateProps = {
  value: string | Date | null | undefined;
  dateOnly?: boolean;
};

export default function FormattedDate({
  value,
  dateOnly = false,
}: FormattedDateProps) {
  if (!value) return null;

  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) return null;

  return (
    <span>
      {dateOnly ? dateFormatter.format(date) : dateTimeFormatter.format(date)}
    </span>
  );
}

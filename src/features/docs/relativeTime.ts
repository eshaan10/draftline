const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTime(iso: string | Date): string {
  const then = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  const diff = Math.round((then - Date.now()) / 1000);
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs || unit === "second") {
      return fmt.format(Math.round(diff / secs), unit);
    }
  }
  return "just now";
}

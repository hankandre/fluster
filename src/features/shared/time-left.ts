const TICKS_PER_MINUTE = 600_000_000;

function wholeMinutes(ticks: number): number {
  return Math.max(1, Math.ceil(ticks / TICKS_PER_MINUTE));
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

// Short form for the card's meta line: "38 min left", "1 h 4 min left".
export function timeLeftLabel(ticks: number): string {
  const total = wholeMinutes(ticks);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min left`;
  return minutes === 0 ? `${hours} h left` : `${hours} h ${minutes} min left`;
}

// Spoken form for accessible names: "38 minutes left", "1 hour 4 minutes left".
export function timeLeftSpoken(ticks: number): string {
  const total = wholeMinutes(ticks);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${plural(minutes, "minute")} left`;
  return minutes === 0 ? `${plural(hours, "hour")} left` : `${plural(hours, "hour")} ${plural(minutes, "minute")} left`;
}

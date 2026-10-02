function partsInZone(date, timeZone, options) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, ...options })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

function dayKey(date, timeZone) {
  const parts = partsInZone(date, timeZone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function minutesOfDay(date, timeZone) {
  const parts = partsInZone(date, timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function positiveMod(value, length) {
  if (!length) return 0;
  return ((value % length) + length) % length;
}

export function resolveOnCall({
  memberIds = [],
  startDate,
  rotation = 'daily',
  timeZone = 'UTC',
  handoffMinutes = 0,
  now = new Date(),
  overrides = [],
}) {
  const at = new Date(now);
  const override = overrides.find(
    (item) => at >= new Date(item.startsAt) && at < new Date(item.endsAt),
  );
  if (override) return { userId: String(override.userId), source: 'override' };
  if (!memberIds.length || !startDate) return { userId: null, source: 'none' };

  const start = new Date(startDate);
  let dayIndex = Math.round(
    (Date.parse(`${dayKey(at, timeZone)}T00:00:00Z`) - Date.parse(`${dayKey(start, timeZone)}T00:00:00Z`)) /
      86400000,
  );
  if (minutesOfDay(at, timeZone) < handoffMinutes) dayIndex -= 1;
  if (dayIndex < 0) dayIndex = 0;

  const slot = rotation === 'weekly' ? Math.floor(dayIndex / 7) : dayIndex;
  const index = positiveMod(slot, memberIds.length);
  return { userId: String(memberIds[index]), source: 'rotation', slot };
}

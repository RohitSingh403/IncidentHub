export function uptimePercent(successful, total) {
  if (!total) return null;
  return (successful / total) * 100;
}

export function meanMinutes(samples) {
  const diffs = [];
  for (const sample of samples) {
    if (!sample.start || !sample.end) continue;
    const ms = new Date(sample.end).getTime() - new Date(sample.start).getTime();
    if (Number.isFinite(ms) && ms >= 0) diffs.push(ms / 60000);
  }
  if (!diffs.length) return null;
  return diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
}

export function percentile(values, p) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
}

export function windowCovers(windows, at) {
  const time = new Date(at).getTime();
  return windows.some((window) => {
    const start = new Date(window.startsAt).getTime();
    const end = new Date(window.endsAt).getTime();
    return start <= time && time < end;
  });
}

export function errorBudget({ successful, total, targetPercent }) {
  if (!total || targetPercent == null) return null;
  const actual = successful / total;
  const allowedFailure = 1 - targetPercent / 100;
  const actualFailure = 1 - actual;
  const remaining = allowedFailure <= 0
    ? (actualFailure <= 0 ? 100 : 0)
    : Math.max(0, Math.min(100, ((allowedFailure - actualFailure) / allowedFailure) * 100));
  return {
    actualPercent: actual * 100,
    remainingPercent: remaining,
  };
}

export function dailyTrend(timestamps, days, now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const buckets = [];
  for (let index = 0; index < days; index += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    buckets.push({ date: day.toISOString().slice(0, 10), count: 0 });
  }
  const lookup = new Map(buckets.map((bucket, index) => [bucket.date, index]));
  for (const timestamp of timestamps) {
    const key = new Date(timestamp).toISOString().slice(0, 10);
    if (lookup.has(key)) buckets[lookup.get(key)].count += 1;
  }
  return buckets;
}

export function neighborIds(serviceId, services) {
  const id = String(serviceId);
  const neighbors = new Set();
  for (const service of services) {
    const current = String(service._id || service.id);
    const dependencies = (service.dependsOn || []).map(String);
    if (current === id) dependencies.forEach((dependency) => neighbors.add(dependency));
    if (dependencies.includes(id)) neighbors.add(current);
  }
  neighbors.delete(id);
  return neighbors;
}

export function correlateIncidents(incident, incidents, services) {
  const neighbors = neighborIds(incident.serviceId, services);
  const detected = new Date(incident.detectedAt).getTime();
  return incidents.flatMap((other) => {
    if (String(other._id || other.id) === String(incident._id || incident.id)) return [];
    const dependency = neighbors.has(String(other.serviceId));
    const overlap = Math.abs(new Date(other.detectedAt).getTime() - detected) <= 10 * 60 * 1000;
    if (!dependency && !overlap) return [];
    return [{
      id: String(other._id || other.id),
      number: other.number,
      title: other.title,
      status: other.status,
      reason: dependency ? 'dependency' : 'overlap',
    }];
  });
}

export function buildCorrelationGroups(incidents, services) {
  const parent = new Map(incidents.map((incident) => [String(incident._id || incident.id), String(incident._id || incident.id)]));
  function find(id) {
    let current = id;
    while (parent.get(current) !== current) {
      parent.set(current, parent.get(parent.get(current)));
      current = parent.get(current);
    }
    return current;
  }
  function unite(left, right) {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent.set(a, b);
  }
  for (const incident of incidents) {
    const related = correlateIncidents(incident, incidents, services);
    for (const item of related) unite(String(incident._id || incident.id), item.id);
  }
  const groups = new Map();
  for (const incident of incidents) {
    const root = find(String(incident._id || incident.id));
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(incident);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function factualBrief(incident, events) {
  const timeline = (events || []).map((event) => event.message).filter(Boolean);
  return {
    source: 'timeline',
    summary: `${incident.title} (${incident.severity}). Status: ${incident.status}.`,
    timeline: timeline.join('\n'),
  };
}

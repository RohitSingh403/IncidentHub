export const PLAN_LIMITS = {
  free: {
    'monitoring.services.max': 3,
    'teams.max': 1,
    'members.max': 3,
    'statusPages.max': 1,
  },
};

export function limitFor(plan, key) {
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  return limits[key];
}

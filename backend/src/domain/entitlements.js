export const PLAN_LIMITS = {
  free: {
    'monitoring.services.max': 3,
    'teams.max': 1,
    'members.max': 3,
    'statusPages.max': 1,
    'apiKeys.max': 1,
    'webhooks.max': 1,
  },
  pro: {
    'monitoring.services.max': 25,
    'teams.max': 10,
    'members.max': 50,
    'statusPages.max': 5,
    'apiKeys.max': 10,
    'webhooks.max': 10,
  },
};

export function limitFor(plan, key) {
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  return limits[key];
}

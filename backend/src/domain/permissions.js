export const ROLES = ['owner', 'admin', 'incident_manager', 'engineer', 'viewer'];

const ROLE_PERMISSIONS = {
  owner: [
    'org:read',
    'org:update',
    'member:read',
    'member:manage',
    'team:read',
    'team:write',
    'service:read',
    'service:write',
    'incident:read',
    'incident:create',
    'incident:update',
    'incident:transition',
    'incident:resolve',
    'incident:comment',
    'notification:read',
    'postmortem:read',
    'postmortem:write',
  ],
  admin: [
    'org:read',
    'member:read',
    'member:manage',
    'team:read',
    'team:write',
    'service:read',
    'service:write',
    'incident:read',
    'incident:create',
    'incident:update',
    'incident:transition',
    'incident:resolve',
    'incident:comment',
    'notification:read',
    'postmortem:read',
    'postmortem:write',
  ],
  incident_manager: [
    'org:read',
    'member:read',
    'team:read',
    'service:read',
    'incident:read',
    'incident:create',
    'incident:update',
    'incident:transition',
    'incident:resolve',
    'incident:comment',
    'notification:read',
    'postmortem:read',
    'postmortem:write',
  ],
  engineer: [
    'org:read',
    'member:read',
    'team:read',
    'service:read',
    'incident:read',
    'incident:update',
    'incident:transition',
    'incident:resolve',
    'incident:comment',
    'notification:read',
    'postmortem:read',
    'postmortem:write',
  ],
  viewer: [
    'org:read',
    'member:read',
    'team:read',
    'service:read',
    'incident:read',
    'notification:read',
    'postmortem:read',
  ],
};

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] ? [...ROLE_PERMISSIONS[role]] : [];
}

export function hasPermission(role, permission) {
  return permissionsFor(role).includes(permission);
}

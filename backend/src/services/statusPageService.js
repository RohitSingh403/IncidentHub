import { AppError } from '../utils/AppError.js';
import { slugify } from '../utils/slug.js';
import { limitFor } from '../domain/entitlements.js';
import { canChangePublicStatus, componentAppearance, pageSummary } from '../domain/statusPublic.js';
import { log } from '../utils/logger.js';
import {
  Organization,
  Service,
  StatusComponent,
  StatusIncident,
  StatusPage,
  StatusUpdate,
} from '../models/index.js';

const LABELS = {
  operational: 'Operational',
  degraded: 'Degraded',
  outage: 'Outage',
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  unknown: 'Unknown',
  resolved: 'Resolved',
};

async function uniqueSlug(base) {
  const root = slugify(base).slice(0, 40);
  let slug = root;
  let suffix = 1;
  while (await StatusPage.findOne({ slug })) {
    suffix += 1;
    slug = `${root}-${suffix}`;
  }
  return slug;
}

async function pageInOrg(organizationId, pageId) {
  const page = await StatusPage.findById(pageId);
  if (!page) throw new AppError('STATUS_PAGE_NOT_FOUND', 'Status page does not exist', 404);
  if (String(page.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that status page', 403);
  }
  return page;
}

function durationMinutes(item) {
  if (!item.resolvedAt) return null;
  return Math.max(0, Math.round((new Date(item.resolvedAt) - new Date(item.startedAt)) / 60000));
}

async function buildPage(page, { includePrivate = false } = {}) {
  const [components, incidents] = await Promise.all([
    StatusComponent.find({ statusPageId: page._id }).sort({ name: 1 }),
    StatusIncident.find({ statusPageId: page._id }).sort({ startedAt: -1 }).limit(40),
  ]);
  const services = await Service.find({ _id: { $in: components.map((component) => component.serviceId) } });
  const serviceById = new Map(services.map((service) => [String(service._id), service]));
  const updates = await StatusUpdate.find({
    statusIncidentId: { $in: incidents.map((incident) => incident._id) },
  }).sort({ createdAt: 1 });
  const updatesByIncident = new Map();
  for (const update of updates) {
    const key = String(update.statusIncidentId);
    const list = updatesByIncident.get(key) || [];
    list.push({
      status: update.publicStatus,
      label: LABELS[update.publicStatus],
      message: update.message,
      createdAt: update.createdAt,
    });
    updatesByIncident.set(key, list);
  }

  const activeByService = new Map();
  for (const incident of incidents) {
    if (incident.publicStatus === 'resolved') continue;
    activeByService.set(String(incident.serviceId), incident.publicStatus);
  }

  const presentedComponents = components.map((component) => {
    const service = serviceById.get(String(component.serviceId));
    const status = componentAppearance(service?.status, activeByService.get(String(component.serviceId)));
    return {
      id: String(component._id),
      serviceId: includePrivate ? String(component.serviceId) : undefined,
      name: component.name,
      status,
      label: LABELS[status] || status,
    };
  });

  const presentIncident = (incident) => ({
    id: String(incident._id),
    incidentId: includePrivate && incident.incidentId ? String(incident.incidentId) : undefined,
    title: incident.title,
    serviceName: components.find((component) => String(component.serviceId) === String(incident.serviceId))?.name || incident.title,
    status: incident.publicStatus,
    label: LABELS[incident.publicStatus],
    startedAt: incident.startedAt,
    resolvedAt: incident.resolvedAt,
    durationMinutes: durationMinutes(incident),
    updates: updatesByIncident.get(String(incident._id)) || [],
  });

  const active = incidents.filter((incident) => incident.publicStatus !== 'resolved').map(presentIncident);
  const history = incidents.filter((incident) => incident.publicStatus === 'resolved').map(presentIncident);

  return {
    id: includePrivate ? String(page._id) : undefined,
    name: page.name,
    slug: page.slug,
    description: page.description,
    summary: pageSummary(presentedComponents.map((component) => component.status)),
    components: presentedComponents.map((component) => {
      if (includePrivate) return component;
      const { serviceId, ...rest } = component;
      return rest;
    }),
    active,
    history,
  };
}

export async function listStatusPages(organizationId) {
  const pages = await StatusPage.find({ organizationId }).sort({ createdAt: 1 });
  const presented = [];
  for (const page of pages) presented.push(await buildPage(page, { includePrivate: true }));
  return presented;
}

export async function createStatusPage(organizationId, input) {
  const organization = await Organization.findById(organizationId);
  const max = limitFor(organization.plan, 'statusPages.max');
  const count = await StatusPage.countDocuments({ organizationId });
  if (Number.isFinite(max) && count >= max) {
    throw new AppError('QUOTA_EXCEEDED', `The ${organization.plan} plan includes ${max} status page`, 403);
  }
  const page = await StatusPage.create({
    organizationId,
    name: input.name.trim(),
    slug: await uniqueSlug(input.slug || input.name),
    description: input.description || '',
  });
  return buildPage(page, { includePrivate: true });
}

export async function addComponent(organizationId, pageId, serviceId) {
  const page = await pageInOrg(organizationId, pageId);
  const service = await Service.findById(serviceId);
  if (!service) throw new AppError('SERVICE_NOT_FOUND', 'Service does not exist', 404);
  if (String(service.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that service', 403);
  }
  const existing = await StatusComponent.findOne({ statusPageId: page._id, serviceId });
  if (!existing) {
    await StatusComponent.create({
      organizationId,
      statusPageId: page._id,
      serviceId,
      name: service.name,
    });
  }
  return buildPage(page, { includePrivate: true });
}

export async function postPublicUpdate(organizationId, statusIncidentId, input) {
  const incident = await StatusIncident.findById(statusIncidentId);
  if (!incident) throw new AppError('STATUS_INCIDENT_NOT_FOUND', 'Public incident does not exist', 404);
  if (String(incident.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'You do not have access to that public incident', 403);
  }
  if (!canChangePublicStatus(incident.publicStatus, input.publicStatus)) {
    throw new AppError(
      'INVALID_TRANSITION',
      `Cannot move public status from ${incident.publicStatus} to ${input.publicStatus}`,
      409,
    );
  }
  incident.publicStatus = input.publicStatus;
  if (input.publicStatus === 'resolved') incident.resolvedAt = new Date();
  await incident.save();
  await StatusUpdate.create({
    organizationId,
    statusIncidentId: incident._id,
    publicStatus: input.publicStatus,
    message: input.message.trim(),
  });
  const page = await StatusPage.findById(incident.statusPageId);
  return buildPage(page, { includePrivate: true });
}

export async function getPublicStatus(slug) {
  const page = await StatusPage.findOne({ slug: slug.toLowerCase(), published: true });
  if (!page) throw new AppError('STATUS_PAGE_NOT_FOUND', 'Status page does not exist', 404);
  return buildPage(page, { includePrivate: false });
}

function customerMessage(service, action) {
  if (action === 'resolved') return `${service.name} has recovered.`;
  if (action === 'degraded') return `${service.name} is slower than expected. We are investigating.`;
  return `${service.name} is unavailable. We are investigating.`;
}

export async function syncPublicIncident(service, incident, action) {
  try {
    const components = await StatusComponent.find({
      organizationId: service.organizationId,
      serviceId: service._id,
    });
    if (!components.length) return;

    for (const component of components) {
      const page = await StatusPage.findById(component.statusPageId);
      if (!page?.published) continue;
      const existing = await StatusIncident.findOne({ statusPageId: page._id, incidentId: incident._id });

      if (action === 'resolved') {
        if (!existing || existing.publicStatus === 'resolved') continue;
        existing.publicStatus = 'resolved';
        existing.resolvedAt = new Date();
        await existing.save();
        await StatusUpdate.create({
          organizationId: service.organizationId,
          statusIncidentId: existing._id,
          publicStatus: 'resolved',
          message: customerMessage(service, 'resolved'),
        });
        continue;
      }

      if (existing) continue;
      const created = await StatusIncident.create({
        organizationId: service.organizationId,
        statusPageId: page._id,
        serviceId: service._id,
        incidentId: incident._id,
        title: service.name,
        publicStatus: 'investigating',
        startedAt: incident.detectedAt || new Date(),
      });
      await StatusUpdate.create({
        organizationId: service.organizationId,
        statusIncidentId: created._id,
        publicStatus: 'investigating',
        message: customerMessage(service, action === 'degraded' ? 'degraded' : 'down'),
      });
    }
  } catch (error) {
    log('error', {
      message: 'Failed to publish status incident',
      incidentId: String(incident._id),
      error: error.message,
    });
  }
}

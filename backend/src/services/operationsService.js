import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';
import { limitFor } from '../domain/entitlements.js';
import { errorBudget, factualBrief, windowCovers, correlateIncidents, buildCorrelationGroups } from '../domain/operations.js';
import { OPEN_STATUSES } from '../domain/incidentTransitions.js';
import { incidentNumber } from '../utils/presenters.js';
import { publish } from '../live/hub.js';
import { getEnv } from '../config/env.js';
import { log } from '../utils/logger.js';
import {
  ApiKey,
  AuditEvent,
  HealthCheck,
  Incident,
  IncidentEvent,
  MaintenanceWindow,
  Membership,
  Organization,
  Runbook,
  Service,
  Slo,
  User,
  WebhookDelivery,
  WebhookEndpoint,
} from '../models/index.js';

const WEBHOOK_EVENTS = ['incident.opened', 'incident.updated', 'incident.resolved'];

function hashKey(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function owned(Model, organizationId, id, missingCode) {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(missingCode, 'Record does not exist', 404);
  }
  const doc = await Model.findById(id);
  if (!doc) throw new AppError(missingCode, 'Record does not exist', 404);
  if (String(doc.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'That record belongs to another organization', 403);
  }
  return doc;
}

async function serviceInOrg(organizationId, serviceId) {
  return owned(Service, organizationId, serviceId, 'SERVICE_NOT_FOUND');
}

export async function recordAudit({ organizationId, actorId, action, targetType, targetId, message }) {
  const event = await AuditEvent.create({
    organizationId,
    actorId: actorId || null,
    action,
    targetType: targetType || '',
    targetId: targetId || null,
    message,
  });
  publish(organizationId, { type: 'activity', action, message });
  return event;
}

export async function listAudit(organizationId) {
  const events = await AuditEvent.find({ organizationId }).sort({ createdAt: -1 }).limit(100);
  const actors = await User.find({ _id: { $in: events.map((event) => event.actorId).filter(Boolean) } }).select('name');
  const names = new Map(actors.map((actor) => [String(actor._id), actor.name]));
  return events.map((event) => ({
    id: String(event._id),
    action: event.action,
    message: event.message,
    actorName: event.actorId ? names.get(String(event.actorId)) || 'User' : 'System',
    createdAt: event.createdAt,
  }));
}

export async function maintenanceCovers(organizationId, serviceId, at = new Date()) {
  const windows = await MaintenanceWindow.find({ organizationId, serviceId });
  return windowCovers(windows, at);
}

export async function fanoutIncident(incident, service, kind) {
  try {
    const event = kind === 'opened' ? 'incident.opened' : kind === 'resolved' ? 'incident.resolved' : 'incident.updated';
    const message = `${incidentNumber(incident.number)} ${event.split('.')[1]}`;
    await recordAudit({
      organizationId: incident.organizationId,
      action: event,
      targetType: 'incident',
      targetId: incident._id,
      message: `${message}: ${incident.title}`,
    });
    publish(incident.organizationId, { type: 'incident', incidentId: String(incident._id), event });
    const endpoints = await WebhookEndpoint.find({ organizationId: incident.organizationId, events: event });
    if (endpoints.length) {
      const payload = {
        event,
        incident: {
          id: String(incident._id),
          number: incidentNumber(incident.number),
          title: incident.title,
          status: incident.status,
          severity: incident.severity,
          service: service ? { id: String(service._id), name: service.name } : null,
        },
      };
      await WebhookDelivery.insertMany(endpoints.map((endpoint) => ({
        organizationId: incident.organizationId,
        endpointId: endpoint._id,
        event,
        payload,
      })));
    }
    if (kind === 'opened') await noteCorrelation(incident);
    if (kind === 'opened' || kind === 'resolved') {
      await notifySlackAndGithub(incident, service, message);
    }
  } catch (error) {
    log('error', { message: 'Incident fan-out failed', error: error.message });
  }
}

async function noteCorrelation(incident) {
  const [services, openIncidents] = await Promise.all([
    Service.find({ organizationId: incident.organizationId }).select('dependsOn'),
    Incident.find({ organizationId: incident.organizationId, status: { $in: OPEN_STATUSES } }),
  ]);
  const related = correlateIncidents(incident, openIncidents, services);
  if (!related.length) return;
  const summary = related
    .map((item) => `${incidentNumber(item.number)} (${item.reason})`)
    .join(', ');
  await IncidentEvent.create({
    organizationId: incident.organizationId,
    incidentId: incident._id,
    type: 'incident.correlated',
    message: `Correlated with ${summary}`,
    metadata: { related },
  });
}

export async function correlationGroupsFor(organizationId) {
  const [services, openIncidents] = await Promise.all([
    Service.find({ organizationId }).select('dependsOn'),
    Incident.find({ organizationId, status: { $in: OPEN_STATUSES } }).sort({ detectedAt: -1 }),
  ]);
  return buildCorrelationGroups(openIncidents, services).map((group) => ({
    incidents: group.map((item) => ({
      id: String(item._id),
      number: incidentNumber(item.number),
      title: item.title,
      status: item.status,
    })),
  }));
}

export async function dependencyGraph(organizationId) {
  const [services, openIncidents] = await Promise.all([
    Service.find({ organizationId }).sort({ name: 1 }),
    Incident.find({ organizationId, status: { $in: OPEN_STATUSES } }).select('serviceId number title'),
  ]);
  const openByService = new Map();
  for (const incident of openIncidents) {
    if (!openByService.has(String(incident.serviceId))) {
      openByService.set(String(incident.serviceId), {
        id: String(incident._id),
        number: incidentNumber(incident.number),
        title: incident.title,
      });
    }
  }
  return {
    nodes: services.map((service) => ({
      id: String(service._id),
      name: service.name,
      status: service.status,
      incident: openByService.get(String(service._id)) || null,
    })),
    edges: services.flatMap((service) => (service.dependsOn || []).map((dependency) => ({
      from: String(service._id),
      to: String(dependency),
    }))),
  };
}

async function notifySlackAndGithub(incident, service, message) {
  const organization = await Organization.findById(incident.organizationId).select('+slackWebhookUrl +githubToken');
  if (!organization) return;
  const text = `${message}: ${incident.title}${service ? ` (${service.name})` : ''}`;
  if (organization.slackWebhookUrl) {
    await fetch(organization.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    }).catch((error) => log('error', { message: 'Slack delivery failed', error: error.message }));
  }
  if (organization.githubRepo && organization.githubToken && message.endsWith('opened')) {
    await fetch(`https://api.github.com/repos/${organization.githubRepo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${organization.githubToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'IncidentHub',
      },
      body: JSON.stringify({ title: text, body: incident.description || incident.title }),
      signal: AbortSignal.timeout(5000),
    }).catch((error) => log('error', { message: 'GitHub delivery failed', error: error.message }));
  }
}

export async function deliverPendingWebhooks() {
  const pending = await WebhookDelivery.find({ status: 'pending', attempts: { $lt: 3 } }).limit(10);
  for (const delivery of pending) {
    const endpoint = await WebhookEndpoint.findById(delivery.endpointId);
    delivery.attempts += 1;
    if (!endpoint) {
      delivery.status = 'failed';
      delivery.error = 'Endpoint removed';
      await delivery.save();
      continue;
    }
    const body = JSON.stringify(delivery.payload);
    const signature = crypto.createHmac('sha256', endpoint.secret).update(body).digest('hex');
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-IncidentHub-Event': delivery.event,
          'X-IncidentHub-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      delivery.status = response.ok ? 'delivered' : 'pending';
      delivery.error = response.ok ? null : `HTTP ${response.status}`;
      if (!response.ok && delivery.attempts >= 3) delivery.status = 'failed';
    } catch (error) {
      delivery.error = error.message;
      if (delivery.attempts >= 3) delivery.status = 'failed';
    }
    await delivery.save();
  }
}

async function budgetFor(slo) {
  const since = new Date(Date.now() - slo.windowDays * 24 * 60 * 60 * 1000);
  const [row] = await HealthCheck.aggregate([
    { $match: { organizationId: slo.organizationId, serviceId: slo.serviceId, checkedAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: 1 }, successful: { $sum: { $cond: ['$success', 1, 0] } } } },
  ]);
  const budget = errorBudget({
    successful: row?.successful || 0,
    total: row?.total || 0,
    targetPercent: slo.targetPercent,
  });
  return budget;
}

export async function getOperations(organizationId) {
  const [services, windows, slos, runbooks, keys, hooks, organization] = await Promise.all([
    Service.find({ organizationId }).sort({ name: 1 }),
    MaintenanceWindow.find({ organizationId }).sort({ startsAt: -1 }).limit(20),
    Slo.find({ organizationId }),
    Runbook.find({ organizationId }),
    ApiKey.find({ organizationId }).sort({ createdAt: -1 }),
    WebhookEndpoint.find({ organizationId }).sort({ createdAt: -1 }),
    Organization.findById(organizationId).select('+slackWebhookUrl +githubToken'),
  ]);
  const names = new Map(services.map((service) => [String(service._id), service.name]));
  const env = getEnv();
  return {
    services: services.map((service) => ({
      id: String(service._id),
      name: service.name,
      dependsOn: (service.dependsOn || []).map((id) => ({ id: String(id), name: names.get(String(id)) || 'Service' })),
    })),
    maintenance: windows.map((window) => ({
      id: String(window._id),
      serviceId: String(window.serviceId),
      serviceName: names.get(String(window.serviceId)) || 'Service',
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      reason: window.reason,
      active: windowCovers([window], new Date()),
    })),
    slos: await Promise.all(slos.map(async (slo) => ({
      serviceId: String(slo.serviceId),
      serviceName: names.get(String(slo.serviceId)) || 'Service',
      targetPercent: slo.targetPercent,
      windowDays: slo.windowDays,
      ...(await budgetFor(slo)),
    }))),
    runbooks: runbooks.map((runbook) => ({
      serviceId: String(runbook.serviceId),
      serviceName: names.get(String(runbook.serviceId)) || 'Service',
      title: runbook.title,
      body: runbook.body,
    })),
    apiKeys: keys.map((key) => ({
      id: String(key._id),
      name: key.name,
      prefix: key.prefix,
      lastUsedAt: key.lastUsedAt,
      revokedAt: key.revokedAt,
    })),
    webhooks: hooks.map((hook) => ({
      id: String(hook._id),
      url: hook.url,
      events: hook.events,
    })),
    integrations: {
      email: env.smtpUrl ? 'configured' : 'not_configured',
      slack: Boolean(organization?.slackWebhookUrl),
      github: Boolean(organization?.githubRepo && organization?.githubToken),
      githubRepo: organization?.githubRepo || '',
      billing: env.stripeSecretKey && env.stripePricePro ? 'configured' : 'not_configured',
      ai: env.aiApiKey ? 'configured' : 'not_configured',
      plan: organization?.plan || 'free',
    },
  };
}

export async function createMaintenance(organizationId, actorId, input) {
  await serviceInOrg(organizationId, input.serviceId);
  if (new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new AppError('INVALID_WINDOW', 'Maintenance must end after it starts', 422);
  }
  const window = await MaintenanceWindow.create({
    organizationId,
    serviceId: input.serviceId,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    reason: input.reason || '',
  });
  await recordAudit({
    organizationId,
    actorId,
    action: 'maintenance.created',
    targetType: 'service',
    targetId: input.serviceId,
    message: 'Maintenance window scheduled',
  });
  return { id: String(window._id) };
}

export async function deleteMaintenance(organizationId, actorId, id) {
  const window = await owned(MaintenanceWindow, organizationId, id, 'WINDOW_NOT_FOUND');
  await window.deleteOne();
  await recordAudit({
    organizationId,
    actorId,
    action: 'maintenance.deleted',
    targetType: 'service',
    targetId: window.serviceId,
    message: 'Maintenance window removed',
  });
}

export async function saveSlo(organizationId, actorId, input) {
  await serviceInOrg(organizationId, input.serviceId);
  const slo = await Slo.findOneAndUpdate(
    { organizationId, serviceId: input.serviceId },
    { targetPercent: input.targetPercent, windowDays: input.windowDays },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await recordAudit({
    organizationId,
    actorId,
    action: 'slo.saved',
    targetType: 'service',
    targetId: input.serviceId,
    message: `SLO set to ${slo.targetPercent}% over ${slo.windowDays} days`,
  });
  return { serviceId: String(slo.serviceId), targetPercent: slo.targetPercent, windowDays: slo.windowDays };
}

export async function saveRunbook(organizationId, actorId, input) {
  await serviceInOrg(organizationId, input.serviceId);
  const runbook = await Runbook.findOneAndUpdate(
    { organizationId, serviceId: input.serviceId },
    { title: input.title, body: input.body || '' },
    { upsert: true, new: true },
  );
  await recordAudit({
    organizationId,
    actorId,
    action: 'runbook.saved',
    targetType: 'service',
    targetId: input.serviceId,
    message: `Runbook saved: ${runbook.title}`,
  });
  return { serviceId: String(runbook.serviceId), title: runbook.title, body: runbook.body };
}

export async function saveDependencies(organizationId, actorId, input) {
  const service = await serviceInOrg(organizationId, input.serviceId);
  const ids = [...new Set(input.dependsOn.map(String))].filter((id) => id !== String(service._id));
  const found = await Service.find({ organizationId, _id: { $in: ids } });
  if (found.length !== ids.length) {
    throw new AppError('SERVICE_NOT_FOUND', 'A dependency is not in this organization', 404);
  }
  service.dependsOn = ids;
  await service.save();
  await recordAudit({
    organizationId,
    actorId,
    action: 'dependency.saved',
    targetType: 'service',
    targetId: service._id,
    message: `${service.name} dependencies updated`,
  });
  return { serviceId: String(service._id), dependsOn: ids };
}

async function assertQuota(organizationId, key, used) {
  const organization = await Organization.findById(organizationId);
  const max = limitFor(organization.plan, key);
  if (used >= max) throw new AppError('QUOTA_EXCEEDED', `The ${organization.plan} plan includes ${max}`, 403);
}

export async function createApiKey(organizationId, actorId, name) {
  const active = await ApiKey.countDocuments({ organizationId, revokedAt: null });
  await assertQuota(organizationId, 'apiKeys.max', active);
  const secret = `ih_${crypto.randomBytes(24).toString('hex')}`;
  const key = await ApiKey.create({
    organizationId,
    name,
    prefix: secret.slice(0, 10),
    hash: hashKey(secret),
    createdBy: actorId,
  });
  await recordAudit({
    organizationId,
    actorId,
    action: 'apikey.created',
    targetType: 'apiKey',
    targetId: key._id,
    message: `API key created: ${name}`,
  });
  return { id: String(key._id), name: key.name, prefix: key.prefix, key: secret };
}

export async function revokeApiKey(organizationId, actorId, id) {
  const key = await owned(ApiKey, organizationId, id, 'KEY_NOT_FOUND');
  key.revokedAt = new Date();
  await key.save();
  await recordAudit({
    organizationId,
    actorId,
    action: 'apikey.revoked',
    targetType: 'apiKey',
    targetId: key._id,
    message: `API key revoked: ${key.name}`,
  });
}

export async function findApiKey(token) {
  const key = await ApiKey.findOne({ hash: hashKey(token), revokedAt: null });
  if (!key) return null;
  key.lastUsedAt = new Date();
  await key.save();
  const membership = await Membership.findOne({ organizationId: key.organizationId, userId: key.createdBy });
  const user = membership ? await User.findById(key.createdBy) : null;
  if (!membership || !user) return null;
  return { key, membership, user };
}

export async function createWebhook(organizationId, actorId, input) {
  const count = await WebhookEndpoint.countDocuments({ organizationId });
  await assertQuota(organizationId, 'webhooks.max', count);
  let url;
  try {
    url = new URL(input.url);
  } catch {
    throw new AppError('INVALID_URL', 'Webhook URL is invalid', 422);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError('INVALID_URL', 'Webhook URL is invalid', 422);
  }
  const events = input.events?.length ? input.events : WEBHOOK_EVENTS;
  const secret = crypto.randomBytes(24).toString('hex');
  const hook = await WebhookEndpoint.create({ organizationId, url: url.toString(), secret, events });
  await recordAudit({
    organizationId,
    actorId,
    action: 'webhook.created',
    targetType: 'webhook',
    targetId: hook._id,
    message: 'Webhook endpoint added',
  });
  return { id: String(hook._id), url: hook.url, events: hook.events, secret };
}

export async function deleteWebhook(organizationId, actorId, id) {
  const hook = await owned(WebhookEndpoint, organizationId, id, 'WEBHOOK_NOT_FOUND');
  await hook.deleteOne();
  await recordAudit({
    organizationId,
    actorId,
    action: 'webhook.deleted',
    targetType: 'webhook',
    targetId: hook._id,
    message: 'Webhook endpoint removed',
  });
}

export async function saveIntegrations(organizationId, actorId, input) {
  const organization = await Organization.findById(organizationId).select('+slackWebhookUrl +githubToken');
  if (input.slackWebhookUrl) organization.slackWebhookUrl = input.slackWebhookUrl;
  if (input.githubRepo !== undefined) organization.githubRepo = input.githubRepo || '';
  if (input.githubToken) organization.githubToken = input.githubToken;
  if (organization.githubRepo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(organization.githubRepo)) {
    throw new AppError('INVALID_REPO', 'Use owner/repository', 422);
  }
  await organization.save();
  await recordAudit({
    organizationId,
    actorId,
    action: 'integrations.saved',
    targetType: 'organization',
    targetId: organization._id,
    message: 'Integration settings saved',
  });
  return {
    slack: Boolean(organization.slackWebhookUrl),
    github: Boolean(organization.githubRepo && organization.githubToken),
    githubRepo: organization.githubRepo,
  };
}

export async function startCheckout(organizationId, plan = 'pro') {
  const env = getEnv();
  const selected = plan === 'business' ? 'business' : 'pro';
  const price = selected === 'business' ? env.stripePriceBusiness : env.stripePricePro;
  if (!env.stripeSecretKey || !price) {
    throw new AppError('BILLING_UNAVAILABLE', 'Billing is not connected on this server', 503);
  }
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(env.stripeSecretKey);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: `${env.clientOrigin}/operations?billing=success`,
    cancel_url: `${env.clientOrigin}/operations?billing=cancel`,
    metadata: { organizationId: String(organizationId), plan: selected },
  });
  return { url: session.url };
}

export async function applyBillingEvent(rawBody, signature) {
  const env = getEnv();
  if (!env.stripeSecretKey || !env.stripeWebhookSecret) {
    throw new AppError('BILLING_UNAVAILABLE', 'Billing webhook is not connected', 503);
  }
  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(env.stripeSecretKey);
  const event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  if (event.type === 'checkout.session.completed') {
    const organizationId = event.data.object.metadata?.organizationId;
    const plan = event.data.object.metadata?.plan === 'business' ? 'business' : 'pro';
    if (organizationId) {
      await Organization.updateOne({ _id: organizationId }, { $set: { plan } });
    }
  }
  return { received: true };
}

export async function incidentBrief(organizationId, incidentId) {
  const incident = await Incident.findById(incidentId);
  if (!incident) throw new AppError('INCIDENT_NOT_FOUND', 'Incident does not exist', 404);
  if (String(incident.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'That incident belongs to another organization', 403);
  }
  const events = await IncidentEvent.find({ incidentId: incident._id }).sort({ createdAt: 1 });
  const brief = factualBrief(incident, events);
  const env = getEnv();
  if (!env.aiApiKey) return brief;
  try {
    const response = await fetch(`${env.aiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.aiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: env.aiModel,
        messages: [{
          role: 'user',
          content: `Summarize this incident in two sentences.\n${brief.summary}\n${brief.timeline}`,
        }],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return brief;
    const payload = await response.json();
    const summary = payload.choices?.[0]?.message?.content;
    if (!summary) return brief;
    return { ...brief, source: 'model', summary };
  } catch (error) {
    log('error', { message: 'Model summary failed', error: error.message });
    return brief;
  }
}

export async function relatedIncidents(organizationId, incidentId) {
  const incident = await Incident.findById(incidentId);
  if (!incident) throw new AppError('INCIDENT_NOT_FOUND', 'Incident does not exist', 404);
  if (String(incident.organizationId) !== String(organizationId)) {
    throw new AppError('FORBIDDEN', 'That incident belongs to another organization', 403);
  }
  const [services, incidents] = await Promise.all([
    Service.find({ organizationId }).select('dependsOn'),
    Incident.find({ organizationId, _id: { $ne: incident._id } }).sort({ detectedAt: -1 }).limit(50),
  ]);
  return correlateIncidents(incident, incidents, services);
}

export async function runbookForService(organizationId, serviceId) {
  const runbook = await Runbook.findOne({ organizationId, serviceId });
  if (!runbook) return null;
  return { title: runbook.title, body: runbook.body };
}

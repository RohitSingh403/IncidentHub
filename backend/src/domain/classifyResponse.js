export function getByPath(value, path) {
  if (!path) return value;
  let current = value;
  for (const part of path.split('.').filter(Boolean)) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

export function classifyResponse({ statusCode, body, elapsedMs, monitor }) {
  const statusOk = statusCode === monitor.expectedStatus;
  let bodyOk = true;
  const problems = [];

  if (!statusOk) {
    problems.push(`Expected HTTP ${monitor.expectedStatus} but received ${statusCode}`);
  }

  if (monitor.expectedJsonPath) {
    const actual = getByPath(body, monitor.expectedJsonPath);
    bodyOk = String(actual) === String(monitor.expectedJsonValue ?? '');
    if (!bodyOk) {
      problems.push(
        `Expected ${monitor.expectedJsonPath} to equal ${monitor.expectedJsonValue}`,
      );
    }
  }

  return {
    success: statusOk && bodyOk,
    statusCode: statusCode ?? null,
    responseTimeMs: elapsedMs,
    error: problems.length ? problems.join('. ') : null,
  };
}

export type AuditEvent = { actor: string; action: string; patientId?: string; createdAt?: string };
const auditEvents: AuditEvent[] = [];

export function createAuditEvent(event: AuditEvent) {
  const stored = { ...event, createdAt: new Date().toISOString() };
  auditEvents.push(stored);
  return stored;
}

export function listAuditEvents(patientId: string) {
  return auditEvents.filter((event) => event.patientId === patientId);
}

export function listAllAuditEvents() {
  return [...auditEvents].reverse();
}

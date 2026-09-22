import { randomUUID } from "node:crypto";
import { readRecords } from "../storage/local-records";
import { requestOtp, verifyOtp } from "../otp/otp-service";

type AccessRequest = { id: string; doctorId: string; patientId: string; phone: string; expiresAt: number };
type AccessGrant = { doctorId: string; patientId: string; expiresAt: number };

const requests = new Map<string, AccessRequest>();
const grants = new Map<string, AccessGrant>();

export function requestDoctorAccess(input: { doctorId: string; patientId?: string; phone?: string }) {
  const patients = readRecords().patients;
  if (!input.patientId && patients.filter((item) => item.phone === input.phone).length > 1) {
    return { error: "MULTIPLE_PATIENTS_USE_ID" };
  }
  const patient = input.patientId
    ? patients.find((item) => item.patientId === input.patientId)
    : patients.find((item) => item.phone === input.phone);
  if (!patient) return { error: "PATIENT_NOT_FOUND" };
  const id = randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000;
  requests.set(id, { id, doctorId: input.doctorId, patientId: patient.patientId, phone: patient.phone, expiresAt });
  requestOtp(patient.phone, `doctor-access:${id}`);
  return { accessRequestId: id, patientId: patient.patientId, expiresAt: new Date(expiresAt).toISOString(), delivery: "patient-phone" };
}

export function approveDoctorAccess(input: { accessRequestId: string; patientOtp: string; doctorId: string }) {
  const request = requests.get(input.accessRequestId);
  if (!request || request.doctorId !== input.doctorId) return { error: "ACCESS_REQUEST_NOT_FOUND" };
  if (Date.now() > request.expiresAt) {
    requests.delete(input.accessRequestId);
    return { error: "ACCESS_REQUEST_EXPIRED" };
  }
  const verified = verifyOtp(request.phone, input.patientOtp, `doctor-access:${request.id}`);
  if (!verified.verified) return { error: verified.reason };
  requests.delete(input.accessRequestId);
  const accessToken = randomUUID();
  const expiresAt = Date.now() + 30 * 60 * 1000;
  grants.set(accessToken, { doctorId: request.doctorId, patientId: request.patientId, expiresAt });
  return { accessToken, patientId: request.patientId, expiresAt: new Date(expiresAt).toISOString() };
}

export function getDoctorAccess(accessToken: string, doctorId: string) {
  const grant = grants.get(accessToken);
  if (!grant || grant.doctorId !== doctorId) return null;
  if (Date.now() > grant.expiresAt) {
    grants.delete(accessToken);
    return null;
  }
  return grant;
}

export function listActiveDoctorAccessGrants() {
  const now = Date.now();
  for (const [token, grant] of grants) if (now > grant.expiresAt) grants.delete(token);
  return [...grants.values()];
}

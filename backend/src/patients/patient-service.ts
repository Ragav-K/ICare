import { readRecords, updateRecords, type PatientRecord } from "../storage/local-records";

export type Patient = PatientRecord;

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function nameSimilarity(a: string, b: string): number {
  const left = new Set(normalizeName(a).split(" ").filter((token) => token.length > 1));
  const right = new Set(normalizeName(b).split(" ").filter((token) => token.length > 1));
  if (left.size === 0 || right.size === 0) return 0;
  const overlap = [...left].filter((token) => right.has(token)).length;
  return overlap / Math.max(left.size, right.size);
}

export function nextPatientId(now = new Date()): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `DR-${yy}${mm}`;
  const monthlyCount = readRecords().patients.filter((patient) => patient.patientId.startsWith(prefix)).length + 1;
  return `${prefix}${String(monthlyCount).padStart(3, "0")}`;
}

export function findPatientCandidates(phone: string, fullName: string): Array<Patient & { similarity: number; requiresConfirmation: boolean }> {
  return readRecords().patients
    .filter((patient) => patient.phone === phone)
    .map((patient) => ({ ...patient, similarity: nameSimilarity(patient.fullName, fullName), requiresConfirmation: true }))
    .filter((patient) => patient.similarity >= 0.34)
    .sort((a, b) => b.similarity - a.similarity);
}

export function createPatient(input: { fullName: string; phone: string; dateOfBirth?: string }): Patient {
  return updateRecords((records) => {
    const now = new Date();
    const prefix = `DR-${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyCount = records.patients.filter((patient) => patient.patientId.startsWith(prefix)).length + 1;
    const patient: Patient = {
      patientId: `${prefix}${String(monthlyCount).padStart(3, "0")}`,
      fullName: input.fullName.trim(),
      normalizedName: normalizeName(input.fullName),
      phone: input.phone,
      dateOfBirth: input.dateOfBirth,
      createdAt: now.toISOString()
    };
    records.patients.push(patient);
    return patient;
  });
}

export function findPatientsByPhone(phone: string): Patient[] {
  return readRecords().patients.filter((patient) => patient.phone === phone);
}

export function findDoctorPatientChoices(lookup: string): Array<Pick<Patient, "patientId" | "fullName">> {
  const value = lookup.trim();
  const byId = value.toUpperCase().startsWith("DR-");
  return readRecords().patients
    .filter((patient) => byId ? patient.patientId.toUpperCase() === value.toUpperCase() : patient.phone === value)
    .map(({ patientId, fullName }) => ({ patientId, fullName }));
}

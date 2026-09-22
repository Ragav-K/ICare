import { readRecords, updateRecords } from "../storage/local-records";

export function listPatients() {
  return readRecords().patients;
}

export function listScreenings() {
  return readRecords().screenings;
}

export function getSystemStats() {
  const { patients, screenings } = readRecords();
  return {
    patients: patients.length,
    screenings: screenings.length,
    screeningsByStatus: screenings.reduce<Record<string, number>>((counts, screening) => {
      counts[screening.status] = (counts[screening.status] ?? 0) + 1;
      return counts;
    }, {}),
    reviewedScreenings: screenings.filter((screening) => screening.status === "reviewed").length
  };
}

export function deletePatient(patientId: string) {
  return updateRecords((records) => {
    const patientIndex = records.patients.findIndex((patient) => patient.patientId === patientId);
    if (patientIndex === -1) return { error: "PATIENT_NOT_FOUND" as const };
    records.patients.splice(patientIndex, 1);
    records.screenings = records.screenings.filter((screening) => screening.patientId !== patientId);
    return { deleted: patientId };
  });
}

export function deleteScreening(screeningId: string) {
  return updateRecords((records) => {
    const screeningIndex = records.screenings.findIndex((screening) => screening.id === screeningId);
    if (screeningIndex === -1) return { error: "SCREENING_NOT_FOUND" as const };
    records.screenings.splice(screeningIndex, 1);
    return { deleted: screeningId };
  });
}

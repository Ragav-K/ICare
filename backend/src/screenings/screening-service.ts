import { randomUUID } from "node:crypto";
import { runMatlabInference } from "../ai/matlab-gateway";
import { readRecords, updateRecords, type DoctorReviewRecord, type ScreeningRecord } from "../storage/local-records";
import { GENERAL_DIET_DRAFT } from "../diet/general-draft";

export function createScreening(input: Pick<ScreeningRecord, "patientId" | "imagePath" | "capturedBy"> & { imagePaths?: string[] }): ScreeningRecord | null {
  return updateRecords((records) => {
    if (!records.patients.some((patient) => patient.patientId === input.patientId)) return null;
    const imagePaths = input.imagePaths?.length ? input.imagePaths : [input.imagePath];
    const screening: ScreeningRecord = {
      id: randomUUID(), status: "created", createdAt: new Date().toISOString(), ...input,
      imagePath: imagePaths[0], imagePaths
    };
    records.screenings.push(screening);
    return screening;
  });
}

export function saveDietPlan(id: string, input: { doctorId: string; text: string }) {
  return updateRecords((records) => {
    const screening = records.screenings.find((item) => item.id === id);
    if (!screening) return { error: "SCREENING_NOT_FOUND" };
    if (screening.status !== "completed" && screening.status !== "reviewed") {
      return { error: "SCREENING_NOT_READY_FOR_DIET_PLAN" };
    }
    screening.dietPlan = { ...input, source: "doctor", updatedAt: new Date().toISOString() };
    return { screening };
  });
}

export function getScreening(id: string) {
  const records = readRecords();
  const screening = records.screenings.find((item) => item.id === id);
  if (!screening) return null;
  return {
    screening,
    patient: records.patients.find((patient) => patient.patientId === screening.patientId),
    result: screening.result
  };
}

export function getLatestScreeningForPatient(patientId: string) {
  const latest = readRecords().screenings
    .filter((item) => item.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return latest ? getScreening(latest.id) : null;
}

export function listPatientScreenings(patientId: string, phone: string) {
  const records = readRecords();
  const patient = records.patients.find((item) => item.patientId === patientId && item.phone === phone);
  if (!patient) return null;
  return {
    patient,
    screenings: records.screenings
      .filter((item) => item.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export function getPatientScreeningsForDoctor(patientId: string) {
  const records = readRecords();
  return {
    patient: records.patients.find((item) => item.patientId === patientId),
    screenings: records.screenings
      .filter((item) => item.patientId === patientId && (item.status === "completed" || item.status === "reviewed"))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export function startScreeningProcessing(id: string, runInference = runMatlabInference) {
  const screening = readRecords().screenings.find((item) => item.id === id);
  if (!screening) return { error: "SCREENING_NOT_FOUND" };
  if (screening.status !== "created") return { error: "SCREENING_ALREADY_PROCESSED" };
  const started = updateRecords((records) => {
    const current = records.screenings.find((item) => item.id === id);
    if (current) current.status = "processing";
    return current!;
  });

  void runInference(screening.imagePath)
    .catch((error: unknown) => ({
      status: "failed" as const,
      error: "MATLAB_INFERENCE_UNAVAILABLE",
      message: error instanceof Error ? error.message : String(error)
    }))
    .then((result) => {
      updateRecords((records) => {
        const current = records.screenings.find((item) => item.id === id);
        if (!current || current.status !== "processing") return;
        current.status = result.status === "completed" ? "completed" : "failed";
        current.result = result;
        if (current.status === "completed" && !current.dietPlan) {
          current.dietPlan = {
            source: "ai-draft",
            text: GENERAL_DIET_DRAFT,
            updatedAt: new Date().toISOString()
          };
        }
      });
    })
    .catch((error: unknown) => console.error("Could not save MATLAB screening result:", error));
  return { screening: started };
}

export function finalizeScreening(id: string, input: Pick<DoctorReviewRecord, "doctorId" | "finalGrade"> & Partial<Pick<DoctorReviewRecord, "comments" | "patientGuidance">>) {
  return updateRecords((records) => {
    const screening = records.screenings.find((item) => item.id === id);
    if (!screening) return { error: "SCREENING_NOT_FOUND" };
    if (screening.status !== "completed" || !screening.result?.classification) {
      return { error: "SCREENING_NOT_READY_FOR_REVIEW" };
    }
    screening.review = { ...input, reviewedAt: new Date().toISOString() };
    screening.status = "reviewed";
    return { screening };
  });
}

export function listReviewedScreenings(patientId: string, phone: string) {
  const records = readRecords();
  const patient = records.patients.find((item) => item.patientId === patientId && item.phone === phone);
  if (!patient) return null;
  const screenings = records.screenings
    .filter((screening) => screening.patientId === patientId && screening.status === "reviewed")
    .map((screening) => ({ id: screening.id, createdAt: screening.createdAt, review: screening.review }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { patient, screenings };
}

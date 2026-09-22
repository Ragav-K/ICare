import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { MatlabInferenceResult } from "../ai/matlab-gateway";
import { GENERAL_DIET_DRAFT } from "../diet/general-draft";

export type PatientRecord = {
  patientId: string;
  fullName: string;
  normalizedName: string;
  phone: string;
  dateOfBirth?: string;
  createdAt: string;
};

export type DoctorReviewRecord = {
  doctorId: string;
  finalGrade: number;
  comments?: string;
  patientGuidance?: string;
  reviewedAt: string;
};

export type ScreeningRecord = {
  id: string;
  patientId: string;
  imagePath: string;
  imagePaths?: string[];
  capturedBy: string;
  status: "created" | "processing" | "completed" | "failed" | "reviewed";
  createdAt: string;
  result?: MatlabInferenceResult;
  review?: DoctorReviewRecord;
  dietPlan?: { text: string; doctorId?: string; source: "ai-draft" | "doctor"; updatedAt: string };
};

type LocalRecords = { patients: PatientRecord[]; screenings: ScreeningRecord[] };
export const storageDirectory = path.resolve(process.env.ICARE_STORAGE_DIR ?? path.resolve(process.cwd(), "storage"));
const storagePath = path.join(storageDirectory, "local-records.json");

export function readRecords(): LocalRecords {
  if (!fs.existsSync(storagePath)) return { patients: [], screenings: [] };
  const stored = JSON.parse(fs.readFileSync(storagePath, "utf8")) as LocalRecords;
  for (const screening of stored.screenings ?? []) {
    if (screening.dietPlan?.source === "ai-draft") screening.dietPlan.text = GENERAL_DIET_DRAFT;
  }
  return { patients: stored.patients ?? [], screenings: stored.screenings ?? [] };
}

export function updateRecords<T>(change: (records: LocalRecords) => T): T {
  const records = readRecords();
  const result = change(records);
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });
  const temporaryPath = `${storagePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(records, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryPath, storagePath);
  return result;
}

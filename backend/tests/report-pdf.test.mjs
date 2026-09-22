import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("creates distinct patient and clinical PDF reports from screening data", async () => {
  const screening = {
    id: "screening-1", patientId: "DR-TEST", createdAt: "2026-09-17T10:00:00.000Z", status: "reviewed",
    capturedBy: "worker", imagePath: "photo.jpg",
    result: { classification: { primary: { predictedGrade: 2, confidence: 0.71, risk: "doctor_review" },
      resnet50: { predictedGrade: 2, confidence: 0.71 } }, quality: { acceptable: true } },
    review: { doctorId: "doctor", finalGrade: 1, comments: "Reviewed.", patientGuidance: "Follow up.", reviewedAt: "2026-09-17T12:00:00.000Z" },
    dietPlan: { text: "Clinician-authored nutrition plan.", doctorId: "doctor", updatedAt: "2026-09-17T12:00:00.000Z" }
  };
  const patient = { patientId: "DR-TEST", fullName: "Test Patient" };
  const script = `import { createReportPdf } from './apps/shared/report-pdf.js';
    import { PDFDocument } from 'pdf-lib';
    const screening = ${JSON.stringify(screening)};
    const patient = ${JSON.stringify(patient)};
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64');
    const images = [{ bytes: png, mimeType: 'image/png' }, { bytes: png, mimeType: 'image/png' }];
    const modelImages = [{ name: 'U-Net vessels', bytes: png, note: 'Supporting overlay' }];
    for (const audience of ['patient', 'doctor']) {
      const bytes = await createReportPdf({ audience, patient, screening, screenings: [screening], images, modelImages });
      if (new TextDecoder().decode(bytes.slice(0, 8)) !== '%PDF-1.7' || bytes.length <= 1000) process.exit(1);
      if ((await PDFDocument.load(bytes)).getPageCount() < 2) process.exit(2);
    }
    console.log('PDF_OK');`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: new URL("../..", import.meta.url), encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PDF_OK/);
});

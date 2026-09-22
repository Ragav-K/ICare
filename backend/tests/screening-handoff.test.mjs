import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("keeps a screening with the patient until patient-authorized doctor review", async () => {
  const originalDirectory = process.cwd();
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "icare-handoff-"));
  process.chdir(temporaryDirectory);
  try {
    const { createPatient, findPatientsByPhone, findDoctorPatientChoices } = await import("../src/patients/patient-service.ts");
    const { createScreening, startScreeningProcessing, getScreening, getLatestScreeningForPatient,
      listPatientScreenings, getPatientScreeningsForDoctor, finalizeScreening, listReviewedScreenings, saveDietPlan } =
      await import("../src/screenings/screening-service.ts");
    const { requestDoctorAccess, approveDoctorAccess, getDoctorAccess } = await import("../src/consent/consent-service.ts");
    const { readRecords } = await import("../src/storage/local-records.ts");

    const patient = createPatient({ fullName: "Test Patient", phone: "9000000000" });
    assert.equal(findPatientsByPhone(patient.phone)[0].patientId, patient.patientId);
    assert.deepEqual(findDoctorPatientChoices(patient.phone), [{ patientId: patient.patientId, fullName: patient.fullName }]);
    assert.deepEqual(findDoctorPatientChoices(patient.patientId.toLowerCase()), [{ patientId: patient.patientId, fullName: patient.fullName }]);
    const screening = createScreening({ patientId: patient.patientId, imagePath: "sample.jpg", imagePaths: ["sample.jpg", "second.jpg"], capturedBy: "worker" });
    assert.ok(screening);
    assert.deepEqual(getScreening(screening.id).screening.imagePaths, ["sample.jpg", "second.jpg"]);
    assert.equal(listReviewedScreenings(patient.patientId, patient.phone).screenings.length, 0);

    let completeInference;
    const pendingInference = new Promise((resolve) => { completeInference = resolve; });
    const started = startScreeningProcessing(screening.id, () => pendingInference);
    assert.equal(started.screening.status, "processing");
    assert.equal(getScreening(screening.id).screening.status, "processing");
    completeInference({ status: "completed", classification: { primary: { predictedGrade: 2 } } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(getLatestScreeningForPatient(patient.patientId).screening.status, "completed");
    assert.equal(getLatestScreeningForPatient(patient.patientId).screening.dietPlan.source, "ai-draft");
    assert.match(getLatestScreeningForPatient(patient.patientId).screening.dietPlan.text, /whole fruit more often than juice/i);
    assert.equal(listPatientScreenings(patient.patientId, patient.phone).screenings.length, 1);
    assert.equal(listPatientScreenings(patient.patientId, "other-phone"), null);
    assert.equal(getDoctorAccess("invalid", "doctor-demo"), null);
    const access = requestDoctorAccess({ doctorId: "doctor-demo", patientId: patient.patientId });
    assert.ok(access.accessRequestId);
    assert.equal(approveDoctorAccess({ doctorId: "other-doctor", accessRequestId: access.accessRequestId, patientOtp: "123456" }).error, "ACCESS_REQUEST_NOT_FOUND");
    assert.equal(approveDoctorAccess({ doctorId: "doctor-demo", accessRequestId: access.accessRequestId, patientOtp: "000000" }).error, "INVALID_OTP");
    const approved = approveDoctorAccess({ doctorId: "doctor-demo", accessRequestId: access.accessRequestId, patientOtp: "123456" });
    assert.equal(getDoctorAccess(approved.accessToken, "doctor-demo").patientId, patient.patientId);
    assert.equal(getDoctorAccess(approved.accessToken, "other-doctor"), null);
    assert.equal(getPatientScreeningsForDoctor(patient.patientId).screenings.length, 1);

    const finalized = finalizeScreening(screening.id, {
      doctorId: "doctor-demo", finalGrade: 3, comments: "Clinical review completed.",
      patientGuidance: "Please arrange a follow-up appointment."
    });
    assert.equal(finalized.screening.review.finalGrade, 3);
    assert.equal(listPatientScreenings(patient.patientId, patient.phone).screenings[0].status, "reviewed");
    const visible = listReviewedScreenings(patient.patientId, patient.phone);
    assert.equal(visible.screenings[0].review.patientGuidance, "Please arrange a follow-up appointment.");
    assert.equal(listReviewedScreenings(patient.patientId, "other-phone"), null);
    assert.equal(readRecords().screenings[0].result.classification.primary.predictedGrade, 2);
    assert.equal(readRecords().screenings[0].review.finalGrade, 3);
    assert.equal(saveDietPlan(screening.id, { doctorId: "doctor-demo", text: "Individualized plan after assessment." }).screening.dietPlan.text, "Individualized plan after assessment.");
    assert.equal(saveDietPlan(screening.id, { doctorId: "doctor-demo", text: "Updated plan." }).screening.dietPlan.text, "Updated plan.");
    assert.equal(getScreening(screening.id).screening.dietPlan.source, "doctor");
    assert.equal(listPatientScreenings(patient.patientId, patient.phone).screenings[0].dietPlan.text, "Updated plan.");
    createPatient({ fullName: "Another Patient", phone: patient.phone });
    assert.equal(findDoctorPatientChoices(patient.phone).length, 2);
    assert.equal(requestDoctorAccess({ doctorId: "doctor-demo", phone: patient.phone }).error, "MULTIPLE_PATIENTS_USE_ID");
    assert.ok(fs.existsSync(path.join(temporaryDirectory, "storage", "local-records.json")));
    assert.equal(finalizeScreening(screening.id, {
      doctorId: "another", finalGrade: 0, comments: "Overwrite", patientGuidance: "Overwrite"
    }).error, "SCREENING_NOT_READY_FOR_REVIEW");
    const optionalReview = createScreening({ patientId: patient.patientId, imagePath: "third.jpg", capturedBy: "worker" });
    startScreeningProcessing(optionalReview.id, async () => ({ status: "completed", classification: { primary: { predictedGrade: 1 } } }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(finalizeScreening(optionalReview.id, { doctorId: "doctor-demo", finalGrade: 1 }).screening.status, "reviewed");
  } finally {
    process.chdir(originalDirectory);
    assert.ok(temporaryDirectory.startsWith(os.tmpdir() + path.sep));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

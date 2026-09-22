import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { createPatient, findPatientCandidates, findPatientsByPhone, findDoctorPatientChoices } from "./patients/patient-service";
import { requestOtp, verifyOtp } from "./otp/otp-service";
import { createScreening, finalizeScreening, getLatestScreeningForPatient, getScreening, getPatientScreeningsForDoctor, listPatientScreenings, listReviewedScreenings, saveDietPlan, startScreeningProcessing } from "./screenings/screening-service";
import { requestDoctorAccess, approveDoctorAccess, getDoctorAccess } from "./consent/consent-service";
import { createDietRecommendation, approveDietPlan } from "./diet/diet-service";
import { createAuditEvent, listAllAuditEvents } from "./audit/audit-service";
import { loginStaff, verifyStaffToken } from "./auth/staff-auth";
import { storageDirectory } from "./storage/local-records";
import { listActiveDoctorAccessGrants } from "./consent/consent-service";
import { listPatients, listScreenings, getSystemStats, deletePatient, deleteScreening } from "./admin/admin-service";

const app = express();

// The web apps are served from their own Vite dev origins, so the browser needs
// an explicit CORS grant before it will let them call this API.
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  const origin = req.headers.origin;
  const isLocalDevOrigin =
    typeof origin === "string" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

  if (origin && (allowedOrigins.has(origin) || (allowedOrigins.size === 0 && isLocalDevOrigin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Doctor-Id");
    res.setHeader("Access-Control-Max-Age", "600");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json({ limit: "60mb" }));

function developmentOnly(_req: express.Request, res: express.Response, next: express.NextFunction) {
  if (process.env.NODE_ENV === "production") {
    res.status(503).json({ error: "AUTHENTICATION_REQUIRED_BEFORE_PRODUCTION_USE" });
    return;
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ service: "ICare Backend", status: "ok", matlabMode: process.env.MATLAB_INFERENCE_MODE ?? "batch" });
});

app.post("/auth/staff/login", (req, res) => {
  const body = z.object({ role: z.enum(["worker", "doctor", "admin"]), email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const session = loginStaff(body.role, body.email, body.password);
  if (!session) return void res.status(401).json({ error: "INVALID_CREDENTIALS" });
  createAuditEvent({ actor: session.email, action: `STAFF_LOGIN_${body.role.toUpperCase()}` });
  res.json(session);
});

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const payload = verifyStaffToken(token, "admin");
  if (!payload) return void res.status(401).json({ error: "ADMIN_AUTHENTICATION_REQUIRED" });
  next();
}

app.post("/auth/patient/request-otp", (req, res) => {
  const body = z.object({ phone: z.string().min(6) }).parse(req.body);
  res.json(requestOtp(body.phone, "patient-login"));
});

app.post("/auth/patient/verify-otp", (req, res) => {
  const body = z.object({ phone: z.string(), otp: z.string().length(6) }).parse(req.body);
  res.json(verifyOtp(body.phone, body.otp, "patient-login"));
});

app.get("/patients/search", (req, res) => {
  const phone = z.string().min(6).parse(req.query.phone);
  const name = z.string().min(1).parse(req.query.name);
  res.json({ candidates: findPatientCandidates(phone, name) });
});

app.get("/patients/by-phone", developmentOnly, (req, res) => {
  const phone = z.string().min(6).parse(req.query.phone);
  res.json({ patients: findPatientsByPhone(phone) });
});

app.get("/patients/:patientId/reviewed-screenings", developmentOnly, (req, res) => {
  const phone = z.string().min(6).parse(req.query.phone);
  const found = listReviewedScreenings(req.params.patientId, phone);
  if (!found) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  res.json(found);
});

app.get("/patients/:patientId/screenings", developmentOnly, (req, res) => {
  const phone = z.string().min(6).parse(req.query.phone);
  const found = listPatientScreenings(req.params.patientId, phone);
  if (!found) return void res.status(404).json({ error: "PATIENT_NOT_FOUND" });
  res.json(found);
});

app.post("/patients", (req, res) => {
  const body = z.object({ fullName: z.string().min(1), phone: z.string().min(6), dateOfBirth: z.string().optional() }).parse(req.body);
  const patient = createPatient(body);
  createAuditEvent({ actor: "system", action: "PATIENT_CREATED", patientId: patient.patientId });
  res.status(201).json(patient);
});

app.post("/uploads/fundus", (req, res) => {
  const body = z.object({
    fileName: z.string().min(1),
    contentType: z.string().min(1),
    dataBase64: z.string().min(1)
  }).parse(req.body);

  const extension = path.extname(body.fileName).toLowerCase();
  // Only browser-displayable, pdf-lib-embeddable formats: fundus cameras produce
  // JPEG/PNG, and downstream <img> rendering plus PDF report embedding cannot
  // decode TIFF or GIF, which previously slipped through and rendered as a
  // silent black image everywhere it was displayed.
  const allowedExtensions = new Set([".png", ".jpg", ".jpeg"]);
  if (!allowedExtensions.has(extension)) {
    res.status(400).json({ error: "UNSUPPORTED_IMAGE_TYPE", allowed: Array.from(allowedExtensions).sort() });
    return;
  }

  const safeBaseName = path
    .basename(body.fileName, extension)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80) || "fundus";
  const uploadDir = path.join(storageDirectory, "uploads", "fundus");
  fs.mkdirSync(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, `${Date.now()}-${safeBaseName}${extension}`);
  fs.writeFileSync(filePath, Buffer.from(body.dataBase64, "base64"));

  res.status(201).json({
    fileName: body.fileName,
    contentType: body.contentType,
    imagePath: filePath.replace(/\\/g, "/")
  });
});

app.post("/screenings", (req, res) => {
  const body = z.object({ patientId: z.string(), imagePath: z.string(), imagePaths: z.array(z.string()).min(1).max(6).optional(), capturedBy: z.string() }).parse(req.body);
  const screening = createScreening(body);
  if (!screening) {
    res.status(404).json({ error: "PATIENT_NOT_FOUND" });
    return;
  }
  createAuditEvent({ actor: body.capturedBy, action: "SCREENING_CREATED", patientId: body.patientId });
  res.status(201).json(screening);
});

app.get("/screenings/:id", developmentOnly, (req, res) => {
  const found = getScreening(req.params.id);
  if (!found) {
    res.status(404).json({ error: "SCREENING_NOT_FOUND" });
    return;
  }
  res.json(found);
});

function sendScreeningImage(screeningId: string, index: number, res: express.Response) {
  const found = getScreening(screeningId);
  if (!found) return void res.status(404).json({ error: "SCREENING_NOT_FOUND" });
  const images = found.screening.imagePaths?.length ? found.screening.imagePaths : [found.screening.imagePath];
  if (!Number.isInteger(index) || index < 0 || index >= images.length) {
    return void res.status(404).json({ error: "SCREENING_IMAGE_NOT_FOUND" });
  }
  const uploadRoot = path.join(storageDirectory, "uploads", "fundus");
  const imagePath = path.resolve(images[index]);
  if (!imagePath.startsWith(uploadRoot + path.sep) || !fs.existsSync(imagePath)) {
    return void res.status(404).json({ error: "SCREENING_IMAGE_NOT_FOUND" });
  }
  res.sendFile(imagePath);
}

app.get("/screenings/:id/image", developmentOnly, (req, res) => {
  sendScreeningImage(req.params.id, Number(req.query.index ?? 0), res);
});

const modelImageKeys = new Set(["resnet50", "mobilenetv2", "vessels", "hardExudates", "microaneurysms", "haemorrhages", "softExudates"]);

function sendModelImage(screeningId: string, modelKey: string, res: express.Response) {
  const found = getScreening(screeningId);
  if (!found || !modelImageKeys.has(modelKey)) return void res.status(404).json({ error: "MODEL_IMAGE_NOT_FOUND" });
  const models = found.screening.result?.segmentation as Record<string, { overlayPath?: string }> | undefined;
  const classifiers = found.screening.result?.classification as Record<string, { gradCamPath?: string }> | undefined;
  const storedPath = models?.[modelKey]?.overlayPath ?? classifiers?.[modelKey]?.gradCamPath;
  if (!storedPath) return void res.status(404).json({ error: "MODEL_IMAGE_NOT_FOUND" });
  const imagePath = path.resolve(storedPath);
  if (path.basename(path.dirname(imagePath)) !== "inference_outputs" || path.extname(imagePath).toLowerCase() !== ".png" || !fs.existsSync(imagePath)) {
    return void res.status(404).json({ error: "MODEL_IMAGE_NOT_FOUND" });
  }
  res.type("png").sendFile(imagePath);
}

app.get("/screenings/:id/model-image/:model", developmentOnly, (req, res) => {
  sendModelImage(req.params.id, req.params.model, res);
});

app.get("/patients/:patientId/screenings/latest", developmentOnly, (req, res) => {
  const found = getLatestScreeningForPatient(req.params.patientId);
  if (!found) {
    res.status(404).json({ error: "SCREENING_NOT_FOUND" });
    return;
  }
  res.json(found);
});

app.post("/screenings/:id/process", (req, res) => {
  const processed = startScreeningProcessing(req.params.id);
  if ("error" in processed) {
    res.status(processed.error === "SCREENING_NOT_FOUND" ? 404 : 409).json(processed);
    return;
  }
  res.status(202).json(processed);
});

app.get("/doctor/patient-screenings", developmentOnly, (req, res) => {
  const doctorId = z.string().min(1).parse(req.headers["x-doctor-id"]);
  const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const grant = getDoctorAccess(token, doctorId);
  if (!grant) return void res.status(403).json({ error: "PATIENT_CONSENT_REQUIRED" });
  const patient = getPatientScreeningsForDoctor(grant.patientId);
  res.json(patient);
});

app.get("/doctor/screenings/:id/image", developmentOnly, (req, res) => {
  const doctorId = z.string().min(1).parse(req.headers["x-doctor-id"]);
  const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const grant = getDoctorAccess(token, doctorId);
  const screening = getScreening(req.params.id);
  if (!grant || !screening || screening.screening.patientId !== grant.patientId) {
    return void res.status(403).json({ error: "PATIENT_CONSENT_REQUIRED" });
  }
  sendScreeningImage(req.params.id, Number(req.query.index ?? 0), res);
});

app.get("/doctor/screenings/:id/model-image/:model", developmentOnly, (req, res) => {
  const doctorId = z.string().min(1).parse(req.headers["x-doctor-id"]);
  const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const grant = getDoctorAccess(token, doctorId);
  const found = getScreening(req.params.id);
  if (!grant || !found || found.screening.patientId !== grant.patientId) {
    return void res.status(403).json({ error: "PATIENT_CONSENT_REQUIRED" });
  }
  sendModelImage(req.params.id, req.params.model, res);
});

app.post("/doctor/screenings/:id/diet-plan", developmentOnly, (req, res) => {
  const body = z.object({ doctorId: z.string().min(1), text: z.string().trim().min(1).max(4000) }).parse(req.body);
  const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const grant = getDoctorAccess(token, body.doctorId);
  const found = getScreening(req.params.id);
  if (!grant || !found || found.screening.patientId !== grant.patientId) {
    return void res.status(403).json({ error: "PATIENT_CONSENT_REQUIRED" });
  }
  const saved = saveDietPlan(req.params.id, body);
  if ("error" in saved) return void res.status(409).json(saved);
  createAuditEvent({ actor: body.doctorId, action: "DIET_PLAN_UPDATED", patientId: saved.screening.patientId });
  res.json(saved);
});

app.post("/screenings/:id/review", developmentOnly, (req, res) => {
  const body = z.object({
    doctorId: z.string().min(1),
    finalGrade: z.number().int().min(0).max(4),
    comments: z.string().trim().max(2000).optional(),
    patientGuidance: z.string().trim().max(2000).optional()
  }).parse(req.body);
  const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
  const grant = getDoctorAccess(token, body.doctorId);
  const screening = getScreening(req.params.id);
  if (!grant || !screening || screening.screening.patientId !== grant.patientId) {
    res.status(403).json({ error: "PATIENT_CONSENT_REQUIRED" });
    return;
  }
  const reviewed = finalizeScreening(req.params.id, body);
  if ("error" in reviewed) {
    res.status(reviewed.error === "SCREENING_NOT_FOUND" ? 404 : 409).json(reviewed);
    return;
  }
  createAuditEvent({ actor: body.doctorId, action: "SCREENING_REVIEWED", patientId: reviewed.screening.patientId });
  res.json(reviewed);
});

app.get("/doctor/patient-choices", developmentOnly, (req, res) => {
  const lookup = z.string().min(6).parse(req.query.lookup);
  res.json({ patients: findDoctorPatientChoices(lookup) });
});

app.post("/doctor/access-request", developmentOnly, (req, res) => {
  const body = z.object({ doctorId: z.string().min(1), patientId: z.string().optional(), phone: z.string().optional() })
    .refine((value) => Boolean(value.patientId || value.phone)).parse(req.body);
  const result = requestDoctorAccess(body);
  res.status("error" in result ? result.error === "MULTIPLE_PATIENTS_USE_ID" ? 409 : 404 : 201).json(result);
});

app.post("/doctor/access-approve", developmentOnly, (req, res) => {
  const body = z.object({ accessRequestId: z.string(), patientOtp: z.string().length(6), doctorId: z.string().min(1) }).parse(req.body);
  const result = approveDoctorAccess(body);
  if (!("error" in result)) {
    createAuditEvent({ actor: body.doctorId, action: "DOCTOR_ACCESS_GRANTED", patientId: result.patientId });
  }
  res.status("error" in result ? 403 : 200).json(result);
});

app.post("/diet/recommendation", (req, res) => {
  const body = z.object({ patientId: z.string(), availableInformation: z.record(z.string()).default({}) }).parse(req.body);
  res.status(201).json(createDietRecommendation(body.patientId, body.availableInformation));
});

app.post("/diet/approve", (req, res) => {
  const body = z.object({ recommendationId: z.string(), doctorId: z.string(), finalPlan: z.string() }).parse(req.body);
  res.json(approveDietPlan(body));
});

app.get("/admin/overview", developmentOnly, requireAdmin, (_req, res) => {
  res.json(getSystemStats());
});

app.get("/admin/patients", developmentOnly, requireAdmin, (_req, res) => {
  res.json({ patients: listPatients() });
});

app.delete("/admin/patients/:patientId", developmentOnly, requireAdmin, (req, res) => {
  const result = deletePatient(req.params.patientId);
  if ("error" in result) return void res.status(404).json(result);
  createAuditEvent({ actor: "admin", action: "PATIENT_DELETED", patientId: req.params.patientId });
  res.json(result);
});

app.get("/admin/screenings", developmentOnly, requireAdmin, (_req, res) => {
  res.json({ screenings: listScreenings() });
});

app.delete("/admin/screenings/:id", developmentOnly, requireAdmin, (req, res) => {
  const result = deleteScreening(req.params.id);
  if ("error" in result) return void res.status(404).json(result);
  createAuditEvent({ actor: "admin", action: "SCREENING_DELETED" });
  res.json(result);
});

app.get("/admin/audit", developmentOnly, requireAdmin, (_req, res) => {
  res.json({ events: listAllAuditEvents() });
});

app.get("/admin/consent-grants", developmentOnly, requireAdmin, (_req, res) => {
  res.json({ grants: listActiveDoctorAccessGrants() });
});

app.get("/admin/staff", developmentOnly, requireAdmin, (_req, res) => {
  const roles = ["worker", "doctor", "admin"] as const;
  res.json({
    staff: roles.map((role) => {
      const prefix = role === "worker" ? "ICARE_WORKER" : role === "doctor" ? "ICARE_DOCTOR" : "ICARE_ADMIN";
      const configuredEmail = process.env[`${prefix}_EMAIL`];
      return {
        role,
        email: configuredEmail || "iamragav2k7@gmail.com",
        source: configuredEmail ? "configured" : "demo"
      };
    })
  });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`ICare Backend listening on http://localhost:${port}`);
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sampleImage = process.env.ICARE_E2E_IMAGE;
if (!sampleImage || !existsSync(sampleImage)) {
  throw new Error("Set ICARE_E2E_IMAGE to a readable fundus JPG/PNG before running this test.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = [];
let browser;
let testDirectory;

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function start(name, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const log = [];
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      log.push(chunk.toString());
      if (log.length > 80) log.shift();
    });
  }
  children.push({ name, child, log });
  return child;
}

async function waitForServer(url, child, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} exited before becoming ready.`);
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* still starting */ }
    await sleep(500);
  }
  throw new Error(`${label} did not start at ${url}.`);
}

async function setField(page, selector, value) {
  await page.$eval(selector, (input, next) => {
    input.value = next;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function waitForText(page, selector, pattern, timeout = 30_000) {
  await page.waitForFunction((target, source) => new RegExp(source).test(document.querySelector(target)?.textContent ?? ""),
    { timeout }, selector, pattern.source);
}

async function allowDownloads(page, directory) {
  const client = await page.createCDPSession();
  await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: directory });
}

async function waitForPdf(directory, prefix) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const match = (await readdir(directory)).find((name) => name.startsWith(prefix) && name.endsWith(".pdf"));
    if (match) {
      try {
        const bytes = await readFile(path.join(directory, match));
        if (bytes.length > 1000 && (await PDFDocument.load(bytes)).getPageCount() >= 1) return { name: match, bytes };
      } catch { /* download may still be in progress */ }
    }
    await sleep(500);
  }
  throw new Error(`PDF download ${prefix} did not finish.`);
}

async function main() {
  testDirectory = await mkdtemp(path.join(os.tmpdir(), "icare-e2e-"));
  const apiPort = await freePort();
  const workerPort = await freePort();
  const patientPort = await freePort();
  const doctorPort = await freePort();
  const apiBase = `http://127.0.0.1:${apiPort}`;
  const vite = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const backend = start("backend", ["--import", "tsx", "src/main.ts"], path.join(root, "backend"), {
    PORT: String(apiPort), ICARE_STORAGE_DIR: path.join(testDirectory, "storage"), OTP_PROVIDER: "development", NODE_ENV: "development"
  });
  await waitForServer(`${apiBase}/health`, backend, "backend");
  const sites = [
    ["worker", "healthcare-worker-web", workerPort],
    ["patient", "patient-web", patientPort],
    ["doctor", "doctor-web", doctorPort]
  ];
  for (const [name, folder, port] of sites) {
    const server = start(name, [vite, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
      path.join(root, "apps", folder), { VITE_API_BASE_URL: apiBase });
    await waitForServer(`http://127.0.0.1:${port}/`, server, name);
  }
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 120_000 });
  const worker = await browser.newPage();
  worker.setDefaultNavigationTimeout(120_000);
  await worker.goto(`http://127.0.0.1:${workerPort}/`, { waitUntil: "domcontentloaded" });
  await worker.waitForFunction(() => document.documentElement.dataset.icareReady === "true");
  await setField(worker, "#loginEmail", "iamragav2k7@gmail.com");
  await setField(worker, "#loginPassword", "123456");
  await worker.click("#loginForm button[type=submit]");
  await worker.waitForFunction(() => !document.querySelector("#appShell").hidden);
  const phone = `9${String(Date.now()).slice(-9)}`;
  await setField(worker, "#fullName", "E2E Sample Patient");
  await setField(worker, "#phone", phone);
  await worker.click("#checkUserBtn");
  await worker.waitForFunction(() => !document.querySelector("#createPatientPanel").hidden);
  await worker.click("#createPatientBtn");
  await worker.waitForFunction(() => !document.querySelector("#screeningPanel").hidden);
  const patientId = await worker.$eval("#patientId", (input) => input.value);
  assert.match(patientId, /^DR-/);
  await (await worker.$("#fundusPhoto")).uploadFile(sampleImage);
  await worker.waitForFunction(() => document.querySelector("#photoList").textContent.length > 0);
  await worker.click("#processBtn");
  console.log(`Screening ${patientId}: waiting for real MATLAB inference...`);
  const inferenceDeadline = Date.now() + 16 * 60_000;
  let screeningResponse;
  while (Date.now() < inferenceDeadline) {
    const response = await fetch(`${apiBase}/patients/${encodeURIComponent(patientId)}/screenings/latest`);
    if (response.ok) {
      screeningResponse = await response.json();
      if (["completed", "failed"].includes(screeningResponse.screening.status)) break;
    }
    await sleep(5000);
  }
  assert.ok(screeningResponse, "The backend did not save a screening.");
  assert.equal(screeningResponse.screening.status, "completed", `MATLAB result: ${JSON.stringify(screeningResponse.result)}`);
  await worker.waitForFunction(() => !document.querySelector("#result").hidden, { timeout: 60_000 });
  const resultTitle = await worker.$eval("#resultTitle", (element) => element.textContent);
  assert.doesNotMatch(resultTitle, /failed/i, `MATLAB result: ${resultTitle}`);
  const screeningId = screeningResponse.screening.id;
  assert.ok(screeningId);
  assert.equal(screeningResponse.screening.status, "completed");
  assert.equal(screeningResponse.screening.patientId, patientId);
  assert.equal(screeningResponse.screening.dietPlan?.source, "ai-draft");
  console.log(`MATLAB completed: ${resultTitle}.`);

  await worker.click("#viewReportsBtn");
  await allowDownloads(worker, testDirectory);
  await worker.click("#patientReportBtn");
  const workerPatientPdf = await waitForPdf(testDirectory, "icare-patient-ai-draft-");
  await worker.click("#doctorReportBtn");
  const workerDoctorPdf = await waitForPdf(testDirectory, "icare-doctor-ai-draft-");
  assert.ok(workerDoctorPdf.bytes.length > workerPatientPdf.bytes.length);
  console.log("Worker patient and doctor PDFs downloaded and opened successfully.");

  const patient = await browser.newPage();
  patient.setDefaultNavigationTimeout(120_000);
  await patient.goto(`http://127.0.0.1:${patientPort}/`, { waitUntil: "domcontentloaded" });
  await patient.waitForFunction(() => document.documentElement.dataset.icareReady === "true");
  await setField(patient, "#phone", phone);
  await patient.click("#requestOtpBtn");
  await waitForText(patient, "#otpStatus", /123456/);
  await setField(patient, "#otp", "123456");
  await patient.click("#loginForm button[type=submit]");
  await patient.waitForFunction(() => !document.querySelector("#dashboard").classList.contains("hidden"));
  await patient.waitForFunction(() => !document.querySelector("#downloadBtn").disabled);
  assert.notEqual(await patient.$eval("#resultGrade", (element) => element.textContent), "-");
  console.log("Patient site shows the AI draft and diet plan.");

  const doctor = await browser.newPage();
  doctor.setDefaultNavigationTimeout(120_000);
  await doctor.goto(`http://127.0.0.1:${doctorPort}/`, { waitUntil: "domcontentloaded" });
  await doctor.waitForFunction(() => document.documentElement.dataset.icareReady === "true");
  await setField(doctor, "#email", "iamragav2k7@gmail.com");
  await setField(doctor, "#password", "123456");
  await doctor.click("#loginForm button[type=submit]");
  await doctor.waitForFunction(() => !document.querySelector("#dashboard").classList.contains("hidden"));
  await setField(doctor, "#patientLookup", phone);
  await doctor.click("#accessForm button[type=submit]");
  await doctor.waitForFunction(() => !document.querySelector("#patientChoiceStep").hidden);
  await doctor.select("#patientChoice", patientId);
  await doctor.click("#sendPatientOtpBtn");
  await doctor.waitForFunction(() => !document.querySelector("#consentForm").hidden);
  await setField(doctor, "#patientAccessOtp", "123456");
  await doctor.click("#consentForm button[type=submit]");
  await doctor.waitForFunction(() => document.querySelector("#queueSelect").value.length > 0);
  assert.equal(await doctor.$eval("#queueSelect", (select) => select.value), screeningId);
  await doctor.waitForFunction(() => !document.querySelector("#openFundusBtn").hidden);
  await doctor.click("#openFundusBtn");
  assert.equal(await doctor.$eval("#fundusDialog", (dialog) => dialog.open), true);
  await doctor.click("#closeFundusBtn");
  await setField(doctor, "#comments", "E2E review of test image; not clinical advice.");
  await setField(doctor, "#patientGuidance", "E2E test: discuss this draft with a clinician.");
  await doctor.click("#reviewSubmit");
  await waitForText(doctor, "#reviewStatus", /Review finalized/);
  await setField(doctor, "#dietPlanText", "- E2E test plan; replace after clinical assessment.");
  await doctor.click("#saveDietPlanBtn");
  await waitForText(doctor, "#dietPlanStatus", /saved for the patient/);
  await allowDownloads(doctor, testDirectory);
  await doctor.click("#downloadBtn");
  await waitForPdf(testDirectory, `icare-doctor-${screeningId}`);
  console.log("Doctor access, photo enlargement, review, diet update, and PDF passed.");

  const reviewedResponse = await (await fetch(`${apiBase}/screenings/${screeningId}`)).json();
  assert.equal(reviewedResponse.screening.status, "reviewed");
  assert.match(reviewedResponse.screening.review.patientGuidance, /E2E test/);
  assert.match(reviewedResponse.screening.dietPlan.text, /E2E test plan/);
  await Promise.race([browser.close(), sleep(15_000)]);
  if (browser.process()?.exitCode === null) browser.process().kill();
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 120_000 });
  const refreshedPatient = await browser.newPage();
  refreshedPatient.setDefaultNavigationTimeout(120_000);
  await refreshedPatient.goto(`http://127.0.0.1:${patientPort}/`, { waitUntil: "domcontentloaded" });
  await refreshedPatient.waitForFunction(() => document.documentElement.dataset.icareReady === "true");
  await setField(refreshedPatient, "#phone", phone);
  await refreshedPatient.click("#requestOtpBtn");
  await waitForText(refreshedPatient, "#otpStatus", /123456/);
  await setField(refreshedPatient, "#otp", "123456");
  await refreshedPatient.click("#loginForm button[type=submit]");
  await refreshedPatient.waitForFunction(() => !document.querySelector("#dashboard").classList.contains("hidden"));
  await refreshedPatient.waitForFunction(() => document.querySelector("#guidanceText").textContent.includes("E2E test"));
  assert.match(await refreshedPatient.$eval("#patientDietPlan", (element) => element.textContent), /E2E test plan/);
  await allowDownloads(refreshedPatient, testDirectory);
  await refreshedPatient.click("#downloadBtn");
  await waitForPdf(testDirectory, `icare-patient-${screeningId}`);
  console.log("Patient site reflects the doctor review and diet change. Full E2E passed.");
}

try {
  await main();
} catch (error) {
  console.error(error);
  for (const { name, log } of children) console.error(`${name} log:\n${log.join("").slice(-2000)}`);
  process.exitCode = 1;
} finally {
  if (browser) {
    await Promise.race([browser.close(), sleep(15_000)]);
    if (browser.process()?.exitCode === null) browser.process().kill();
  }
  for (const { child } of children.reverse()) {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([new Promise((resolve) => child.once("exit", resolve)), sleep(10_000)]);
    }
  }
  if (testDirectory) {
    const resolved = path.resolve(testDirectory);
    const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(temporaryRoot)) throw new Error("Refusing to remove E2E files outside the temp directory.");
    await rm(resolved, { recursive: true, force: true });
  }
}

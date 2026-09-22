import { createReportPdf, downloadPdf, openPdfForPrint, preparePdfWindow } from "../../shared/report-pdf.js";
import { availableModelVisuals } from "../../shared/model-visuals.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
try {
  if (sessionStorage.getItem("icare.dataReset") !== "2026-09-18") {
    sessionStorage.removeItem("icare.session");
    sessionStorage.removeItem("icare.lastScreeningId");
    sessionStorage.setItem("icare.dataReset", "2026-09-18");
  }
} catch { /* storage unavailable */ }
      const state = { patient: null, screening: null, result: null };
      let selectedPhotos = [];
      let uploadedImagePaths = [];
      let previewUrl = null;
      const $ = (id) => document.getElementById(id);

      function escapeHtml(value) {
        return String(value).replace(
          /[&<>"']/g,
          (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
        );
      }

      function setMessage(message, type = "info") {
        $("messages").innerHTML =
          `<div class="notice ${type === "error" ? "error" : ""}">${escapeHtml(message)}</div>`;
      }

      function withBusy(button, label, task) {
        const original = button.textContent;
        button.dataset.busy = "true";
        button.disabled = true;
        if (label) button.textContent = label;
        return Promise.resolve()
          .then(task)
          .finally(() => {
            delete button.dataset.busy;
            button.disabled = false;
            button.textContent = original;
          });
      }

      function markInvalid(input, invalid) {
        input.setAttribute("aria-invalid", invalid ? "true" : "false");
      }

      async function api(path, options = {}) {
        const { timeoutMs = 30000, ...rest } = options;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let response;
        try {
          response = await fetch(`${API_BASE}${path}`, {
            headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) },
            signal: controller.signal,
            ...rest
          });
        } catch (error) {
          throw new Error(
            error.name === "AbortError"
              ? "The request timed out. Saved screening results remain available after reloading."
              : `Cannot reach the backend at ${API_BASE}. Start it with npm run dev:backend.`
          );
        } finally {
          clearTimeout(timer);
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || payload.error || `Request failed: ${response.status}`);
        return payload;
      }

      function fileToBase64(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => {
            const value = String(reader.result ?? "");
            resolve(value.includes(",") ? value.split(",").pop() : value);
          });
          reader.addEventListener("error", () => reject(new Error("Could not read the selected image.")));
          reader.readAsDataURL(file);
        });
      }

      async function uploadSelectedFundusImage() {
        const files = selectedPhotos;
        if (!files.length) {
          if (uploadedImagePaths.length) return uploadedImagePaths;
          throw new Error("Upload a clear fundus image before running AI screening.");
        }
        if (files.length > 6) throw new Error("Choose no more than six fundus photos.");
        const imagePaths = [];
        for (const file of files) {
          const uploaded = await api("/uploads/fundus", {
            method: "POST",
            timeoutMs: 120000,
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type || "application/octet-stream",
              dataBase64: await fileToBase64(file)
            })
          });
          imagePaths.push(uploaded.imagePath);
        }
        $("imagePath").value = imagePaths[0];
        uploadedImagePaths = imagePaths;
        $("uploadMeta").textContent = `${files.length} photo${files.length === 1 ? "" : "s"} uploaded`;
        return imagePaths;
      }

      async function checkBackend({ quiet = false } = {}) {
        try {
          await api("/health", { timeoutMs: 8000 });
          $("apiStatus").textContent = "System online";
          $("apiStatus").classList.add("ok");
          $("retryBackendBtn").hidden = true;
          return true;
        } catch {
          $("apiStatus").textContent = "System unavailable";
          $("apiStatus").classList.remove("ok");
          $("retryBackendBtn").hidden = false;
          if (!quiet) setMessage("Start the backend with npm run dev:backend before using the UI.", "error");
          return false;
        }
      }

      $("retryBackendBtn").addEventListener("click", (event) =>
        withBusy(event.currentTarget, "Checking...", () => checkBackend())
      );

      setInterval(() => checkBackend({ quiet: true }), 30000);

      function showWorkerScreen(screen) {
        $("patientLookupPanel").hidden = screen !== "lookup";
        $("createPatientPanel").hidden = screen !== "details";
        $("screeningPanel").hidden = screen !== "screening";
        $("patientMatchStatus").hidden = screen === "lookup";
      }

      const routeTitles = {
        patients: ["Patient Lookup", "Find an existing patient or create a new patient record."],
        details: ["Patient Details", "Complete the patient information before starting a screening."],
        screening: ["Retinal Screening", "Upload a fundus image and run the AI-assisted screening."],
        result: ["Latest AI Result", "Review the most recent screening result and referral guidance."],
        reports: ["Medical Reports", "Open the patient-friendly and clinical screening reports."]
      };

      function currentRoute() {
        const route = location.hash.replace(/^#\/?/, "");
        return routeTitles[route] ? route : "patients";
      }

      function renderRoute() {
        if ($("appShell").hidden) return;
        const route = currentRoute();
        const isPatientStep = route === "patients" || route === "details" || route === "screening";
        $("appShell").classList.remove("lookup-only");
        $("workerView").hidden = !isPatientStep;
        $("result").hidden = route !== "result";
        $("medicalReports").hidden = route !== "reports";
        if (route === "patients") showWorkerScreen("lookup");
        if (route === "details") showWorkerScreen("details");
        if (route === "screening") showWorkerScreen("screening");
        const [title, subtitle] = routeTitles[route];
        $("roleTitle").textContent = title;
        $("roleSubtitle").textContent = subtitle;
        document.title = `${title} | ICare`;
        document.querySelectorAll("nav [data-route]").forEach((link) => {
          if (link.dataset.route === route) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        });
        $("mainContent").focus({ preventScroll: true });
      }

      function navigate(route, { replace = false } = {}) {
        const hash = `#/${route}`;
        if (replace) history.replaceState(null, "", hash);
        else if (location.hash !== hash) history.pushState(null, "", hash);
        renderRoute();
      }

      window.addEventListener("hashchange", renderRoute);

      function resetResultView() {
        $("result").hidden = true;
        $("confidence").textContent = "-";
        $("risk").textContent = "-";
        $("quality").textContent = "-";
        $("reviewNeeded").textContent = "-";
        $("patientReportBtn").disabled = true;
        $("doctorReportBtn").disabled = true;
        $("patientPrintBtn").disabled = true;
        $("doctorPrintBtn").disabled = true;
        $("patientReportStatus").textContent = "Waiting";
        $("doctorReportStatus").textContent = "Waiting";
      }

      $("loginForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const emailInput = $("loginEmail");
        const passwordInput = $("loginPassword");
        const problems = [];
        if (!emailInput.checkValidity()) problems.push("Enter a valid email address.");
        if (!passwordInput.checkValidity()) problems.push("Enter your password.");
        markInvalid(emailInput, !emailInput.checkValidity());
        markInvalid(passwordInput, !passwordInput.checkValidity());
        const loginError = $("loginError");
        if (problems.length > 0) {
          loginError.hidden = false;
          loginError.textContent = problems.join(" ");
          (emailInput.checkValidity() ? passwordInput : emailInput).focus();
          return;
        }
        let session;
        try {
          session = await api("/auth/staff/login", {
            method: "POST",
            body: JSON.stringify({ role: "worker", email: emailInput.value.trim(), password: passwordInput.value })
          });
        } catch (error) {
          loginError.hidden = false;
          loginError.textContent = error.message === "INVALID_CREDENTIALS" ? "Email or password is incorrect." : error.message;
          return;
        }
        loginError.hidden = true;
        passwordInput.value = "";
        $("entryScreen").hidden = true;
        $("appShell").hidden = false;
        $("loggedInRole").textContent = "Healthcare Worker";
        try {
          sessionStorage.setItem("icare.session", JSON.stringify(session));
        } catch {
          /* storage unavailable - session simply is not remembered */
        }
        navigate("patients", { replace: true });
        setMessage("Signed in as a healthcare worker.");
      });

      $("patientForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          const phone = $("phone").value.trim();
          const name = $("fullName").value.trim();
          const search = await api(`/patients/search?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name)}`);
          const candidates = search.candidates ?? [];
          if (candidates.length > 0) {
            selectPatient(candidates[0], "Existing patient found. Proceed to screening.");
          } else {
            navigate("details");
            $("patientMatchStatus").hidden = false;
            $("patientMatchStatus").textContent = "No matching patient found. Enter DOB and sex, then create user.";
            setMessage("No matching user found. Complete the required details to create a new patient.");
          }
        } catch (error) {
          setMessage(error.message, "error");
        }
      });

      $("createPatientBtn").addEventListener("click", async () => {
        try {
          const patient = await api("/patients", {
            method: "POST",
            body: JSON.stringify({
              fullName: $("fullName").value.trim(),
              phone: $("phone").value.trim(),
              dateOfBirth: $("dateOfBirth").value || undefined
            })
          });
          patient.sex = document.querySelector('input[name="sex"]:checked')?.value ?? "";
          patient.notes = $("patientNotes").value.trim();
          selectPatient(patient, "New patient created. Proceed to screening.");
        } catch (error) {
          setMessage(error.message, "error");
        }
      });

      $("backToLookupBtn").addEventListener("click", () => {
        navigate("patients");
        $("fullName").focus();
      });

      $("backFromScreeningBtn").addEventListener("click", () => {
        navigate("patients");
        $("fullName").focus();
      });

      function renderSelectedPhotos() {
        const file = selectedPhotos[0];
        $("uploadTitle").textContent = file ? selectedPhotos.length === 1 ? file.name : `${selectedPhotos.length} fundus photos selected` : "Select fundus image";
        $("uploadMeta").textContent = file
          ? `${Math.round(selectedPhotos.reduce((size, item) => size + item.size, 0) / 1024)} KB total`
          : "PNG, JPG, TIF, TIFF, or GIF retinal photo";
        $("photoList").replaceChildren(...selectedPhotos.map((item, index) => {
          const name = document.createElement("span");
          name.textContent = `${index + 1}. ${item.name}`;
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "remove-photo";
          remove.textContent = "Remove";
          remove.setAttribute("aria-label", `Remove ${item.name}`);
          remove.addEventListener("click", (event) => {
            event.preventDefault();
            selectedPhotos.splice(index, 1);
            uploadedImagePaths = [];
            $("imagePath").value = "";
            renderSelectedPhotos();
          });
          name.append(remove);
          return name;
        }));
        const preview = $("photoPreview");
        const fallback = $("filePreviewFallback");
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        const canPreview = file && ["image/png", "image/jpeg", "image/gif"].includes(file.type);
        if (canPreview) {
          previewUrl = URL.createObjectURL(file);
          preview.src = previewUrl;
          preview.hidden = false;
          fallback.hidden = true;
        } else {
          preview.removeAttribute("src");
          preview.hidden = true;
          fallback.textContent = file ? `${file.name} selected. Preview is not available for this format.` : "";
          fallback.hidden = !file;
        }
      }

      $("fundusPhoto").addEventListener("change", (event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (!files.length) return;
        if (selectedPhotos.length + files.length > 6) {
          setMessage("Choose no more than six fundus photos.", "error");
          return;
        }
        selectedPhotos.push(...files);
        uploadedImagePaths = [];
        $("imagePath").value = "";
        renderSelectedPhotos();
      });

      function selectPatient(patient, message) {
        state.patient = patient;
        state.screening = null;
        state.result = null;
        selectedPhotos = [];
        uploadedImagePaths = [];
        $("fundusPhoto").value = "";
        $("imagePath").value = "";
        renderSelectedPhotos();
        try { sessionStorage.removeItem("icare.lastScreeningId"); } catch { /* storage unavailable */ }
        $("patientId").value = patient.patientId;
        $("processBtn").disabled = false;
        resetResultView();
        $("patientMatchStatus").hidden = false;
        $("patientMatchStatus").textContent = `${message} Patient ID: ${patient.patientId}`;
        navigate("screening");
        setMessage(message);
        void loadLatestScreening(patient.patientId);
      }

      function rememberScreening(id) {
        try {
          sessionStorage.setItem("icare.lastScreeningId", id);
        } catch {
          /* recovery remains available after selecting the patient again */
        }
      }

      function lastScreeningId() {
        try {
          return sessionStorage.getItem("icare.lastScreeningId") ?? state.screening?.id;
        } catch {
          return state.screening?.id;
        }
      }

      async function loadLatestScreening(patientId) {
        try {
          const found = await api(`/patients/${encodeURIComponent(patientId)}/screenings/latest`, { timeoutMs: 15000 });
          if (state.patient?.patientId !== patientId || state.screening) return;
          state.screening = found.screening;
          rememberScreening(found.screening.id);
          if (found.screening.status === "completed") {
            setMessage("A completed screening is saved in this patient's profile.");
          } else if (found.screening.status === "processing") {
            setMessage("A screening is still processing. The result will appear automatically.");
            void waitForScreening(found.screening.id).catch((error) => setMessage(error.message, "error"));
          }
        } catch {
          /* no previous screening is normal for a new patient */
        }
      }

      function showSavedScreening(found) {
        state.patient = found.patient ?? state.patient;
        state.screening = found.screening;
        state.result = found;
        if (found.patient) {
          $("patientId").value = found.patient.patientId;
          $("fullName").value = found.patient.fullName;
          $("phone").value = found.patient.phone;
        }
        renderResult(found);
        navigate("result");
        const succeeded = found.screening.status === "completed" || found.screening.status === "reviewed";
        setMessage(succeeded ? "AI screening completed." : "AI screening failed. Review the quality guidance.",
          succeeded ? "info" : "error");
      }

      async function waitForScreening(id) {
        const deadline = Date.now() + 16 * 60 * 1000;
        while (Date.now() < deadline) {
          if (currentRoute() === "patients") return;
          if (state.screening?.id && state.screening.id !== id) return;
          const found = await api(`/screenings/${encodeURIComponent(id)}`, { timeoutMs: 15000 });
          if (currentRoute() === "patients") return;
          if (state.screening?.id && state.screening.id !== id) return;
          state.screening = found.screening;
          if (found.screening.status === "completed" || found.screening.status === "failed" || found.screening.status === "reviewed") {
            showSavedScreening(found);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        setMessage("Screening is still processing. Return to this patient later to resume tracking.");
      }

      $("screeningForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        $("processBtn").disabled = true;
        $("processBtn").textContent = "Running MATLAB AI...";
        setMessage("Uploading photo and starting MATLAB AI. The saved result will appear when processing finishes.");
        try {
          const imagePaths = await uploadSelectedFundusImage();
          const screening = await api("/screenings", {
            method: "POST",
            body: JSON.stringify({
              patientId: $("patientId").value.trim(),
              imagePath: imagePaths[0],
              imagePaths,
              capturedBy: $("capturedBy").value.trim()
            })
          });
          state.screening = screening;
          rememberScreening(screening.id);
          const started = await api(`/screenings/${screening.id}/process`, { method: "POST", timeoutMs: 15000 });
          state.screening = started.screening;
          setMessage("MATLAB is processing. The result is saved even if this page is reloaded.");
          await waitForScreening(screening.id);
        } catch (error) {
          setMessage(error.message, "error");
        } finally {
          $("processBtn").disabled = state.screening?.status === "processing";
          $("processBtn").textContent = "Run AI Screening";
        }
      });

      $("viewReportsBtn").addEventListener("click", () => navigate("reports"));
      $("resultHomeBtn").addEventListener("click", () => navigate("patients"));
      $("backToHomeBtn").addEventListener("click", () => navigate("patients"));

      function renderResult(processed) {
        const result = processed.result;
        const primary = result.classification?.primary;
        $("result").hidden = false;
        if (result.status !== "completed" || !primary) {
          $("resultTitle").textContent = "AI screening failed";
          $("resultSubtitle").textContent = result.error || "MATLAB did not return a classification result.";
          $("confidence").textContent = "-";
          $("risk").textContent = "-";
          if (result.quality?.guidance?.length) {
            $("quality").textContent = result.quality.guidance.join(", ");
          } else if (result.quality?.acceptable === false) {
            $("quality").textContent = "Needs recapture";
          } else {
            $("quality").textContent = "-";
          }
          $("reviewNeeded").textContent = "Yes";
          $("patientReportBtn").disabled = true;
          $("doctorReportBtn").disabled = true;
          $("patientPrintBtn").disabled = true;
          $("doctorPrintBtn").disabled = true;
          $("patientReportStatus").textContent = "Unavailable";
          $("doctorReportStatus").textContent = "Unavailable";
          return;
        }
        $("resultTitle").textContent = `${primary.severity} - Grade ${primary.predictedGrade}`;
        $("resultSubtitle").textContent = `Primary model: ${result.classification.primaryModel} | Screening ${processed.screening.status}`;
        $("confidence").textContent = `${Math.round(primary.confidence * 100)}%`;
        $("risk").textContent = primary.risk.replaceAll("_", " ");
        $("quality").textContent = result.quality.acceptable ? "Acceptable" : "Needs recapture";
        $("reviewNeeded").textContent = result.safety.requiresClinicalReview ? "Yes" : "No";
        $("patientReportBtn").disabled = false;
        $("doctorReportBtn").disabled = false;
        $("patientPrintBtn").disabled = false;
        $("doctorPrintBtn").disabled = false;
        $("patientReportStatus").textContent = "AI draft";
        $("doctorReportStatus").textContent = "AI draft";
      }

      function formatPercent(value) {
        if (typeof value !== "number" || Number.isNaN(value)) return "-";
        return `${(value * 100).toFixed(2)}%`;
      }

      function reportFileName(type) {
        const patientId = state.patient?.patientId ?? $("patientId").value.trim() ?? "patient";
        const date = new Date().toISOString().slice(0, 10);
        return `icare-${type}-ai-draft-${patientId}-${date}.pdf`;
      }

      async function buildReportHtml(type) {
        const processed = state.result;
        if (!processed?.result?.classification?.primary) {
          throw new Error("Run AI screening before downloading reports.");
        }
        const patient = state.patient ?? {};
        const screening = processed.screening ?? state.screening ?? {};
        const result = processed.result;
        const primary = result.classification.primary;
        const isDoctor = type === "doctor";
        let fundusImage = "";
        if (isDoctor) {
          const response = await fetch(`${API_BASE}/screenings/${encodeURIComponent(screening.id)}/image`);
          if (!response.ok) throw new Error("The original fundus image is unavailable for the doctor report.");
          const blob = await response.blob();
          fundusImage = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Could not read the fundus image."));
            reader.readAsDataURL(blob);
          });
        }
        const title = isDoctor ? "ICare Doctor AI Draft" : "ICare Patient AI Draft";
        const referral = primary.risk.replaceAll("_", " ");
        const generatedAt = new Date().toLocaleString();
        const rows = [
          ["Patient ID", patient.patientId ?? screening.patientId ?? "-"],
          ["Patient name", patient.fullName ?? $("fullName").value.trim() ?? "-"],
          ["Phone", patient.phone ?? $("phone").value.trim() ?? "-"],
          ["Screening ID", screening.id ?? "-"],
          ["Captured by", screening.capturedBy ?? $("capturedBy").value.trim() ?? "-"],
          ["Generated at", generatedAt]
        ];
        const clinicalRows = [
          ["Result", `${primary.severity} - Grade ${primary.predictedGrade}`],
          ["Confidence", `${Math.round(primary.confidence * 100)}%`],
          ["Referral guidance", referral],
          ["Image quality", result.quality?.acceptable ? "Acceptable" : "Needs recapture"],
          ["Clinical review required", result.safety?.requiresClinicalReview ? "Yes" : "No"]
        ];
        const patientRows = [
          ["AI screening", `${primary.severity} - Grade ${primary.predictedGrade}`],
          ["Image quality", result.quality?.acceptable ? "Image accepted for AI screening" : "Ask the healthcare worker about recapture"],
          ["Next step", "Take this report to a doctor of your choice for a clinical review."]
        ];
        const doctorOnly = isDoctor ? `
          <section>
            <h2>Original Fundus Image</h2>
            <img src="${fundusImage}" alt="Original fundus image" style="display: block; max-width: 100%; max-height: 700px; object-fit: contain; background: #111;" />
          </section>
          <section>
            <h2>Model Details</h2>
            <table>
              <tr><th>Primary model</th><td>${escapeHtml(result.classification.primaryModel ?? "-")}</td></tr>
              <tr><th>Model version</th><td>${escapeHtml(result.modelVersion ?? "-")}</td></tr>
              ${["resnet50", "mobilenetv2"].map((key) => {
                const model = result.classification[key];
                return model ? `<tr><th>${escapeHtml(key)}</th><td>Grade ${escapeHtml(model.predictedGrade ?? "-")} | confidence ${escapeHtml(typeof model.confidence === "number" ? `${Math.round(model.confidence * 100)}%` : "-")} | ${escapeHtml(model.status ?? "-")}</td></tr>` : "";
              }).join("")}
              <tr><th>Safety note</th><td>AI-assisted screening support only. Final diagnosis must be clinically verified.</td></tr>
            </table>
          </section>
          <section>
            <h2>Segmentation Summary</h2>
            <table>
              ${Object.entries(result.segmentation ?? {}).map(([key, value]) => {
                const fraction = typeof value?.foregroundFraction === "number" ? `${(value.foregroundFraction * 100).toFixed(2)}%` : "-";
                const status = value?.status ?? "-";
                return `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(status)} | ${escapeHtml(fraction)} foreground | ${escapeHtml(value?.note ?? "")}</td></tr>`;
              }).join("") || "<tr><td>No segmentation output available.</td></tr>"}
            </table>
          </section>
        ` : `
          <section class="notice">
            <h2>What this means</h2>
            <p>Your retinal screening needs doctor review. Please follow the healthcare worker or doctor guidance for the next step.</p>
          </section>
        `;
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #173834; background: #f6fbfa; }
    header, section { background: #fff; border: 1px solid #cde4e0; border-radius: 16px; padding: 20px; margin-bottom: 18px; }
    h1, h2 { margin: 0 0 12px; }
    p { color: #52677a; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #e4efed; vertical-align: top; }
    th { width: 220px; color: #296d66; }
    .result { color: #c2410c; font-size: 24px; font-weight: 800; }
    .notice { background: #eef8f7; }
    @media print { body { background: #fff; } button { display: none; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <p>Unreviewed AI screening draft. The patient may choose a doctor, who must obtain patient OTP approval before accessing the digital report.</p>
    <div class="result">${escapeHtml(`${primary.severity} - Grade ${primary.predictedGrade}`)}</div>
  </header>
  <section>
    <h2>Patient and Screening</h2>
    <table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
  </section>
  <section>
    <h2>Screening Result</h2>
    <table>${(isDoctor ? clinicalRows : patientRows).map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join("")}</table>
  </section>
  ${doctorOnly}
</body>
</html>`;
      }

      async function downloadReport(type) {
        downloadPdf(await buildReportPdf(type), reportFileName(type));
      }

      async function buildReportPdf(type) {
        const screening = state.result?.screening ?? state.screening;
        if (!screening?.result?.classification?.primary) throw new Error("Run AI screening before creating a report.");
        const count = screening.imagePaths?.length || 1;
        const images = [];
        for (let index = 0; index < count; index++) {
          const response = await fetch(`${API_BASE}/screenings/${encodeURIComponent(screening.id)}/image?index=${index}`);
          if (!response.ok) throw new Error(`Photo ${index + 1} is unavailable; the report would be incomplete.`);
          images.push({ bytes: await response.arrayBuffer(), mimeType: response.headers.get("content-type") ?? "image/jpeg" });
        }
        let screenings = [screening];
        const patient = state.patient ?? state.result?.patient;
        if (patient?.patientId && patient?.phone) {
          try {
            const history = await api(`/patients/${encodeURIComponent(patient.patientId)}/screenings?phone=${encodeURIComponent(patient.phone)}`);
            screenings = history.screenings ?? screenings;
          } catch { /* the current report is still printable without history */ }
        }
        const modelImages = [];
        if (type === "doctor") {
          for (const visual of availableModelVisuals(screening.result)) {
            const response = await fetch(`${API_BASE}/screenings/${encodeURIComponent(screening.id)}/model-image/${encodeURIComponent(visual.key)}`);
            if (response.ok) modelImages.push({ ...visual, bytes: await response.arrayBuffer() });
          }
        }
        return createReportPdf({ audience: type, patient, screening, screenings, images, modelImages });
      }

      async function printReport(type) {
        const reportWindow = window.open("", "_blank");
        if (!reportWindow) throw new Error("Allow pop-ups to open the printable PDF.");
        preparePdfWindow(reportWindow);
        try { openPdfForPrint(await buildReportPdf(type), reportWindow); }
        catch (error) { reportWindow.close(); throw error; }
      }

      $("patientPrintBtn").addEventListener("click", async () => {
        try { await printReport("patient"); } catch (error) { setMessage(error.message, "error"); }
      });
      $("doctorPrintBtn").addEventListener("click", async () => {
        try { await printReport("doctor"); } catch (error) { setMessage(error.message, "error"); }
      });

      $("patientReportBtn").addEventListener("click", async () => {
        try {
          await downloadReport("patient");
          navigate("reports");
          setMessage("Patient report downloaded.");
        } catch (error) {
          setMessage(error.message, "error");
        }
      });

      $("doctorReportBtn").addEventListener("click", async () => {
        try {
          await downloadReport("doctor");
          navigate("reports");
          setMessage("Doctor report downloaded.");
        } catch (error) {
          setMessage(error.message, "error");
        }
      });

      function goHome() {
        state.patient = null;
        state.screening = null;
        state.result = null;
        try {
          sessionStorage.removeItem("icare.session");
          sessionStorage.removeItem("icare.lastScreeningId");
        } catch {
          /* storage unavailable - nothing to clear */
        }
        $("appShell").hidden = true;
        $("entryScreen").hidden = false;
        $("messages").innerHTML = "";
        navigate("patients", { replace: true });
        $("loginEmail").focus();
      }

      $("logoutBtn").addEventListener("click", goHome);

      function closeProfileMenu() {
        $("profileMenu").hidden = true;
        $("profileBtn").setAttribute("aria-expanded", "false");
      }

      $("profileBtn").addEventListener("click", () => {
        const open = $("profileMenu").hidden;
        $("profileMenu").hidden = !open;
        $("profileBtn").setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", (event) => {
        if (!event.target.closest(".worker-account")) closeProfileMenu();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeProfileMenu();
      });

      async function resumeSavedScreening(id) {
        try {
          const found = await api(`/screenings/${encodeURIComponent(id)}`, { timeoutMs: 15000 });
          if (currentRoute() === "patients") return;
          state.screening = found.screening;
          if (found.screening.status === "processing") {
            setMessage("MATLAB is processing. The result will appear automatically.");
            await waitForScreening(id);
          } else if (found.result) {
            showSavedScreening(found);
          }
        } catch (error) {
          setMessage(error.message, "error");
        }
      }

      function restoreSession() {
        let saved = null;
        try {
          saved = JSON.parse(sessionStorage.getItem("icare.session") ?? "null");
        } catch {
          saved = null;
        }
        if (saved?.role !== "worker" || !saved.email || !saved.token) return;
        $("entryScreen").hidden = true;
        $("appShell").hidden = false;
        $("loggedInRole").textContent = "Healthcare Worker";
        navigate(currentRoute(), { replace: true });
        const id = lastScreeningId();
        if (id && currentRoute() !== "patients") void resumeSavedScreening(id);
      }

      restoreSession();
      checkBackend();
      document.documentElement.dataset.icareReady = "true";

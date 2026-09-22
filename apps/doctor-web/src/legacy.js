import { renderGradeTrend } from "../../shared/grade-trend.js";
import { createReportPdf, downloadPdf, openPdfForPrint, preparePdfWindow } from "../../shared/report-pdf.js";
import { availableModelVisuals, explainModelVisual } from "../../shared/model-visuals.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
try {
  if (sessionStorage.getItem("icare.dataReset") !== "2026-09-18") {
    sessionStorage.removeItem("icare.doctor.session");
    sessionStorage.setItem("icare.dataReset", "2026-09-18");
  }
} catch { /* storage unavailable */ }
      const $ = (id) => document.getElementById(id);
      const SESSION_KEY = "icare.doctor.session";

      function markInvalid(input) {
        input.setAttribute("aria-invalid", input.checkValidity() ? "false" : "true");
      }

      function store(key, value) {
        try {
          if (value === null) sessionStorage.removeItem(key);
          else sessionStorage.setItem(key, value);
        } catch {
          /* storage unavailable - session simply is not remembered */
        }
      }

      function read(key) {
        try {
          return sessionStorage.getItem(key);
        } catch {
          return null;
        }
      }

      function doctorId() {
        try { return JSON.parse(read(SESSION_KEY) ?? "null")?.email ?? ""; }
        catch { return ""; }
      }

      async function checkBackend() {
        const pill = $("apiStatus");
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`${API_BASE}/health`, { signal: controller.signal });
          clearTimeout(timer);
          if (!response.ok) throw new Error("bad status");
          await response.json();
          pill.textContent = "System online";
          pill.classList.add("ok");
        } catch {
          pill.textContent = "System unavailable";
          pill.classList.remove("ok");
        }
      }

      let reviewQueue = [];
      let accessRequestId = null;
      let accessToken = null;
      let authorizedPatientId = null;
      let imageUrls = [];
      let modelImageUrls = [];

      async function loadModelVisuals(screening) {
        for (const url of modelImageUrls) URL.revokeObjectURL(url);
        modelImageUrls = [];
        const gallery = $("modelVisuals");
        gallery.replaceChildren();
        $("visualStatus").textContent = "Loading image explanations...";
        for (const visual of availableModelVisuals(screening.result)) {
          const response = await fetch(`${API_BASE}/doctor/screenings/${encodeURIComponent(screening.id)}/model-image/${encodeURIComponent(visual.key)}`, {
            headers: { Authorization: `Bearer ${accessToken}`, "X-Doctor-Id": doctorId() }
          });
          if (!response.ok) continue;
          const url = URL.createObjectURL(await response.blob());
          if ($("queueSelect").value !== screening.id) { URL.revokeObjectURL(url); return; }
          modelImageUrls.push(url);
          const figure = document.createElement("figure");
          const button = document.createElement("button");
          const image = document.createElement("img");
          const caption = document.createElement("figcaption");
          button.type = "button";
          button.setAttribute("aria-label", `Enlarge ${visual.name} ${visual.kind === "gradcam" ? "Grad-CAM" : "overlay"}`);
          image.src = url;
          image.alt = `${visual.name} ${visual.kind === "gradcam" ? "Grad-CAM" : "segmentation overlay"}`;
          caption.textContent = `${visual.name}. ${explainModelVisual(visual)}${visual.note ? ` ${visual.note}` : ""}`;
          button.append(image);
          button.addEventListener("click", () => {
            $("fundusLargeImage").src = url;
            $("fundusLargeImage").alt = image.alt;
            $("fundusDialog").showModal();
          });
          figure.append(button, caption);
          gallery.append(figure);
        }
        $("visualStatus").textContent = gallery.children.length ? "Select an image to enlarge it." : "No model images are available for this screening.";
      }

      async function loadFundusImages(screening) {
        for (const url of imageUrls) URL.revokeObjectURL(url);
        imageUrls = [];
        $("fundusImage").hidden = true;
        $("openFundusBtn").hidden = true;
        $("fundusThumbnails").replaceChildren();
        const count = screening.imagePaths?.length || 1;
        for (let index = 0; index < count; index++) {
          const response = await fetch(`${API_BASE}/doctor/screenings/${encodeURIComponent(screening.id)}/image?index=${index}`, {
            headers: { Authorization: `Bearer ${accessToken}`, "X-Doctor-Id": doctorId() }
          });
          if (!response.ok) continue;
          const url = URL.createObjectURL(await response.blob());
          if ($("queueSelect").value !== screening.id) { URL.revokeObjectURL(url); return; }
          imageUrls.push(url);
          const button = document.createElement("button");
          button.type = "button";
          button.className = "fundus-thumb";
          button.textContent = `Photo ${index + 1}`;
          button.addEventListener("click", () => {
            $("fundusImage").src = url;
            $("fundusLargeImage").src = url;
            $("fundusThumbnails").querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
          });
          $("fundusThumbnails").append(button);
        }
        if (!imageUrls.length) return;
        $("fundusImage").src = imageUrls[0];
        $("fundusLargeImage").src = imageUrls[0];
        $("fundusImage").hidden = false;
        $("openFundusBtn").hidden = false;
        $("fundusThumbnails").firstElementChild?.setAttribute("aria-pressed", "true");
      }

      function renderPreviousScreeningsList(selectedId) {
        const list = $("previousScreeningsList");
        list.replaceChildren();
        reviewQueue.forEach((entry, index) => {
          const li = document.createElement("li");
          const button = document.createElement("button");
          button.type = "button";
          const isSelected = entry.screening.id === selectedId;
          button.setAttribute("aria-current", String(isSelected));
          button.textContent = `${new Date(entry.screening.createdAt).toLocaleString()}${index === 0 ? " (most recent)" : ""}`;
          button.addEventListener("click", () => {
            $("queueSelect").value = entry.screening.id;
            renderSelectedScreening();
          });
          li.append(button);
          list.append(li);
        });
        $("previousScreeningBtn").disabled = reviewQueue.length === 0;
      }

      function closePreviousScreeningsPanel() {
        $("previousScreeningsPanel").hidden = true;
        $("previousScreeningBtn").setAttribute("aria-expanded", "false");
      }

      function renderSelectedScreening() {
        const item = reviewQueue.find((entry) => entry.screening.id === $("queueSelect").value);
        $("reviewSubmit").disabled = !item || item.screening.status !== "completed";
        $("saveDietPlanBtn").disabled = !item;
        $("printBtn").disabled = !item;
        $("downloadBtn").disabled = !item;
        renderPreviousScreeningsList(item?.screening.id);
        $("toggleExplanationsBtn").disabled = !item;
        $("imageExplanationsPanel").hidden = true;
        $("toggleExplanationsBtn").setAttribute("aria-expanded", "false");
        if (!item) {
          $("fundusImage").hidden = true;
          $("openFundusBtn").hidden = true;
          $("findingSummary").textContent = "Authorize a patient to view their report.";
          $("findingMeta").textContent = "";
          $("visualStatus").textContent = "Choose a screening to view image explanations.";
          $("modelVisuals").replaceChildren();
          $("finalGrade").value = "0";
          $("dietPlanText").value = "";
          $("confidenceValue").textContent = "-";
          $("confidenceFill").style.width = "0%";
          renderGradeTrend($("doctorTrend"), []);
          return;
        }
        const { screening, patient } = item;
        const primary = screening.result?.classification?.primary;
        $("findingSummary").textContent = primary
          ? `AI finding: Grade ${primary.predictedGrade} - ${primary.severity}`
          : "AI finding unavailable";
        $("findingMeta").textContent = `${patient?.fullName ?? screening.patientId} (${screening.patientId}) | ${new Date(screening.createdAt).toLocaleString()} | Confidence: ${primary ? Math.round(primary.confidence * 100) + "%" : "-"}`;
        $("finalGrade").value = String(primary?.predictedGrade ?? 0);
        $("comments").value = screening.review?.comments ?? "";
        $("patientGuidance").value = screening.review?.patientGuidance ?? "";
        const activeDietPlan = screening.dietPlan ?? reviewQueue.find((entry) => entry.screening.dietPlan)?.screening.dietPlan;
        $("dietPlanText").value = activeDietPlan?.text ?? "";
        $("dietPlanStatus").textContent = activeDietPlan
          ? `${activeDietPlan.source === "doctor" || activeDietPlan.doctorId ? "Doctor-reviewed" : "General draft - review before personalizing"} | Updated ${new Date(activeDietPlan.updatedAt).toLocaleString()}.`
          : "No diet plan is available yet.";
        const confidence = primary?.confidence;
        $("confidenceValue").textContent = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "-";
        $("confidenceFill").style.width = Number.isFinite(confidence) ? `${Math.max(0, Math.min(100, confidence * 100))}%` : "0%";
        renderGradeTrend($("doctorTrend"), reviewQueue.map((entry) => entry.screening));
        void loadFundusImages(screening).catch(() => { $("fundusImage").hidden = true; });
        void loadModelVisuals(screening).catch(() => { $("modelVisuals").replaceChildren(); $("visualStatus").textContent = "Image explanations could not be loaded."; });
      }

      async function loadQueue() {
        if (!accessToken) return;
        const select = $("queueSelect");
        const previous = select.value;
        try {
          const response = await fetch(`${API_BASE}/doctor/patient-screenings`, {
            headers: { Authorization: `Bearer ${accessToken}`, "X-Doctor-Id": doctorId() }
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not load patient reports.");
          reviewQueue = (data.screenings ?? []).map((screening) => ({ screening, patient: data.patient }));
          select.replaceChildren(new Option(reviewQueue.length ? "Select a screening" : "No completed screenings", ""));
          for (const item of reviewQueue) {
            const label = `${item.patient?.fullName ?? item.screening.patientId} - ${new Date(item.screening.createdAt).toLocaleString()}`;
            select.add(new Option(label, item.screening.id));
          }
          select.disabled = reviewQueue.length === 0;
          select.value = reviewQueue.some((item) => item.screening.id === previous) ? previous : reviewQueue[0]?.screening.id ?? "";
          $("queueStatus").textContent = `${reviewQueue.length} screening${reviewQueue.length === 1 ? "" : "s"} for ${data.patient?.fullName ?? authorizedPatientId}.`;
          renderSelectedScreening();
        } catch (error) {
          reviewQueue = [];
          select.disabled = true;
          select.replaceChildren(new Option("Patient reports unavailable", ""));
          $("queueStatus").textContent = error.message;
          renderSelectedScreening();
        }
      }

      function showDashboard() {
        $("login").classList.add("hidden");
        $("dashboard").classList.remove("hidden");
        $("dashboard").focus();
        checkBackend();
        document.title = "Patient Report | ICare Doctor";
        $("accessStatus").textContent = "Find a patient and request their OTP to view a report.";
      }

      $("loginForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const email = $("email");
        const password = $("password");
        markInvalid(email);
        markInvalid(password);
        const problems = [];
        if (!email.checkValidity()) problems.push("Enter a valid email address.");
        if (!password.checkValidity()) problems.push("Enter your password.");
        const error = $("loginError");
        if (problems.length > 0) {
          error.hidden = false;
          error.textContent = problems.join(" ");
          (email.checkValidity() ? password : email).focus();
          return;
        }
        let session;
        try {
          const response = await fetch(`${API_BASE}/auth/staff/login`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "doctor", email: email.value.trim(), password: password.value })
          });
          session = await response.json();
          if (!response.ok) throw new Error(session.error === "INVALID_CREDENTIALS" ? "Email or password is incorrect." : session.error ?? "Sign-in failed.");
        } catch (failure) {
          error.hidden = false;
          error.textContent = failure.message;
          return;
        }
        error.hidden = true;
        password.value = "";
        store(SESSION_KEY, JSON.stringify(session));
        showDashboard();
      });

      $("logoutBtn").addEventListener("click", () => {
        for (const url of imageUrls) URL.revokeObjectURL(url);
        imageUrls = [];
        for (const url of modelImageUrls) URL.revokeObjectURL(url);
        modelImageUrls = [];
        $("modelVisuals").replaceChildren();
        $("fundusImage").hidden = true;
        accessToken = null;
        accessRequestId = null;
        authorizedPatientId = null;
        reviewQueue = [];
        $("patientChoiceStep").hidden = true;
        $("consentForm").hidden = true;
        store(SESSION_KEY, null);
        $("dashboard").classList.add("hidden");
        $("login").classList.remove("hidden");
        $("email").focus();
      });

      $("openFundusBtn").addEventListener("click", () => {
        $("fundusLargeImage").src = $("fundusImage").src;
        $("fundusLargeImage").alt = "Enlarged fundus image";
        $("fundusDialog").showModal();
      });
      $("closeFundusBtn").addEventListener("click", () => $("fundusDialog").close());

      async function selectedPdf() {
        const item = reviewQueue.find((entry) => entry.screening.id === $("queueSelect").value);
        if (!item) throw new Error("Choose a screening first.");
        const images = [];
        const count = item.screening.imagePaths?.length || 1;
        for (let index = 0; index < count; index++) {
          const response = await fetch(`${API_BASE}/doctor/screenings/${encodeURIComponent(item.screening.id)}/image?index=${index}`, {
            headers: { Authorization: `Bearer ${accessToken}`, "X-Doctor-Id": doctorId() }
          });
          if (!response.ok) throw new Error(`Photo ${index + 1} is unavailable; the report would be incomplete.`);
          images.push({ bytes: await response.arrayBuffer(), mimeType: response.headers.get("content-type") ?? "image/jpeg" });
        }
        const modelImages = [];
        for (const visual of availableModelVisuals(item.screening.result)) {
          const response = await fetch(`${API_BASE}/doctor/screenings/${encodeURIComponent(item.screening.id)}/model-image/${encodeURIComponent(visual.key)}`, {
            headers: { Authorization: `Bearer ${accessToken}`, "X-Doctor-Id": doctorId() }
          });
          if (response.ok) modelImages.push({ ...visual, bytes: await response.arrayBuffer() });
        }
        return createReportPdf({ audience: "doctor", patient: item.patient, screening: item.screening,
          screenings: reviewQueue.map((entry) => entry.screening), images, modelImages });
      }

      $("printBtn").addEventListener("click", async () => {
        const opened = window.open("", "_blank");
        if (!opened) { $("queueStatus").textContent = "Allow pop-ups to open the printable PDF."; return; }
        preparePdfWindow(opened);
        try { openPdfForPrint(await selectedPdf(), opened); }
        catch (error) { opened.close(); $("queueStatus").textContent = error.message; }
      });
      $("downloadBtn").addEventListener("click", async () => {
        try { downloadPdf(await selectedPdf(), `icare-doctor-${$("queueSelect").value}.pdf`); }
        catch (error) { $("queueStatus").textContent = error.message; }
      });

      $("refreshQueueBtn").addEventListener("click", loadQueue);
      $("queueSelect").addEventListener("change", renderSelectedScreening);
      $("toggleExplanationsBtn").addEventListener("click", () => {
        const panel = $("imageExplanationsPanel");
        const expanded = !panel.hidden;
        panel.hidden = expanded;
        $("toggleExplanationsBtn").setAttribute("aria-expanded", String(!expanded));
      });
      $("previousScreeningBtn").addEventListener("click", () => {
        const panel = $("previousScreeningsPanel");
        const expanded = !panel.hidden;
        if (expanded) return closePreviousScreeningsPanel();
        panel.hidden = false;
        $("previousScreeningBtn").setAttribute("aria-expanded", "true");
      });
      document.addEventListener("click", (event) => {
        const panel = $("previousScreeningsPanel");
        // Use composedPath() rather than panel.contains(event.target): selecting a
        // screening rebuilds the list synchronously (replaceChildren), so by the
        // time this bubbles up, event.target may already be detached from the DOM
        // and .contains() would wrongly report "outside" even for a click that
        // originated inside the panel.
        const path = event.composedPath();
        if (!panel.hidden && !path.includes(panel) && !path.includes($("previousScreeningBtn"))) {
          closePreviousScreeningsPanel();
        }
      });

      $("accessForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        accessToken = null;
        accessRequestId = null;
        authorizedPatientId = null;
        reviewQueue = [];
        $("queueSelect").disabled = true;
        $("queueSelect").replaceChildren(new Option("Authorize a patient first", ""));
        $("refreshQueueBtn").disabled = true;
        $("patientChoiceStep").hidden = true;
        $("consentForm").hidden = true;
        renderSelectedScreening();
        const lookup = $("patientLookup").value.trim();
        $("accessStatus").textContent = "Looking up patients...";
        try {
          const response = await fetch(`${API_BASE}/doctor/patient-choices?lookup=${encodeURIComponent(lookup)}`);
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not find patients.");
          const choices = data.patients ?? [];
          const select = $("patientChoice");
          select.replaceChildren(new Option("Select a patient", ""));
          for (const patient of choices) select.add(new Option(`${patient.fullName} (${patient.patientId})`, patient.patientId));
          $("patientChoiceStep").hidden = choices.length === 0;
          $("accessStatus").textContent = choices.length
            ? `Select the correct patient before requesting an OTP. ${choices.length} match${choices.length === 1 ? "" : "es"} found.`
            : "No patient matches that ID or mobile number.";
          if (choices.length) select.focus();
        } catch (error) { $("accessStatus").textContent = error.message; }
      });

      $("sendPatientOtpBtn").addEventListener("click", async () => {
        const patientId = $("patientChoice").value;
        if (!patientId) { $("accessStatus").textContent = "Select a patient first."; $("patientChoice").focus(); return; }
        $("sendPatientOtpBtn").disabled = true;
        $("accessStatus").textContent = "Requesting the patient's OTP...";
        try {
          const response = await fetch(`${API_BASE}/doctor/access-request`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doctorId: doctorId(), patientId })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not request access.");
          accessRequestId = data.accessRequestId;
          authorizedPatientId = data.patientId;
          $("patientChoiceStep").hidden = true;
          $("consentForm").hidden = false;
          $("accessStatus").textContent = "OTP sent to the selected patient's registered mobile. Enter the code they provide.";
          $("patientAccessOtp").focus();
        } catch (error) { $("accessStatus").textContent = error.message; }
        finally { $("sendPatientOtpBtn").disabled = false; }
      });

      $("consentForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
          const response = await fetch(`${API_BASE}/doctor/access-approve`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doctorId: doctorId(), accessRequestId, patientOtp: $("patientAccessOtp").value.trim() })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Patient OTP was not accepted.");
          accessToken = data.accessToken;
          $("patientAccessOtp").value = "";
          $("consentForm").hidden = true;
          $("refreshQueueBtn").disabled = false;
          $("accessStatus").textContent = "Patient access approved for 30 minutes.";
          await loadQueue();
        } catch (error) { $("accessStatus").textContent = error.message; }
      });

      if (doctorId()) showDashboard();

      $("reviewForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const comments = $("comments");
        const guidance = $("patientGuidance");
        const error = $("reviewError");
        const screeningId = $("queueSelect").value;
        if (!screeningId) {
          error.hidden = false;
          error.textContent = "Choose a screening first.";
          $("queueSelect").focus();
          return;
        }
        error.hidden = true;
        $("reviewSubmit").disabled = true;
        try {
          const response = await fetch(`${API_BASE}/screenings/${encodeURIComponent(screeningId)}/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              doctorId: doctorId(),
              finalGrade: Number($("finalGrade").value),
              comments: comments.value.trim(),
              patientGuidance: guidance.value.trim()
            })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Review could not be saved.");
          $("reviewStatus").textContent = "Review finalized. The patient site can now show this result.";
          await loadQueue();
        } catch (failure) {
          error.hidden = false;
          error.textContent = failure.message;
          $("reviewSubmit").disabled = false;
        }
      });

      $("saveDietPlanBtn").addEventListener("click", async () => {
        const screeningId = $("queueSelect").value;
        const text = $("dietPlanText").value.trim();
        if (!screeningId || !text) {
          $("dietPlanStatus").textContent = "Choose a screening and enter the patient-specific plan.";
          return;
        }
        $("saveDietPlanBtn").disabled = true;
        try {
          const response = await fetch(`${API_BASE}/doctor/screenings/${encodeURIComponent(screeningId)}/diet-plan`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ doctorId: doctorId(), text })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Diet plan could not be saved.");
          $("dietPlanStatus").textContent = "Diet plan saved for the patient.";
          await loadQueue();
        } catch (error) {
          $("dietPlanStatus").textContent = error.message;
        } finally {
          $("saveDietPlanBtn").disabled = false;
        }
      });
      document.documentElement.dataset.icareReady = "true";

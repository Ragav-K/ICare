import { renderGradeTrend } from "../../shared/grade-trend.js";
import { createReportPdf, downloadPdf, openPdfForPrint, preparePdfWindow } from "../../shared/report-pdf.js";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
try {
  if (sessionStorage.getItem("icare.dataReset") !== "2026-09-18") {
    sessionStorage.removeItem("icare.patient.session");
    sessionStorage.setItem("icare.dataReset", "2026-09-18");
  }
} catch { /* storage unavailable */ }
      const $ = (id) => document.getElementById(id);
      const SESSION_KEY = "icare.patient.session";

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

      function patientPhone() {
        try { return JSON.parse(read(SESSION_KEY) ?? "null")?.phone ?? null; }
        catch { return null; }
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

      const gradeLabels = ["No apparent DR", "Mild DR", "Moderate DR", "Severe DR", "Proliferative DR"];
      let currentPatient = null;
      let currentScreenings = [];

      function renderScreenings(data) {
        const screenings = data.screenings ?? [];
        const latest = screenings[0];
        currentPatient = data.patient ?? null;
        currentScreenings = screenings;
        const history = $("historyBody");
        history.replaceChildren();
        $("printBtn").disabled = !latest || (latest.status !== "completed" && latest.status !== "reviewed");
        $("downloadBtn").disabled = $("printBtn").disabled;
        renderGradeTrend($("patientTrend"), screenings);
        if (!latest) {
          $("resultSummary").textContent = "No screening is available yet.";
          $("resultGrade").textContent = "-";
          $("reviewedAt").textContent = "-";
          $("guidanceText").textContent = "Doctor guidance will appear after a screening is reviewed.";
          $("patientDietPlan").textContent = "A general draft will appear after screening and can be updated by your doctor.";
          $("confidenceValue").textContent = "-";
          $("confidenceFill").style.width = "0%";
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 2;
          cell.textContent = "No screenings yet.";
          row.append(cell);
          history.append(row);
          return;
        }
        const reviewed = latest.status === "reviewed" && latest.review;
        const primary = latest.result?.classification?.primary;
        const grade = reviewed ? latest.review.finalGrade : primary?.predictedGrade;
        $("resultSummary").textContent = reviewed
          ? `Doctor-reviewed result for ${data.patient.fullName}.`
          : latest.status === "completed" ? "AI screening draft. Please take the printed doctor report to a doctor of your choice. This is not a diagnosis."
          : latest.status === "failed" ? "Screening could not be completed. Ask the healthcare worker about recapture."
          : "Screening is still processing.";
        $("resultGrade").textContent = grade === undefined ? "-" : `Grade ${grade} - ${gradeLabels[grade] ?? "DR grade"}${reviewed ? "" : " (AI draft)"}`;
        $("reviewedAt").textContent = reviewed ? new Date(latest.review.reviewedAt).toLocaleDateString() : "Awaiting doctor review";
        $("guidanceText").textContent = reviewed && latest.review.patientGuidance
          ? latest.review.patientGuidance
          : "Choose a doctor and share your patient ID or mobile number. The doctor must request and verify an OTP from you before accessing your report.";
        const activeDietPlan = screenings.find((item) => item.dietPlan)?.dietPlan;
        $("patientDietPlan").textContent = activeDietPlan?.text ?? "A general draft will appear after screening and can be updated by your doctor.";
        const confidence = primary?.confidence;
        $("confidenceValue").textContent = Number.isFinite(confidence) ? `${Math.round(confidence * 100)}%` : "-";
        $("confidenceFill").style.width = Number.isFinite(confidence) ? `${Math.max(0, Math.min(100, confidence * 100))}%` : "0%";
        for (const screening of screenings) {
          const row = document.createElement("tr");
          const date = document.createElement("td");
          date.textContent = new Date(screening.createdAt).toLocaleDateString();
          const result = document.createElement("td");
          const itemGrade = screening.review?.finalGrade ?? screening.result?.classification?.primary?.predictedGrade;
          result.textContent = `${itemGrade === undefined ? "No grade" : `Grade ${itemGrade} - ${gradeLabels[itemGrade] ?? "DR grade"}`} (${screening.status === "reviewed" ? "Doctor reviewed" : screening.status === "completed" ? "AI draft" : screening.status})`;
          row.append(date, result);
          history.append(row);
        }
      }

      async function loadScreenings() {
        const patientId = $("patientSelect").value;
        renderScreenings({ screenings: [] });
        if (!patientId) return;
        try {
          const phone = patientPhone();
          const response = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/screenings?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not load screenings.");
          renderScreenings(data);
          $("patientStatus").textContent = `${data.screenings.length} screening${data.screenings.length === 1 ? "" : "s"}.`;
        } catch (error) {
          $("patientStatus").textContent = error.message;
        }
      }

      async function loadPatientRecords() {
        const select = $("patientSelect");
        try {
          const phone = patientPhone();
          const response = await fetch(`${API_BASE}/patients/by-phone?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error ?? "Could not load patient records.");
          select.replaceChildren(new Option(data.patients.length ? "Select patient" : "No patient record found", ""));
          for (const patient of data.patients) {
            select.add(new Option(`${patient.fullName} (${patient.patientId})`, patient.patientId));
          }
          select.disabled = data.patients.length === 0;
          select.value = data.patients[0]?.patientId ?? "";
          if (select.value) await loadScreenings();
          else {
            renderScreenings({ screenings: [] });
            $("patientStatus").textContent = "No patient record is linked to this phone number.";
          }
        } catch (error) {
          select.disabled = true;
          select.replaceChildren(new Option("Patient records unavailable", ""));
          renderScreenings({ screenings: [] });
          $("patientStatus").textContent = error.message;
        }
      }

      function showDashboard() {
        $("login").classList.add("hidden");
        $("dashboard").classList.remove("hidden");
        $("dashboard").focus();
        checkBackend();
        renderRoute();
        loadPatientRecords();
      }

      const patientRoutes = {
        result: ["Latest Screening Result", "Your latest screening and doctor-reviewed guidance."],
        history: ["Screening History", "Your retinal screening results over time."],
        guidance: ["Health Guidance", "What your result means and what to do next."]
      };

      function renderRoute() {
        if ($("dashboard").classList.contains("hidden")) return;
        const requested = location.hash.replace(/^#\/?/, "");
        const route = patientRoutes[requested] ? requested : "result";
        $("resultPage").hidden = route !== "result";
        $("historyPage").hidden = route !== "history";
        $("guidancePage").hidden = route !== "guidance";
        document.querySelectorAll(".page-nav [data-route]").forEach((link) => {
          if (link.dataset.route === route) link.setAttribute("aria-current", "page");
          else link.removeAttribute("aria-current");
        });
        document.title = `${patientRoutes[route][0]} | ICare Patient`;
      }

      window.addEventListener("hashchange", renderRoute);

      let requestedPhone = null;
      $("requestOtpBtn").addEventListener("click", async () => {
        const phone = $("phone");
        markInvalid(phone);
        if (!phone.checkValidity()) {
          $("loginError").hidden = false;
          $("loginError").textContent = "Enter a valid mobile number.";
          return;
        }
        $("requestOtpBtn").disabled = true;
        try {
          const response = await fetch(`${API_BASE}/auth/patient/request-otp`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: phone.value.trim() })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Could not request an OTP.");
          requestedPhone = phone.value.trim();
          $("otp").disabled = false;
          $("otp").focus();
          $("loginError").hidden = true;
          $("otpStatus").textContent = result.developmentOtp
            ? `Local demo OTP: ${result.developmentOtp}. This is not an SMS delivery.`
            : "Enter the code sent to your registered phone.";
        } catch (error) {
          $("loginError").hidden = false;
          $("loginError").textContent = error.message;
        } finally {
          $("requestOtpBtn").disabled = false;
        }
      });

      $("loginForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const phone = $("phone");
        const otp = $("otp");
        markInvalid(phone);
        markInvalid(otp);
        const problems = [];
        if (!phone.checkValidity()) problems.push("Enter a valid mobile number.");
        if (!otp.checkValidity() || otp.disabled) problems.push("Request and enter the 6-digit OTP.");
        if (requestedPhone !== phone.value.trim()) problems.push("Request a new OTP for this phone number.");
        const error = $("loginError");
        if (problems.length > 0) {
          error.hidden = false;
          error.textContent = problems.join(" ");
          (phone.checkValidity() ? otp : phone).focus();
          return;
        }
        try {
          const response = await fetch(`${API_BASE}/auth/patient/verify-otp`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone: phone.value.trim(), otp: otp.value.trim() })
          });
          const result = await response.json();
          if (!response.ok || !result.verified) throw new Error(result.reason ?? result.error ?? "OTP could not be verified.");
        } catch (failure) {
          error.hidden = false;
          error.textContent = failure.message;
          return;
        }
        error.hidden = true;
        otp.value = "";
        store(SESSION_KEY, JSON.stringify({ phone: phone.value.trim(), verifiedAt: Date.now() }));
        history.replaceState(null, "", "#/result");
        showDashboard();
      });

      $("logoutBtn").addEventListener("click", () => {
        store(SESSION_KEY, null);
        renderScreenings({ screenings: [] });
        $("dashboard").classList.add("hidden");
        $("login").classList.remove("hidden");
        history.replaceState(null, "", location.pathname);
        $("phone").focus();
      });

      async function latestPdf() {
        const screening = currentScreenings[0];
        if (!screening) throw new Error("No screening report is available.");
        const images = [];
        const count = screening.imagePaths?.length || 1;
        for (let index = 0; index < count; index++) {
          const response = await fetch(`${API_BASE}/screenings/${encodeURIComponent(screening.id)}/image?index=${index}`);
          if (!response.ok) throw new Error(`Photo ${index + 1} is unavailable; the report would be incomplete.`);
          images.push({ bytes: await response.arrayBuffer(), mimeType: response.headers.get("content-type") ?? "image/jpeg" });
        }
        return createReportPdf({ audience: "patient", patient: currentPatient, screening, screenings: currentScreenings, images });
      }

      $("printBtn").addEventListener("click", async () => {
        const opened = window.open("", "_blank");
        if (!opened) { $("patientStatus").textContent = "Allow pop-ups to open the printable PDF."; return; }
        preparePdfWindow(opened);
        try { openPdfForPrint(await latestPdf(), opened); }
        catch (error) { opened.close(); $("patientStatus").textContent = error.message; }
      });
      $("downloadBtn").addEventListener("click", async () => {
        try { downloadPdf(await latestPdf(), `icare-patient-${currentScreenings[0].id}.pdf`); }
        catch (error) { $("patientStatus").textContent = error.message; }
      });
      $("refreshReportBtn").addEventListener("click", loadPatientRecords);

      $("patientSelect").addEventListener("change", loadScreenings);

      if (patientPhone()) showDashboard();
      document.documentElement.dataset.icareReady = "true";

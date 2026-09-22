import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { explainModelVisual } from "./model-visuals.js";

const ink = rgb(0.12, 0.23, 0.22);
const muted = rgb(0.36, 0.45, 0.44);
const green = rgb(0.07, 0.42, 0.38);
const line = rgb(0.83, 0.89, 0.87);
const amber = rgb(0.65, 0.29, 0.11);
const grades = ["No apparent DR", "Mild DR", "Moderate DR", "Severe DR", "Proliferative DR"];

function printable(value) {
  return String(value ?? "-").replace(/[^\x20-\x7E\n]/g, "?");
}

async function pageSizedModelVisual(bytes) {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return { bytes, mimeType: "image/png" };
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return { bytes, mimeType: "image/png" };
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.94));
    return jpeg ? { bytes: await jpeg.arrayBuffer(), mimeType: "image/jpeg" } : { bytes, mimeType: "image/png" };
  } catch {
    return { bytes, mimeType: "image/png" };
  } finally {
    bitmap?.close();
  }
}

export async function createReportPdf({ audience, patient = {}, screening, screenings = [], images = [], modelImages = [] }) {
  if (!screening) throw new Error("Select a screening before creating a PDF.");
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const size = [595.28, 841.89];
  const margin = 43;
  let page, y;

  const newPage = () => {
    page = pdf.addPage(size);
    y = size[1] - 46;
    if (pdf.getPageCount() > 1) {
      page.drawText("ICare", { x: margin, y, font: bold, size: 15, color: green });
      page.drawText("REPORT CONTINUED", { x: size[0] - margin - 114, y: y + 2, font: bold, size: 8, color: muted });
      y -= 18;
      page.drawLine({ start: { x: margin, y }, end: { x: size[0] - margin, y }, thickness: 1, color: green });
      y -= 24;
    }
  };
  const ensure = (height) => { if (y - height < 70) newPage(); };
  const text = (value, { font = regular, fontSize = 10, color = ink, x = margin, maxWidth = size[0] - margin * 2, leading = fontSize + 4 } = {}) => {
    const paragraphs = printable(value).split("\n");
    for (const paragraph of paragraphs) {
      let lineText = "";
      const words = paragraph.split(/\s+/);
      for (const word of words) {
        const candidate = lineText ? `${lineText} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, fontSize) > maxWidth && lineText) {
          ensure(leading);
          page.drawText(lineText, { x, y, size: fontSize, font, color });
          y -= leading;
          lineText = word;
        } else lineText = candidate;
      }
      ensure(leading);
      page.drawText(lineText || " ", { x, y, size: fontSize, font, color });
      y -= leading;
    }
  };
  const section = (label) => {
    ensure(42);
    y -= 10;
    page.drawRectangle({ x: margin, y: y - 1, width: 4, height: 14, color: green });
    text(label.toUpperCase(), { font: bold, fontSize: 11, color: green, x: margin + 11 });
    y -= 4;
  };
  const row = (label, value) => {
    ensure(26);
    const rowY = y;
    page.drawText(printable(label), { x: margin, y: rowY, size: 9, font: bold, color: muted });
    text(value, { x: margin + 150, maxWidth: size[0] - margin * 2 - 150, fontSize: 9, leading: 12 });
    y = Math.min(y, rowY - 20);
    page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: size[0] - margin, y: y + 6 }, thickness: .5, color: line });
  };
  const drawCapturedPhotos = async () => {
    if (!images.length) return;
    ensure(570);
    section("Captured fundus photos");
    for (let index = 0; index < images.length; index++) {
      const photo = images[index];
      try {
        const embedded = /png/i.test(photo.mimeType) ? await pdf.embedPng(photo.bytes) : await pdf.embedJpg(photo.bytes);
        const scale = Math.min((size[0] - margin * 2) / embedded.width, 480 / embedded.height);
        const width = embedded.width * scale, height = embedded.height * scale;
        ensure(height + 55);
        text(`Photo ${index + 1}${index === 0 ? " - original image used for AI screening" : " - supporting original photo"}`, { font: bold, fontSize: 9 });
        page.drawImage(embedded, { x: margin, y: y - height, width, height });
        y -= height + 18;
      } catch {
        text(`Photo ${index + 1}: image format cannot be embedded in this PDF.`, { color: muted, fontSize: 9 });
      }
    }
  };

  const wrapCaption = (value, font, fontSize, width) => {
    const lines = [];
    for (const paragraph of printable(value).split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        const next = current ? `${current} ${word}` : word;
        if (current && font.widthOfTextAtSize(next, fontSize) > width) {
          lines.push(current);
          current = word;
        } else current = next;
      }
      lines.push(current || " ");
    }
    return lines;
  };

  const drawDoctorImageGrid = async (heading, figures) => {
    if (!figures.length) return;
    const prepared = [];
    for (const figure of figures) {
      try {
        const image = /png/i.test(figure.mimeType)
          ? await pdf.embedPng(figure.bytes) : await pdf.embedJpg(figure.bytes);
        prepared.push({ ...figure, image });
      } catch {
        prepared.push({ ...figure, image: null });
      }
    }
    const gap = 14;
    const columnWidth = (size[0] - margin * 2 - gap) / 2;
    const frameHeight = 156;
    for (let index = 0; index < prepared.length; index += 2) {
      const pair = prepared.slice(index, index + 2).map((figure) => ({
        ...figure,
        titleLines: wrapCaption(figure.label, bold, 9, columnWidth),
        explanationLines: wrapCaption(figure.explanation, regular, 8, columnWidth),
        noteLines: figure.note ? wrapCaption(figure.note, regular, 7, columnWidth) : []
      }));
      const titleHeight = Math.max(...pair.map((figure) => figure.titleLines.length * 11));
      const captionHeight = Math.max(...pair.map((figure) => figure.explanationLines.length * 10 + figure.noteLines.length * 9 + (figure.noteLines.length ? 3 : 0)));
      const rowHeight = titleHeight + frameHeight + captionHeight + 27;
      ensure(rowHeight + (index === 0 ? 40 : 0));
      if (index === 0) section(heading);
      const top = y;
      pair.forEach((figure, column) => {
        const x = margin + column * (columnWidth + gap);
        figure.titleLines.forEach((value, lineIndex) => page.drawText(value, {
          x, y: top - lineIndex * 11, size: 9, font: bold, color: ink
        }));
        const frameTop = top - titleHeight - 5;
        page.drawRectangle({ x, y: frameTop - frameHeight, width: columnWidth, height: frameHeight, color: rgb(0.03, 0.04, 0.04) });
        if (figure.image) {
          const scale = Math.min(columnWidth / figure.image.width, frameHeight / figure.image.height);
          const width = figure.image.width * scale;
          const height = figure.image.height * scale;
          page.drawImage(figure.image, {
            x: x + (columnWidth - width) / 2,
            y: frameTop - frameHeight + (frameHeight - height) / 2,
            width, height
          });
        } else {
          page.drawText("Image format cannot be embedded in this PDF.", {
            x: x + 10, y: frameTop - frameHeight / 2, size: 8, font: regular, color: rgb(0.7, 0.7, 0.7), maxWidth: columnWidth - 20
          });
        }
        let captionY = frameTop - frameHeight - 12;
        figure.explanationLines.forEach((value) => {
          page.drawText(value, { x, y: captionY, size: 8, font: regular, color: ink });
          captionY -= 10;
        });
        if (figure.noteLines.length) captionY -= 3;
        figure.noteLines.forEach((value) => {
          page.drawText(value, { x, y: captionY, size: 7, font: regular, color: muted });
          captionY -= 9;
        });
      });
      y = top - rowHeight;
    }
  };

  newPage();
  page.drawText("ICare", { x: margin, y, font: bold, size: 23, color: green });
  page.drawText(audience === "doctor" ? "CLINICAL COPY" : "PATIENT COPY", {
    x: size[0] - margin - 105, y: y + 4, font: bold, size: 9, color: green
  });
  y -= 24;
  page.drawLine({ start: { x: margin, y }, end: { x: size[0] - margin, y }, thickness: 2, color: green });
  y -= 28;
  text(audience === "doctor" ? "Retinal screening | Doctor report" : "Your retinal screening report", { font: bold, fontSize: 18 });
  const reviewed = screening.status === "reviewed" && screening.review;
  text(reviewed ? "Doctor-reviewed result" : "AI screening draft - awaiting doctor review", { color: reviewed ? green : amber, font: bold, fontSize: 10 });
  y -= 8;

  const primary = screening.result?.classification?.primary;
  const grade = reviewed ? screening.review.finalGrade : primary?.predictedGrade;
  section("Screening result");
  text(Number.isInteger(grade) ? `Grade ${grade} - ${grades[grade] ?? "DR grade"}` : "No reliable grade available", {
    font: bold, fontSize: 17, color: Number.isInteger(grade) && grade >= 2 ? amber : green
  });
  if (audience === "patient") {
    text(reviewed && screening.review.patientGuidance
      ? screening.review.patientGuidance
      : "This AI screening is not a diagnosis. Take this report to a doctor of your choice for clinical review.", { color: muted });
  } else {
    text("AI output supports clinical assessment. Final diagnosis and management require clinician review.", { color: muted });
  }
  y -= 4;
  const confidence = primary?.confidence;
  if (Number.isFinite(confidence)) {
    text(`AI confidence: ${Math.round(confidence * 100)}%`, { font: bold, fontSize: 10 });
    page.drawRectangle({ x: margin, y: y - 3, width: 360, height: 8, color: line });
    page.drawRectangle({ x: margin, y: y - 3, width: 360 * Math.max(0, Math.min(1, confidence)), height: 8, color: green });
    y -= 20;
  }

  section("Patient and screening");
  row("Name", patient.fullName ?? "-");
  row("Patient ID", patient.patientId ?? screening.patientId);
  row("Screened", new Date(screening.createdAt).toLocaleString());
  row("Screening ID", screening.id);
  row("Image quality", screening.result?.quality?.acceptable === true ? "Acceptable" : screening.result?.quality?.acceptable === false ? "Needs recapture" : "Not available");
  if (audience === "doctor") {
    row("Captured by", screening.capturedBy);
    row("Referral", primary?.risk?.replaceAll("_", " ") ?? "Not available");
    row("Clinical review", screening.result?.safety?.requiresClinicalReview ? "Required" : "See clinical findings");
  }

  const history = screenings
    .map((item) => ({ grade: item.review?.finalGrade ?? item.result?.classification?.primary?.predictedGrade, date: new Date(item.createdAt) }))
    .filter((item) => Number.isInteger(item.grade) && item.grade >= 0 && item.grade <= 4 && !Number.isNaN(item.date.getTime()))
    .sort((a, b) => a.date - b.date);
  if (history.length >= 2) {
    section("Screening progression");
    ensure(120);
    const left = margin + 43, right = size[0] - margin - 12, bottom = y - 92, top = y - 8;
    for (let gradeLine = 0; gradeLine <= 4; gradeLine++) {
      const axisY = bottom + gradeLine * (top - bottom) / 4;
      page.drawLine({ start: { x: left, y: axisY }, end: { x: right, y: axisY }, thickness: .5, color: line });
      page.drawText(String(gradeLine), { x: left - 18, y: axisY - 3, font: regular, size: 8, color: muted });
    }
    const first = history[0].date.getTime(), last = history.at(-1).date.getTime();
    const coords = history.map((item, index) => ({
      x: first === last ? left + index * (right - left) / (history.length - 1) : left + (item.date.getTime() - first) / (last - first) * (right - left),
      y: bottom + item.grade * (top - bottom) / 4
    }));
    coords.forEach((point, index) => {
      if (index) page.drawLine({ start: coords[index - 1], end: point, thickness: 2, color: green });
      page.drawCircle({ x: point.x, y: point.y, size: 3.5, color: green });
    });
    y = bottom - 16;
    text(`${history[0].date.toLocaleDateString()} to ${history.at(-1).date.toLocaleDateString()} | Grades 0-4`, { fontSize: 8, color: muted });
  }

  section("Diet plan");
  const activeDietPlan = screening.dietPlan ?? screenings.find((item) => item.dietPlan)?.dietPlan;
  text(activeDietPlan?.text ?? "A general meal-planning draft is not available yet.", { color: activeDietPlan ? ink : muted });
  if (activeDietPlan) text(activeDietPlan.source === "doctor" || activeDietPlan.doctorId
    ? `Doctor-reviewed plan, updated ${new Date(activeDietPlan.updatedAt).toLocaleString()}.`
    : "General draft only - ask your doctor or dietitian to personalize it.", { fontSize: 8, color: muted });

  if (audience === "doctor") {
    if (reviewed) {
      section("Doctor review");
      row("Final grade", `Grade ${screening.review.finalGrade}`);
      if (screening.review.comments) text(screening.review.comments, { color: ink });
      text(`Reviewed ${new Date(screening.review.reviewedAt).toLocaleString()}`, { fontSize: 8, color: muted });
    }
    await drawDoctorImageGrid("Captured fundus photos", images.map((photo, index) => ({
      ...photo,
      label: `Photo ${index + 1} - original fundus image`,
      explanation: index === 0
        ? "Original photo used for AI screening. Compare all highlighted areas with this image."
        : "Additional original photo retained with this screening."
    })));
    const explainedImages = [];
    for (const visual of modelImages) {
      const pageVisual = await pageSizedModelVisual(visual.bytes);
      explainedImages.push({
        ...pageVisual,
        label: `${visual.name} - ${visual.kind === "gradcam" ? "Grad-CAM" : "segmentation overlay"}`,
        explanation: explainModelVisual(visual),
        note: visual.note
      });
    }
    await drawDoctorImageGrid("Image explanations", explainedImages);
  } else await drawCapturedPhotos();

  pdf.getPages().forEach((item, index) => {
    item.drawLine({ start: { x: margin, y: 55 }, end: { x: size[0] - margin, y: 55 }, thickness: .5, color: line });
    item.drawText("ICare | AI-assisted screening; clinical review required", { x: margin, y: 40, size: 8, font: regular, color: muted });
    item.drawText(`${index + 1} / ${pdf.getPageCount()}`, { x: size[0] - margin - 30, y: 40, size: 8, font: regular, color: muted });
  });
  return pdf.save();
}

export function downloadPdf(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function preparePdfWindow(openedWindow) {
  if (!openedWindow) return;
  const doc = openedWindow.document;
  doc.title = "Preparing ICare report";
  doc.body.style.cssText = "margin:0;padding:32px;font:16px Arial,sans-serif;color:#173834;background:#f5faf9";
  doc.body.textContent = "Preparing PDF report. Large model images may take a moment.";
}

export function openPdfForPrint(bytes, openedWindow) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const opened = openedWindow ?? window.open("", "_blank");
  if (!opened) { URL.revokeObjectURL(url); throw new Error("Allow pop-ups to open the printable PDF."); }
  const doc = opened.document;
  doc.title = "ICare PDF report";
  doc.body.replaceChildren();
  doc.body.style.cssText = "margin:0;padding:0;background:#e9f0ee;font:14px Arial,sans-serif;color:#173834";
  const toolbar = doc.createElement("div");
  toolbar.style.cssText = "display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:12px 18px;background:#fff;border-bottom:1px solid #cbdad6";
  const title = doc.createElement("strong");
  title.textContent = "ICare PDF report";
  const print = doc.createElement("button");
  print.type = "button";
  print.textContent = "Print PDF";
  print.style.cssText = "padding:8px 12px;border:1px solid #176d68;border-radius:4px;background:#176d68;color:white;cursor:pointer";
  const download = doc.createElement("a");
  download.href = url;
  download.download = "icare-report.pdf";
  download.textContent = "Download PDF";
  const direct = doc.createElement("a");
  direct.href = url;
  direct.target = "_blank";
  direct.textContent = "Open PDF separately";
  const viewer = doc.createElement("iframe");
  viewer.title = "ICare report PDF preview";
  viewer.src = url;
  viewer.style.cssText = "display:block;width:100%;height:calc(100vh - 58px);border:0";
  print.addEventListener("click", () => viewer.contentWindow?.print());
  toolbar.append(title, print, download, direct);
  doc.body.append(toolbar, viewer);
  setTimeout(() => URL.revokeObjectURL(url), 600000);
}

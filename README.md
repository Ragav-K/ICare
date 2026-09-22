# ICare

ICare is a local-first healthcare platform for AI-assisted diabetic retinopathy screening, patient records, doctor review, reports, consent, and diet-plan workflows.

The product name is **ICare**. RetinlX may appear only as team attribution.

## Current Implementation Status

This repository now contains the first runnable foundation:

- Monorepo layout for web, desktop, mobile, backend, shared packages, MATLAB, docs, storage, and results.
- Express/NestJS-ready TypeScript backend module boundaries for OTP, patients, screenings, MATLAB inference, consent, audit, and diet recommendations.
- Prisma schema covering core healthcare entities and preserving original AI predictions separately from doctor review/correction.
- MATLAB quality-check and inference boundary scripts. The inference script refuses to fabricate predictions when trained model artifacts are unavailable.
- Docker Compose for PostgreSQL and Redis.
- Documentation for architecture, API, testing, deployment, future scope, and MATLAB integration.

## Run Locally

```powershell
copy .env.example .env
docker compose up -d
npm install
npm run dev:backend
```

Backend health check:

```powershell
curl http://localhost:4000/health
```

Start the three websites in separate terminals with `npm run dev:healthcare-worker`,
`npm run dev:patient`, and `npm run dev:doctor` (ports 5173, 5174, and 5175).
For local development only, both worker and doctor log in with
`iamragav2k7@gmail.com` and password `123456`.
Configure distinct staff accounts with bcrypt hashes and a strong JWT secret
in `.env` before deployment. The patient site uses phone plus a requested OTP;
the development provider displays code `123456` and does not send SMS.

Each screening accepts up to six fundus photos. The first photo is the AI input;
all photos stay with the screening and can appear in the clinical PDF. The doctor
can edit a patient-specific diet plan after patient OTP access. Patient and
clinical report downloads are PDFs, and Print opens the PDF for printing.
Both patient PDF entry points include every uploaded fundus photo. The clinical
PDF also includes available segmentation overlays, classifier Grad-CAM maps,
and per-grade model probability charts. A failed or unavailable model visual is
omitted rather than fabricated.
Clinical PDFs show the original photos followed by larger Grad-CAM and
segmentation images with plain explanations. Model validation tables are not
included. Page-sized, high-quality copies keep the printable file manageable;
the original-resolution overlays remain available in the doctor site.
A general, non-individualized diet draft appears after successful AI screening
and can later be replaced by a patient-authorized doctor. Doctor review notes
and patient guidance are optional.

## MATLAB

MATLAB R2026a was found at `C:\Program Files\MATLAB\R2026a\bin\matlab.exe`.

Set dataset/model paths in `.env`:

```text
MATLAB_DATA_ROOT=%USERPROFILE%/MATLAB Drive/SIH/data
MATLAB_MODEL_ROOT=%USERPROFILE%/MATLAB Drive/SIH/models
```

Training scripts are present but intentionally do not invent results:

```matlab
addpath(genpath("matlab"))
train_resnet50
train_mobilenetv2
train_unet_lesions("lesionType", "Microaneurysms")
train_unet_vessels
```

Lesion U-Net training now defaults to lesion-centered patches plus a weighted cross-entropy/soft-Dice loss blend. This is the recommended path for the tiny IDRiD lesion masks; use `"usePatches", false` only for legacy full-image experiments.

## Safety

ICare is an AI-assisted screening and decision-support system. It is not a definitive diagnosis system, not a substitute for ophthalmologists, and not represented here as regulatory-approved software.

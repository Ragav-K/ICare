# ICare Architecture

ICare uses a monorepo with role-specific applications, a central TypeScript backend, PostgreSQL persistence, Redis for temporary state, local file storage abstraction, and MATLAB-based retinal AI.

## Role Applications

- Healthcare Worker: web and desktop workflow for patient registration, identity matching, fundus upload/capture, screening, reports, and sync.
- Patient: web and mobile workflow for OTP login, family profile selection, reports, timeline, reminders, QR sharing, and doctor-approved diet plans.
- Doctor: web, desktop, and mobile workflow for verification, consent-based record access, AI review, correction, final reports, and diet-plan approval.

## Backend Boundary

The backend owns authentication, authorization, patient identity, medical records, consent, audit, reports, diet workflow, file metadata, and orchestration. MATLAB implementation details stay behind `backend/src/ai/matlab-gateway.ts`.

## MATLAB Boundary

MATLAB owns preprocessing, quality checks, ResNet-50/MobileNetV2 classification, U-Net segmentation, Grad-CAM, evaluation, and model artifacts.

The current gateway uses MATLAB batch execution because MATLAB is locally installed. This can later be swapped for MATLAB Engine or a MATLAB-generated service without changing screening APIs.

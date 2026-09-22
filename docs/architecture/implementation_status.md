# Implementation Status

## Working Local Demo

- Separate healthcare worker, doctor, and patient web sites.
- Healthcare worker patient registration, fundus upload, MATLAB screening, and AI draft downloads.
- Trained ResNet-50, MobileNetV2, vessel, and lesion model artifacts with documented local metrics in `ai_training_results.md`.
- Persistent local JSON records for patients, screenings, AI results, and doctor reviews in `backend/storage/local-records.json`.
- Doctor review queue with separate final grade, clinical notes, and patient guidance.
- Patient view of reviewed results and screening history. Unreviewed AI results are not shown there.
- Backend build and handoff test covering persistence, review, and patient visibility.

## Still Required Before Real Clinical Use

- Authenticated worker, doctor, and patient sessions with enforced role and patient access checks. The current web logins are demo-only, and the new review/read endpoints are disabled in production mode.
- Production database, migrations, backups, access logging, and encrypted storage. The local JSON store is for one-machine demonstrations only.
- Clinician-reviewed quality labels, external model validation, and a validated enhancement policy. Three sparse-lesion models remain research-only.
- Final server-generated reports and approval workflow. Worker downloads are labeled AI drafts; the patient site can print a reviewed result.
- More automated API, UI, and end-to-end tests, plus deployment and failure-recovery testing.

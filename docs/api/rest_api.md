# ICare REST API

Implemented initial endpoints:

- `GET /health`
- `POST /auth/patient/request-otp`
- `POST /auth/patient/verify-otp`
- `POST /auth/staff/login` (`role`, `email`, `password`; local demo accounts only unless configured)
- `GET /patients/search?phone=&name=`
- `POST /patients`
- `POST /screenings`
- `POST /screenings/:id/process`
- `GET /screenings/:id` (development demo)
- `GET /screenings/:id/image?index=0` (development demo; index selects one of up to six photos)
- `GET /patients/:patientId/screenings/latest` (development demo)
- `GET /patients/:patientId/screenings?phone=` (development patient demo)
- `GET /doctor/patient-screenings` (patient OTP grant required)
- `GET /doctor/screenings/:id/image?index=0` (patient OTP grant required)
- `POST /doctor/screenings/:id/diet-plan` (patient OTP grant required)
- `POST /screenings/:id/review` (development demo)
- `GET /patients/by-phone?phone=` (development demo)
- `GET /doctor/patient-choices?lookup=` (development demo; exact phone or patient ID, returns names and IDs only)
- `GET /patients/:patientId/reviewed-screenings?phone=` (development demo)
- `POST /doctor/access-request`
- `POST /doctor/access-approve`
- `POST /diet/recommendation`
- `POST /diet/approve`

Development OTP returns `123456` only when `OTP_PROVIDER=development`. Production requires SMS provider credentials and must not expose OTP values to clients.

The review endpoints use a local JSON record store and are disabled when `NODE_ENV=production`. Staff login validates configured bcrypt hashes (or local demo credentials) and returns an eight-hour JWT, but **the current data endpoints do not yet enforce that JWT**. The patient OTP endpoint verifies a requested code, but the development code is exposed to the local browser; SMS delivery and server-enforced patient sessions are not implemented. This remains a local demonstration, not production authentication or patient consent.

After screening, the result remains on the patient profile as an unreviewed AI draft. The worker can download or open patient and doctor PDFs. No global doctor queue exists. The doctor first searches by registered phone or patient ID with `GET /doctor/patient-choices`, selects the correct profile, and sends that patient ID to `POST /doctor/access-request`. Only then is an OTP requested for the selected patient's phone. The doctor submits the patient's OTP and their own doctor ID to `POST /doctor/access-approve`. The resulting 30-minute token goes in `Authorization: Bearer <token>` with `X-Doctor-Id` for patient report and image reads. `POST /screenings/:id/review` requires the same token and a matching patient. The patient profile then shows the doctor's final grade and guidance. `POST /doctor/screenings/:id/diet-plan` saves clinician-authored plan revisions with the same patient grant.

`POST /screenings/:id/process` returns `202 Accepted` with a `processing` screening immediately. MATLAB continues in the backend. Poll `GET /screenings/:id` until the status is `completed` or `failed`; the latest-screening endpoint can recover a saved result after a browser reload or request timeout. These read endpoints are development-only and must be replaced with authenticated access before production use.

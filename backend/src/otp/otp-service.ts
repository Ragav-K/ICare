type OtpRecord = { otp: string; expiresAt: number; attempts: number; purpose: string };

const otps = new Map<string, OtpRecord>();

export function requestOtp(phone: string, purpose: string) {
  const provider = process.env.OTP_PROVIDER ?? "development";
  const otp = provider === "development" ? "123456" : String(Math.floor(100000 + Math.random() * 900000));
  otps.set(phone, { otp, purpose, attempts: 0, expiresAt: Date.now() + 5 * 60 * 1000 });
  return {
    phone,
    purpose,
    provider,
    delivery: provider === "development" ? "development-console" : "sms-provider",
    developmentOtp: provider === "development" ? otp : undefined,
    expiresInSeconds: 300
  };
}

export function verifyOtp(phone: string, otp: string, purpose?: string) {
  const record = otps.get(phone);
  if (!record) return { verified: false, reason: "OTP_NOT_REQUESTED" };
  if (purpose && record.purpose !== purpose) return { verified: false, reason: "OTP_PURPOSE_MISMATCH" };
  if (Date.now() > record.expiresAt) return { verified: false, reason: "OTP_EXPIRED" };
  if (record.attempts >= 5) return { verified: false, reason: "OTP_ATTEMPTS_EXCEEDED" };
  record.attempts += 1;
  if (record.otp !== otp) return { verified: false, reason: "INVALID_OTP", attemptsRemaining: 5 - record.attempts };
  otps.delete(phone);
  return { verified: true, tokenType: "development-session", note: "Replace with JWT session issuance for production." };
}

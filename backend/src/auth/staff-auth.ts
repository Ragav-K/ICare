import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export type StaffRole = "worker" | "doctor" | "admin";

const demoAccounts: Record<StaffRole, { email: string; password: string }> = {
  worker: { email: "iamragav2k7@gmail.com", password: "123456" },
  doctor: { email: "iamragav2k7@gmail.com", password: "123456" },
  admin: { email: "iamragav2k7@gmail.com", password: "123456" }
};

const rolePrefixes: Record<StaffRole, string> = {
  worker: "ICARE_WORKER",
  doctor: "ICARE_DOCTOR",
  admin: "ICARE_ADMIN"
};

function staffJwtSecret() {
  return process.env.ICARE_STAFF_JWT_SECRET || (process.env.NODE_ENV !== "production" ? "icare-local-development-only" : "");
}

export function verifyStaffToken(token: string, requiredRole?: StaffRole) {
  const secret = staffJwtSecret();
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret) as { email: string; role: StaffRole };
    if (requiredRole && payload.role !== requiredRole) return null;
    return payload;
  } catch {
    return null;
  }
}

export function loginStaff(role: StaffRole, email: string, password: string) {
  const prefix = rolePrefixes[role];
  const configuredEmail = process.env[`${prefix}_EMAIL`];
  const configuredHash = process.env[`${prefix}_PASSWORD_HASH`];
  const isDemo = process.env.NODE_ENV !== "production" && !configuredEmail && !configuredHash;
  const valid = isDemo
    ? email.toLowerCase() === demoAccounts[role].email && password === demoAccounts[role].password
    : Boolean(configuredEmail && configuredHash && email.toLowerCase() === configuredEmail.toLowerCase()
      && bcrypt.compareSync(password, configuredHash));
  if (!valid) return null;
  const secret = staffJwtSecret();
  if (!secret) return null;
  return { email: email.toLowerCase(), role, token: jwt.sign({ email: email.toLowerCase(), role }, secret, { expiresIn: "8h" }) };
}

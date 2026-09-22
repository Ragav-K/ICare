import test from "node:test";
import assert from "node:assert/strict";
import { loginStaff } from "../src/auth/staff-auth.ts";

test("worker and doctor demo accounts use the same local credentials", () => {
  const worker = loginStaff("worker", "iamragav2k7@gmail.com", "123456");
  assert.equal(worker.role, "worker");
  assert.ok(worker.token);
  assert.equal(loginStaff("worker", "iamragav2k7@gmail.com", "wrong"), null);
  assert.equal(loginStaff("doctor", "iamragav2k7@gmail.com", "123456").role, "doctor");
});

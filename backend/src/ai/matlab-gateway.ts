import { spawn } from "node:child_process";
import path from "node:path";

export type MatlabInferenceResult = {
  status: "completed" | "failed";
  error?: string;
  message?: string;
  [key: string]: unknown;
};

export async function runMatlabInference(imagePath: string): Promise<MatlabInferenceResult> {
  const matlabExecutable = process.env.MATLAB_EXECUTABLE ?? "matlab";
  const matlabRoot = path.resolve(process.cwd(), "..", "matlab");
  const normalizedImagePath = imagePath.replace(/\\_/g, "_").replace(/\\/g, "/").replace(/'/g, "''");
  const normalizedMatlabRoot = matlabRoot.replace(/\\/g, "/").replace(/'/g, "''");
  const command = [
    "try",
    `addpath(genpath('${normalizedMatlabRoot}'))`,
    `result=run_inference('${normalizedImagePath}')`,
    "disp(jsonencode(result))",
    "catch ME",
    "disp(jsonencode(struct('status','failed','error',ME.message)))",
    "exit(1)",
    "end",
    "exit(0)"
  ].join("; ");

  return new Promise((resolve) => {
    const child = spawn(matlabExecutable, ["-batch", command], { timeout: 900000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => resolve({ status: "failed", error: "MATLAB_UNAVAILABLE", detail: error.message }));
    child.on("close", (code) => {
      const jsonLine = stdout.split(/\r?\n/).reverse().find((line) => line.trim().startsWith("{"));
      if (!jsonLine) {
        resolve({ status: "failed", error: "MATLAB_INFERENCE_UNAVAILABLE", exitCode: code, stderr: stderr.trim() });
        return;
      }
      try {
        resolve(JSON.parse(jsonLine) as MatlabInferenceResult);
      } catch {
        resolve({ status: "failed", error: "MATLAB_OUTPUT_UNREADABLE", raw: jsonLine });
      }
    });
  });
}

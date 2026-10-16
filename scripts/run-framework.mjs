import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";
// The approved key lives in the parent workspace. Load it only for local dev;
// builds never load it, and the Cloudflare dev config admits just this secret.
if (!managedLinux && command === "dev") {
  try { process.loadEnvFile(fileURLToPath(new URL("../../.env.local", import.meta.url))); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  try { process.loadEnvFile(fileURLToPath(new URL("../.env.auth.local", import.meta.url))); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

if (!managedLinux && command === 'dev') {
  try { process.loadEnvFile(fileURLToPath(new URL('../.env.background.local', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []), ...args];
await import(cli.href);

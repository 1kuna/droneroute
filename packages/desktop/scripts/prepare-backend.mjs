import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "../..");
const tauriDir = path.join(desktopDir, "src-tauri");
const backendPackagePath = path.join(repoRoot, "packages/backend/package.json");
const backendDist = path.join(repoRoot, "packages/backend/dist");
const sharedPackageDir = path.join(repoRoot, "packages/shared");
const sharedDist = path.join(sharedPackageDir, "dist");
const binariesDir = path.join(tauriDir, "binaries");
const resourcesDir = path.join(tauriDir, "resources");
const backendResourceDir = path.join(resourcesDir, "backend");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureBuilt(pathToCheck, message) {
  if (!fs.existsSync(pathToCheck)) {
    throw new Error(message);
  }
}

function copyDirectory(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    force: true,
    dereference: true,
    filter: (src) => !src.includes(`${path.sep}.DS_Store`),
  });
}

function targetTriple() {
  if (process.env.TAURI_TARGET_TRIPLE) return process.env.TAURI_TARGET_TRIPLE;

  const versionInfo = execFileSync("rustc", ["-vV"], {
    encoding: "utf8",
  });
  const hostLine = versionInfo
    .split("\n")
    .find((line) => line.startsWith("host:"));
  if (!hostLine) {
    throw new Error("Could not determine Rust target triple from rustc -vV");
  }
  return hostLine.replace("host:", "").trim();
}

function prepareNodeSidecar() {
  const triple = targetTriple();
  const executableExt = process.platform === "win32" ? ".exe" : "";
  const destination = path.join(binariesDir, `node-${triple}${executableExt}`);

  fs.mkdirSync(binariesDir, { recursive: true });
  fs.copyFileSync(process.execPath, destination);
  fs.chmodSync(destination, 0o755);
  console.log(`Prepared Node sidecar: ${path.relative(repoRoot, destination)}`);
}

function prepareBackendRuntime() {
  ensureBuilt(
    path.join(backendDist, "index.js"),
    "Backend dist is missing. Run `npm run build -w packages/backend` first.",
  );
  ensureBuilt(
    path.join(sharedDist, "types.js"),
    "Shared dist is missing. Run `npm run build -w packages/shared` first.",
  );

  fs.rmSync(backendResourceDir, { recursive: true, force: true });
  fs.mkdirSync(backendResourceDir, { recursive: true });

  const backendPackage = readJson(backendPackagePath);
  const dependencies = { ...backendPackage.dependencies };
  delete dependencies["@droneroute/shared"];

  fs.writeFileSync(
    path.join(backendResourceDir, "package.json"),
    `${JSON.stringify(
      {
        name: "@droneroute/desktop-backend-runtime",
        version: backendPackage.version,
        private: true,
        type: "module",
        main: "dist/index.js",
        dependencies,
      },
      null,
      2,
    )}\n`,
  );

  copyDirectory(backendDist, path.join(backendResourceDir, "dist"));

  execFileSync(
    "npm",
    [
      "install",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts=false",
    ],
    {
      cwd: backendResourceDir,
      stdio: "inherit",
    },
  );

  const sharedRuntimeDir = path.join(
    backendResourceDir,
    "node_modules/@droneroute/shared",
  );
  fs.mkdirSync(sharedRuntimeDir, { recursive: true });
  copyDirectory(sharedDist, path.join(sharedRuntimeDir, "dist"));

  const sharedPackage = readJson(path.join(sharedPackageDir, "package.json"));
  fs.writeFileSync(
    path.join(sharedRuntimeDir, "package.json"),
    `${JSON.stringify(
      {
        name: sharedPackage.name,
        version: sharedPackage.version,
        type: sharedPackage.type,
        main: sharedPackage.main,
        types: sharedPackage.types,
        exports: sharedPackage.exports,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `Prepared backend runtime: ${path.relative(repoRoot, backendResourceDir)}`,
  );
}

prepareNodeSidecar();
prepareBackendRuntime();

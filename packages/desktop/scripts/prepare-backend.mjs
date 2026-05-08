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
const nodeLibsDir = path.join(binariesDir, "node-libs");
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

function dynamicLibraries(binaryPath) {
  if (process.platform !== "darwin") return [];

  const output = execFileSync("otool", ["-L", binaryPath], {
    encoding: "utf8",
  });

  return output
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function isSystemLibrary(reference) {
  return (
    reference.startsWith("/usr/lib/") ||
    reference.startsWith("/System/Library/")
  );
}

function resolveLibraryReference(reference, sourcePath) {
  if (isSystemLibrary(reference)) return null;
  if (path.isAbsolute(reference)) {
    return fs.existsSync(reference) ? fs.realpathSync(reference) : null;
  }

  const name = path.basename(reference);
  const nodePath = fs.realpathSync(process.execPath);
  const candidates = [
    path.join(path.dirname(sourcePath), name),
    path.join(path.dirname(nodePath), name),
    path.join(path.dirname(nodePath), "..", "lib", name),
    path.join(path.dirname(nodePath), "..", "..", "lib", name),
    path.join("/opt/homebrew/lib", name),
    path.join("/usr/local/lib", name),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
  }

  return null;
}

function runInstallNameTool(args) {
  execFileSync("install_name_tool", args, { stdio: "pipe" });
}

function addRpath(binaryPath, rpath) {
  try {
    runInstallNameTool(["-add_rpath", rpath, binaryPath]);
  } catch (err) {
    const stderr = String(err.stderr ?? "");
    if (!stderr.includes("would duplicate path")) throw err;
  }
}

function adHocSign(binaryPath) {
  if (process.platform !== "darwin") return;
  execFileSync(
    "codesign",
    ["--force", "--sign", "-", "--timestamp=none", binaryPath],
    { stdio: "pipe" },
  );
}

function prepareMacDynamicLibraries(sidecarPath) {
  if (process.platform !== "darwin") return;

  fs.rmSync(nodeLibsDir, { recursive: true, force: true });
  fs.mkdirSync(nodeLibsDir, { recursive: true });

  const copiedBySource = new Map();
  const originalSourceByBundlePath = new Map([
    [sidecarPath, fs.realpathSync(process.execPath)],
  ]);
  const queue = [sidecarPath];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const sourceContext = originalSourceByBundlePath.get(current) ?? current;

    for (const reference of dynamicLibraries(current)) {
      const source = resolveLibraryReference(reference, sourceContext);
      if (!source || source === fs.realpathSync(sidecarPath)) continue;
      if (copiedBySource.has(source)) continue;

      const destination = path.join(nodeLibsDir, path.basename(source));
      fs.copyFileSync(source, destination);
      fs.chmodSync(destination, 0o755);
      copiedBySource.set(source, destination);
      originalSourceByBundlePath.set(destination, source);
      queue.push(destination);
    }
  }

  if (copiedBySource.size === 0) return;

  const nodeLibRpath = "@executable_path/../Resources/binaries/node-libs";
  addRpath(sidecarPath, nodeLibRpath);

  const patchDependencies = (targetPath, replacementPrefix) => {
    const sourceContext =
      originalSourceByBundlePath.get(targetPath) ?? targetPath;
    for (const reference of dynamicLibraries(targetPath)) {
      const source = resolveLibraryReference(reference, sourceContext);
      if (!source || !copiedBySource.has(source)) continue;
      runInstallNameTool([
        "-change",
        reference,
        `${replacementPrefix}/${path.basename(source)}`,
        targetPath,
      ]);
    }
  };

  patchDependencies(sidecarPath, "@rpath");

  for (const destination of copiedBySource.values()) {
    runInstallNameTool([
      "-id",
      `@rpath/${path.basename(destination)}`,
      destination,
    ]);
    patchDependencies(destination, "@loader_path");
    adHocSign(destination);
  }

  adHocSign(sidecarPath);

  console.log(
    `Prepared Node dynamic libraries: ${path.relative(repoRoot, nodeLibsDir)}`,
  );
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
  prepareMacDynamicLibraries(destination);
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

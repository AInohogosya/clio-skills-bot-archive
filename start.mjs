#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const isWindows = process.platform === "win32";

process.chdir(rootDir);

function run(runner, args) {
  return spawnSync(runner[0], [...runner.slice(1), ...args], {
    stdio: "inherit",
    shell: isWindows,
    env: {
      ...process.env,
      ...(runner[0] === "corepack" ? { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" } : {}),
    },
  });
}

function commandExists(command) {
  return spawnSync(command, ["--version"], { stdio: "ignore", shell: isWindows }).status === 0;
}

function readPinnedPnpmVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
    const match = /^pnpm@([^\s+]+)/.exec(pkg.packageManager || "");
    if (match) return match[1];
  } catch {
    /* ignore */
  }
  return null;
}

function pnpmRunners() {
  const runners = [];
  if (commandExists("pnpm")) runners.push(["pnpm"]);
  if (commandExists("corepack")) runners.push(["corepack", "pnpm"]);
  const spec = readPinnedPnpmVersion();
  const packageSpec = spec ? `pnpm@${spec}` : "pnpm";
  runners.push(["npm", "exec", "--yes", `--package=${packageSpec}`, "--", "pnpm"]);
  return runners;
}

let activeRunner = null;

function tryRun(args) {
  for (const runner of pnpmRunners()) {
    console.log(`> ${[...runner, ...args].join(" ")}`);
    const result = run(runner, args);
    if (result.status === 0) {
      activeRunner = runner;
      return true;
    }
    if (result.error) console.error(String(result.error));
    console.log(`Command failed (exit code ${result.status ?? 1}). Trying the next method...`);
  }
  return false;
}

function ensureDependencies() {
  if (fs.existsSync(path.join(rootDir, "node_modules"))) {
    activeRunner ??= pnpmRunners()[0];
    return;
  }
  console.log("node_modules not found. Installing dependencies (first time only)...");
  let ok = false;
  if (fs.existsSync(path.join(rootDir, "pnpm-lock.yaml"))) {
    ok = tryRun(["install", "--frozen-lockfile"]) || tryRun(["install"]);
  } else {
    ok = tryRun(["install"]);
  }
  if (!ok) {
    console.error("All install methods failed. Check your network connection and Node.js installation.");
    process.exit(1);
  }
}

function runScript(name, extraArgs) {
  const result = run(activeRunner, ["run", name, ...extraArgs]);
  process.exit(result.status ?? 1);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
  console.error(`Node.js 20 or later is required (current: ${process.versions.node}).`);
  console.error("Please install it from https://nodejs.org/ and try again.");
  process.exit(1);
}

const [mode = "dev", ...extraArgs] = process.argv.slice(2);

ensureDependencies();

if (mode === "dev") {
  runScript("dev", extraArgs);
}

if (mode === "prod" || mode === "start") {
  const buildResult = run(activeRunner, ["run", "build"]);
  if (buildResult.status !== 0) process.exit(buildResult.status ?? 1);
  runScript("start", extraArgs);
}

console.error(`Unknown mode: "${mode}". Usage: node start.mjs [dev|prod]`);
process.exit(1);

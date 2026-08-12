import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOTS = ["apps", "packages"];
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs"]);
const IMPORT_PATTERN = /(?:import\s+(?:[^"']+?\s+from\s+)?|export\s+[^"']+?\s+from\s+|import\s*\()\s*["']([^"']+)["']/g;
const violations = [];

function collectFiles(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "coverage"].includes(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(entryPath, files);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(entryPath);
  }
  return files;
}

function normalizedRelative(file) {
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function importsOf(source) {
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1]);
}

function addViolation(file, dependency, rule) {
  violations.push(`${normalizedRelative(file)} -> ${dependency}: ${rule}`);
}

function checkDomain(file, dependencies) {
  const forbiddenPackages = /^(react|react-dom|express|mysql2|cors|helmet|leaflet)(\/|$)/;
  const forbiddenLayers = /(^|\/)(application|infrastructure|presentation|composition-root|modules|core)(\/|$)/;
  for (const dependency of dependencies) {
    if (forbiddenPackages.test(dependency) || forbiddenLayers.test(dependency.replaceAll("\\", "/"))) {
      addViolation(file, dependency, "Domain must not depend on frameworks or outer layers");
    }
  }
}

function checkApplication(file, dependencies) {
  const forbiddenPackages = /^(react|react-dom|express|mysql2|cors|helmet|leaflet)(\/|$)/;
  const forbiddenLayers = /(^|\/)(infrastructure|presentation|composition-root|modules|core)(\/|$)/;
  const concreteWebDependencies = /^@smart-thapho\/web-core\/(api|session|navigation|runtime-config)$/;
  for (const dependency of dependencies) {
    const normalized = dependency.replaceAll("\\", "/");
    if (forbiddenPackages.test(dependency) || forbiddenLayers.test(normalized) || concreteWebDependencies.test(dependency)) {
      addViolation(file, dependency, "Application must depend on domain/application abstractions, not concrete adapters");
    }
  }
}

function checkPresentation(file, dependencies) {
  const directInfrastructure = /^@smart-thapho\/web-core\/(api|session|navigation|runtime-config)$/;
  for (const dependency of dependencies) {
    if (directInfrastructure.test(dependency)) {
      addViolation(file, dependency, "Presentation must call an application service through the composition root");
    }
  }
}

for (const sourceRoot of SOURCE_ROOTS) {
  for (const file of collectFiles(path.join(ROOT, sourceRoot))) {
    const relative = normalizedRelative(file);
    const dependencies = importsOf(fs.readFileSync(file, "utf8"));
    if (relative.includes("/domain/")) checkDomain(file, dependencies);
    if (relative.includes("/application/")) checkApplication(file, dependencies);
    if (/\/(pages|components|presentation)\//.test(relative) || /\/src\/(?:[A-Z][^/]*App|App)\.jsx$/.test(relative)) {
      checkPresentation(file, dependencies);
    }
  }
}

if (violations.length) {
  console.error("OOP architecture boundary violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("OOP architecture boundaries: PASS");
}

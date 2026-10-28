const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;

// Target names:
// - `google` -> COMPANY_NAME ("yinni")
// - `nowinandroid` -> APP_NAME ("yinni_mobile")
const COMPANY_NAME = "yinni";
const APP_NAME = "yinni_mobile";

const SKIP_DIRS = new Set([
  ".git",
  ".gradle",
  ".idea",
  ".kotlin",
  ".github",
  "build",
  "push",
  "node_modules",
]);

const TEXT_EXTENSIONS = new Set([
  ".kt",
  ".kts",
  ".xml",
  ".proto",
  ".toml",
  ".pro",
  ".properties",
  ".json",
  ".md",
  ".yaml",
  ".yml",
]);

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Step 1: Rename directories:
 * - `com/google` -> `com/yinni`
 * - `apps/nowinandroid` (or `apps/yinni` / `apps/caldrn` from earlier runs) -> `apps/yinni_mobile`
 */
function moveDirectoriesAndFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  // Recurse into subdirectories first (bottom-up)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      moveDirectoriesAndFiles(path.join(dir, entry.name));
    }
  }

  const parentName = path.basename(dir);
  const updatedEntries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of updatedEntries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;

    // 1. Inside `com/`, rename `google` (or `caldrn`) -> COMPANY_NAME (`yinni`)
    if (
      parentName === "com" &&
      (entry.name === "google" || entry.name === "caldrn") &&
      entry.name !== COMPANY_NAME
    ) {
      const oldDirPath = path.join(dir, entry.name);
      const newDirPath = path.join(dir, COMPANY_NAME);
      mergeDirectory(oldDirPath, newDirPath);
      continue;
    }

    // 2. Inside `apps/`, rename `nowinandroid` (or `yinni` / `caldrn`) -> APP_NAME (`yinni_mobile`)
    if (
      parentName === "apps" &&
      (entry.name === "nowinandroid" ||
        entry.name === "yinni" ||
        entry.name === "caldrn") &&
      entry.name !== APP_NAME
    ) {
      const oldDirPath = path.join(dir, entry.name);
      const newDirPath = path.join(dir, APP_NAME);
      mergeDirectory(oldDirPath, newDirPath);
      continue;
    }

    // 3. Any standalone `nowinandroid` directory -> APP_NAME (`yinni_mobile`)
    if (entry.name === "nowinandroid" && entry.name !== APP_NAME) {
      const oldDirPath = path.join(dir, entry.name);
      const newDirPath = path.join(dir, APP_NAME);
      mergeDirectory(oldDirPath, newDirPath);
    }
  }
}

function mergeDirectory(srcDir, destDir) {
  if (srcDir === destDir) return;
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      mergeDirectory(srcPath, destPath);
    } else {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.renameSync(srcPath, destPath);
    }
  }

  fs.rmdirSync(srcDir);
}

/**
 * Step 2: Replace package names, imports, and references in all coding/config files.
 * Works both on fresh `google`/`nowinandroid` files AND files already renamed to `yinni`.
 */
function updateFileContents(dir, stats) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      updateFileContents(fullPath, stats);
    } else if (entry.isFile() && isTextFile(fullPath)) {
      const original = fs.readFileSync(fullPath, "utf-8");
      let updated = original;

      // Replace dot-separated package names (`com.<company>.samples.apps.<app>`)
      updated = updated.replace(
        /com\.(?:google|yinni|caldrn)\.samples\.apps\.(?:nowinandroid|yinni_mobile|yinni|caldrn)/g,
        `com.${COMPANY_NAME}.samples.apps.${APP_NAME}`
      );
      updated = updated.replace(
        /com\.(?:google|yinni|caldrn)\.samples\.apps\.niacatalog/g,
        `com.${COMPANY_NAME}.samples.apps.niacatalog`
      );

      // Replace slash-separated paths (`com/<company>/samples/apps/<app>`)
      updated = updated.replace(
        /com\/(?:google|yinni|caldrn)\/samples\/apps\/(?:nowinandroid|yinni_mobile|yinni|caldrn)/g,
        `com/${COMPANY_NAME}/samples/apps/${APP_NAME}`
      );
      updated = updated.replace(
        /com\/(?:google|yinni|caldrn)\/samples\/apps\/niacatalog/g,
        `com/${COMPANY_NAME}/samples/apps/niacatalog`
      );

      // Deep link host
      updated = updated.replace(
        /www\.(?:nowinandroid|yinni_mobile|yinni|caldrn)\.apps\.samples\.(?:google|yinni|caldrn)\.com/g,
        `www.${APP_NAME}.apps.samples.${COMPANY_NAME}.com`
      );
      updated = updated.replace(
        /apps\.samples\.(?:google|yinni|caldrn)\.com/g,
        `apps.samples.${COMPANY_NAME}.com`
      );

      // Root project name in settings.gradle.kts
      updated = updated.replace(
        /rootProject\.name\s*=\s*"(?:nowinandroid|yinni|caldrn)"/g,
        `rootProject.name = "${APP_NAME}"`
      );

      // Convention plugin IDs and aliases (from either `nowinandroid` or previous `yinni` run)
      updated = updated.replace(
        /libs\.plugins\.(?:nowinandroid|yinni|caldrn)\./g,
        `libs.plugins.${APP_NAME}.`
      );
      updated = updated.replace(
        /(?:nowinandroid|yinni|caldrn)-(android-|jvm-|hilt|root)/g,
        `${APP_NAME}-$1`
      );
      updated = updated.replace(
        /"(?:nowinandroid|yinni|caldrn)\.(android\.|jvm\.|hilt|root)/g,
        `"${APP_NAME}.$1`
      );

      // Replace any remaining `nowinandroid` occurrences
      updated = updated.replace(/nowinandroid/g, APP_NAME);
      updated = updated.replace(/NowInAndroid/g, APP_NAME);
      updated = updated.replace(/Now in Android/g, APP_NAME);

      if (updated !== original) {
        fs.writeFileSync(fullPath, updated, "utf-8");
        stats.updatedFiles++;
      }
    }
  }
}

const stats = { updatedFiles: 0 };
console.log(
  `Moving google/ -> ${COMPANY_NAME}/ and nowinandroid/ -> ${APP_NAME}/ directories...`
);
moveDirectoriesAndFiles(ROOT_DIR);

console.log(
  "Updating file contents (packages, imports, plugins, references)..."
);
updateFileContents(ROOT_DIR, stats);

console.log(`Completed! Updated contents of ${stats.updatedFiles} files.`);

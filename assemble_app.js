const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;

// Target names:
// - `google` -> COMPANY_NAME ("yinni")
// - `nowinandroid` -> APP_NAME ("yinni_mobile")
const COMPANY_NAME = "yinni";
const APP_NAME = "yinni_mobile";

// In Gradle Version Catalogs (libs.versions.toml), underscores `_` and hyphens `-`
// in plugin aliases become dots `.` in generated Kotlin accessors (e.g. `libs.plugins.yinni.mobile.*`)
const APP_NAME_TOML_KEY = APP_NAME.replace(/_/g, "-");
const APP_NAME_GRADLE_ACCESSOR = APP_NAME.replace(/[-_]/g, ".");

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
  ".txt",
  ".issueregistry",
]);

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  if (base === "structure.txt") return false;
  return (
    TEXT_EXTENSIONS.has(ext) ||
    base === "com.android.tools.lint.client.api.IssueRegistry"
  );
}

/**
 * Step 1: Rename source/package directories and Room schema directories:
 * - `com/google` -> `com/yinni`
 * - `apps/nowinandroid` (or `apps/yinni`, `apps/caldrn`) -> `apps/yinni_mobile`
 * - `core/database/schemas/com.<old>.samples.apps.<old>.core.database.NiaDatabase`
 *   -> `core/database/schemas/com.yinni.samples.apps.yinni_mobile.core.database.NiaDatabase`
 */
function moveDirectoriesAndFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  // Recurse into subdirectories first (bottom-up)
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      moveDirectoriesAndFiles(path.join(dir, entry.name));
    }
  }

  const parentName = path.basename(dir);
  let updatedEntries;
  try {
    updatedEntries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of updatedEntries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;

    // 1. Room database schema directory (`schemas/com.google.samples.apps.nowinandroid.core.database.NiaDatabase`)
    if (parentName === "schemas" && entry.name.includes(".samples.apps.")) {
      const targetSchemaDirName = entry.name.replace(
        /^com\.[^.]+\.samples\.apps\.[^.]+\./,
        `com.${COMPANY_NAME}.samples.apps.${APP_NAME}.`
      );
      if (entry.name !== targetSchemaDirName) {
        mergeDirectory(
          path.join(dir, entry.name),
          path.join(dir, targetSchemaDirName)
        );
      }
      continue;
    }

    // 2. Inside `com/`, rename `google` (or `caldrn`) -> COMPANY_NAME (`yinni`)
    if (
      parentName === "com" &&
      (entry.name === "google" || entry.name === "caldrn") &&
      entry.name !== COMPANY_NAME
    ) {
      mergeDirectory(path.join(dir, entry.name), path.join(dir, COMPANY_NAME));
      continue;
    }

    // 3. Inside `apps/`, rename `nowinandroid` (or `yinni` / `caldrn`) -> APP_NAME (`yinni_mobile`)
    if (
      parentName === "apps" &&
      (entry.name === "nowinandroid" ||
        entry.name === "yinni" ||
        entry.name === "caldrn") &&
      entry.name !== APP_NAME
    ) {
      mergeDirectory(path.join(dir, entry.name), path.join(dir, APP_NAME));
      continue;
    }

    // 4. Any standalone `nowinandroid` directory -> APP_NAME (`yinni_mobile`)
    if (entry.name === "nowinandroid" && entry.name !== APP_NAME) {
      mergeDirectory(path.join(dir, entry.name), path.join(dir, APP_NAME));
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
 * Step 2: Replace package names, imports, Gradle catalog accessors, JVM memory settings, and references.
 */
function updateFileContents(dir, stats) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      updateFileContents(fullPath, stats);
    } else if (entry.isFile() && isTextFile(fullPath)) {
      const original = fs.readFileSync(fullPath, "utf-8");
      let updated = original;

      // 1. Replace dot-separated package names (`com.<company>.samples.apps.<app>`)
      updated = updated.replace(
        /com\.(?:google|yinni|caldrn)\.samples\.apps\.(?:nowinandroid|yinni_mobile|yinni|caldrn)/g,
        `com.${COMPANY_NAME}.samples.apps.${APP_NAME}`
      );
      updated = updated.replace(
        /com\.(?:google|yinni|caldrn)\.samples\.apps\.niacatalog/g,
        `com.${COMPANY_NAME}.samples.apps.niacatalog`
      );

      // 2. Replace slash-separated paths (`com/<company>/samples/apps/<app>`)
      updated = updated.replace(
        /com\/(?:google|yinni|caldrn)\/samples\/apps\/(?:nowinandroid|yinni_mobile|yinni|caldrn)/g,
        `com/${COMPANY_NAME}/samples/apps/${APP_NAME}`
      );
      updated = updated.replace(
        /com\/(?:google|yinni|caldrn)\/samples\/apps\/niacatalog/g,
        `com/${COMPANY_NAME}/samples/apps/niacatalog`
      );

      // 3. Deep link host
      updated = updated.replace(
        /www\.(?:nowinandroid|yinni_mobile|yinni|caldrn)\.apps\.samples\.(?:google|yinni|caldrn)\.com/g,
        `www.${APP_NAME}.apps.samples.${COMPANY_NAME}.com`
      );
      updated = updated.replace(
        /apps\.samples\.(?:google|yinni|caldrn)\.com/g,
        `apps.samples.${COMPANY_NAME}.com`
      );

      // 4. Root project name in settings.gradle.kts
      updated = updated.replace(
        /rootProject\.name\s*=\s*"(?:nowinandroid|yinni_mobile|yinni|caldrn)"/g,
        `rootProject.name = "${APP_NAME}"`
      );

      // 5. Gradle Version Catalog plugin accessors in build.gradle.kts:
      //    e.g. `libs.plugins.nowinandroid.android.application` -> `libs.plugins.yinni.mobile.android.application`
      updated = updated.replace(
        /libs\.plugins\.(?:nowinandroid|yinni_mobile|yinni\.mobile|yinni|caldrn)\./g,
        `libs.plugins.${APP_NAME_GRADLE_ACCESSOR}.`
      );

      // 6. Gradle Version Catalog plugin keys in libs.versions.toml:
      //    e.g. `nowinandroid-android-application` -> `yinni-mobile-android-application`
      updated = updated.replace(
        /(?:nowinandroid|yinni_mobile|yinni-mobile|yinni|caldrn)-(android-|jvm-|hilt|root)/g,
        `${APP_NAME_TOML_KEY}-$1`
      );

      // 7. Gradle Convention Plugin string IDs:
      //    e.g. `"nowinandroid.android.library"` -> `"yinni_mobile.android.library"`
      updated = updated.replace(
        /"(?:nowinandroid|yinni_mobile|yinni|caldrn)\.(android\.|jvm\.|hilt|root)/g,
        `"${APP_NAME}.$1`
      );

      // 8. Fix aggressive 4GB initial heap (-Xmx4g -Xms4g) and configuration cache KSP issue in gradle.properties
      if (entry.name === "gradle.properties") {
        updated = updated.replace(/-Xmx4g\s+-Xms4g/g, "-Xmx2g -Xms512m");
        updated = updated.replace(
          /org\.gradle\.configuration-cache=true/g,
          "org.gradle.configuration-cache=false"
        );
        updated = updated.replace(
          /org\.gradle\.isolated-projects=true/g,
          "org.gradle.isolated-projects=false"
        );
        updated = updated.replace(
          /ksp\.project\.isolation\.enabled=true/g,
          "ksp.project.isolation.enabled=false"
        );
      }

      // 9. Replace remaining standalone `nowinandroid` references
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

function main() {
  const stats = { updatedFiles: 0 };
  console.log(
    `1. Moving directories (google -> ${COMPANY_NAME}, nowinandroid -> ${APP_NAME}, Room schemas)...`
  );
  moveDirectoriesAndFiles(ROOT_DIR);

  console.log(
    "2. Updating file contents (packages, imports, Gradle catalog accessors, proto, google-services.json, lint, gradle.properties)..."
  );
  updateFileContents(ROOT_DIR, stats);
  console.log(`   Updated contents of ${stats.updatedFiles} files.`);
}

main();

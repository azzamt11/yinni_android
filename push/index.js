const fs = require("fs");
const path = require("path");
const { execSync, execFileSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const STRUCTURE_FILE = path.join(ROOT_DIR, "structure.txt");
const MIN_BOX_COLUMN = 112;

const EXCLUDED_DIRS = new Set([
  "build",
  ".gradle",
  ".git",
  ".idea",
  ".kotlin",
  ".github",
  "push",
  "node_modules",
]);

function runGit(args) {
  try {
    return execSync(`git ${args}`, {
      cwd: ROOT_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    return "";
  }
}

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isIgnoredMetaFile(relPath) {
  const norm = normalizePath(relPath);
  return norm === "structure.txt" || norm.startsWith("push/");
}

function isCodingFile(fileName) {
  return (
    fileName.endsWith(".kt") ||
    fileName.endsWith(".kts") ||
    fileName.endsWith(".proto") ||
    fileName.endsWith(".toml") ||
    fileName === "AndroidManifest.xml"
  );
}

/**
 * 2. Parse `git diff -M --name-status` output to handle Added (A), Modified (M),
 *    Deleted (D), and Renamed (Rxxx old -> new) files.
 */
function parseNameStatus(output) {
  const activeChangedPaths = []; // Files that exist now and should be marked [*]
  const commitDescriptions = []; // Human-readable descriptions for commit message
  const renamedMap = new Map(); // oldPath -> newPath

  const lines = output.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\t+/);
    const status = parts[0].trim();

    if (status.startsWith("R") || status.startsWith("C")) {
      // Rename or Copy: R100\toldPath\tnewPath
      const oldPath = normalizePath(parts[1] || "");
      const newPath = normalizePath(parts[2] || "");
      if (isIgnoredMetaFile(oldPath) && isIgnoredMetaFile(newPath)) continue;

      if (oldPath && newPath) {
        renamedMap.set(oldPath, newPath);
        activeChangedPaths.push(newPath);
        commitDescriptions.push(`${oldPath} -> ${newPath}`);
      }
    } else if (status.startsWith("D")) {
      // Deleted: D\toldPath
      const oldPath = normalizePath(parts[1] || "");
      if (isIgnoredMetaFile(oldPath)) continue;
      if (oldPath) {
        commitDescriptions.push(`deleted ${oldPath}`);
      }
    } else {
      // Added (A), Modified (M), etc.: M\tpath
      const filePath = normalizePath(parts[1] || "");
      if (isIgnoredMetaFile(filePath)) continue;
      if (filePath) {
        activeChangedPaths.push(filePath);
        commitDescriptions.push(filePath);
      }
    }
  }

  return { activeChangedPaths, commitDescriptions, renamedMap };
}

/**
 * 3. Recursively scan current workspace coding files so added, renamed, and deleted
 *    files/folders automatically update the tree diagram.
 */
function collectCodingFiles(dir, relParts = [], results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collectCodingFiles(
        path.join(dir, entry.name),
        [...relParts, entry.name],
        results
      );
    } else if (entry.isFile() && isCodingFile(entry.name)) {
      results.push([...relParts, entry.name]);
    }
  }
  return results;
}

/**
 * 4. Rebuild structure.txt from current disk state and mark [*] on all changed files.
 */
function generateStructureFile(markedSet) {
  const filePartsList = collectCodingFiles(ROOT_DIR);

  filePartsList.sort((a, b) => {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const cmp = a[i].toLowerCase().localeCompare(b[i].toLowerCase());
      if (cmp !== 0) return cmp;
    }
    return a.length - b.length;
  });

  function createNode(name) {
    return { name, children: new Map(), isFile: false, relPath: "" };
  }

  const rootNode = createNode("yinni_android");

  for (const parts of filePartsList) {
    let curr = rootNode;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!curr.children.has(part)) {
        curr.children.set(part, createNode(part));
      }
      curr = curr.children.get(part);
      if (i === parts.length - 1) {
        curr.isFile = true;
        curr.relPath = parts.join("/");
      }
    }
  }

  // Collapse single-child directory chains (e.g. src/main/kotlin/com/...)
  function collapse(node) {
    for (const child of node.children.values()) {
      collapse(child);
    }
    while (
      node.children.size === 1 &&
      !node.isFile &&
      node.name !== "yinni_android"
    ) {
      const onlyChild = node.children.values().next().value;
      if (!onlyChild.isFile) {
        node.name = `${node.name}/${onlyChild.name}`;
        node.children = onlyChild.children;
      } else {
        break;
      }
    }
  }

  collapse(rootNode);

  // Compute [*] status bottom-up (a directory gets [*] when all its child files are [*])
  // Only modified, added, or renamed files receive [*].
  // Directories always remain [ ].
  function computeMarked(node) {
    if (node.isFile) {
      node.marked = markedSet.has(node.relPath);
      return node.marked;
    }

    node.marked = false;

    for (const child of node.children.values()) {
      computeMarked(child);
    }

    return false;
  }

  computeMarked(rootNode);

  const rawTreeLines = [
    { text: "yinni_android/", marked: rootNode.marked },
  ];

  function render(node, prefix = "") {
    const items = Array.from(node.children.values()).sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    items.forEach((item, idx) => {
      const isLast = idx === items.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const suffix = item.isFile ? "" : "/";
      const treeLine = `${prefix}${connector}${item.name}${suffix}`;
      rawTreeLines.push({ text: treeLine, marked: item.marked });

      if (!item.isFile) {
        const extension = isLast ? "    " : "│   ";
        render(item, prefix + extension);
      }
    });
  }

  render(rootNode);

  const maxLineLen = Math.max(...rawTreeLines.map((l) => l.text.length));
  const boxCol = Math.max(MIN_BOX_COLUMN, maxLineLen + 4);

  const headerLines = [
    "# Yinni Android (Cloned from Now in Android) - Coding File Structure",
    "# Root: C:/Users/abdul/applications/yinni/yinni_android",
    `# Total Coding Files: ${filePartsList.length}`,
    "# (Excludes build/, .gradle/, .git/, .idea/, gradle wrapper starters, and binary/image assets)",
    "",
  ];

  const formattedTreeLines = rawTreeLines.map((item) => {
    const box = item.marked ? "[*]" : "[ ]";
    return item.text.padEnd(boxCol, " ") + box;
  });

  fs.writeFileSync(
    STRUCTURE_FILE,
    [...headerLines, ...formattedTreeLines].join("\n") + "\n",
    "utf-8"
  );
}

function getCurrentGitChanges() {
  const changed = new Set();
  const descriptions = new Set();

  // 1. Changes already staged
  const staged = parseNameStatus(
    runGit("diff --cached -M --name-status")
  );

  // 2. Changes not yet staged
  const unstaged = parseNameStatus(
    runGit("diff -M --name-status")
  );

  // 3. Newly created untracked files
  const untracked = runGit(
    "ls-files --others --exclude-standard"
  );

  for (const result of [staged, unstaged]) {
    for (const file of result.activeChangedPaths) {
      changed.add(file);
    }

    for (const description of result.commitDescriptions) {
      descriptions.add(description);
    }
  }

  for (const file of untracked.split(/\r?\n/)) {
    if (!file) continue;

    const normalized = normalizePath(file);

    if (isIgnoredMetaFile(normalized)) continue;

    changed.add(normalized);
    descriptions.add(normalized);
  }

  return {
    activeChangedPaths: [...changed],
    commitDescriptions: [...descriptions],
  };
}

function main() {
  // 1. Capture changes BEFORE git add
  console.log("1. Detecting current Git changes...");

  const currentChanges = getCurrentGitChanges();

  const changedFiles = new Set(
    currentChanges.activeChangedPaths
  );

  console.log("Changed files:", [...changedFiles]);

  // 2. Rebuild structure.txt using only current changes
  console.log("2. Updating structure.txt...");

  generateStructureFile(changedFiles);

  // 3. Stage all changes, including structure.txt
  console.log("3. Running git add -A...");

  execSync("git add -A", {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });

  // 4. Check whether there is anything to commit
  const stagedChanges = runGit(
    "diff --cached --name-only"
  );

  if (!stagedChanges) {
    console.log("No changes to commit.");
    return;
  }

  // 5. Generate commit message
  const descriptions =
    currentChanges.commitDescriptions.length > 0
      ? currentChanges.commitDescriptions
      : ["structure.txt"];

  const commitMessage =
    `Changing: ${descriptions.join(", ")}`;

  console.log("4. Committing changes...");

  // Avoid shell quoting problems in commit messages
  execFileSync(
    "git",
    ["commit", "-m", commitMessage],
    {
      cwd: ROOT_DIR,
      stdio: "inherit",
    }
  );

  // 6. Push
  console.log("5. Pushing to origin main...");

  execSync("git push origin main", {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });

  console.log("Done!");
}
  

main();

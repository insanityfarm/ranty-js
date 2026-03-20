import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const includeExtensions = new Set([".cjs", ".js", ".mjs", ".ts"]);
const ignoredDirectories = new Set([
  ".agent-context",
  ".git",
  "coverage",
  "dist",
  "node_modules",
  "spec/generated",
]);

const filesToCheck = [];

function collectFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  entries.forEach((entry) => {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(repoRoot, absolutePath);

    if (entry.isDirectory()) {
      if (ignoredDirectories.has(relativePath)) {
        return;
      }

      collectFiles(absolutePath);
      return;
    }

    if (includeExtensions.has(path.extname(entry.name))) {
      filesToCheck.push(absolutePath);
    }
  });
}

collectFiles(repoRoot);

const invalidDirectives = [];
const directiveToken = ["eslint", "disable"].join("-");
const directivePattern = new RegExp(
  `${directiveToken}(?:-next-line|-line)?\\b`,
);

filesToCheck.forEach((filePath) => {
  const fileContents = fs.readFileSync(filePath, "utf8");

  fileContents.split("\n").forEach((line, index) => {
    if (directivePattern.test(line) && !line.includes("--")) {
      invalidDirectives.push({
        filePath: path.relative(repoRoot, filePath),
        lineNumber: index + 1,
        line,
      });
    }
  });
});

if (invalidDirectives.length > 0) {
  console.error(
    'ESLint disable directives must include a reason introduced by "--".',
  );

  invalidDirectives.forEach(({ filePath, line, lineNumber }) => {
    console.error(`${filePath}:${lineNumber}`);
    console.error(`  ${line.trim()}`);
  });

  process.exit(1);
}

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const traceabilityPath = resolve(root, "docs/RULES_TRACEABILITY.md");
const sourcesPath = resolve(root, "docs/SOURCES.md");
const manifestPath = resolve(
  root,
  "packages/game-engine/tests/acceptance/acceptance-manifest.ts",
);

const officialRuleIds = [
  "OFF-SETUP-CAPACITY",
  "OFF-DEAL-ORDINARY",
  "OFF-DEAL-SPECIAL",
  "OFF-DEAL-CATASTROPHE",
  "OFF-DEAL-BUNKER-THREAT",
  "OFF-ROUND-COUNT",
  "OFF-R1-PROFESSION",
  "OFF-R2-R5-CHOICE",
  "OFF-ROUND-STARTER",
  "OFF-EXPULSION-TABLE",
  "OFF-BALLOT-EXILED-VOTE",
  "OFF-EXILED-CONTINUES",
  "OFF-EXILE-REVEAL",
  "OFF-TIE-DEFENSE-RUNOFF-LOT",
  "OFF-SPECIAL-CONDITION",
  "OFF-GOAL-SALVATION",
  "OFF-GOAL-REVIVAL",
  "OFF-FINAL-THREAT",
  "OFF-FINAL-USEFUL-THREE",
  "OFF-FINAL-CONSEQUENCE",
  "OFF-FINAL-EXILED-THREATS",
  "OFF-FINAL-CATASTROPHE",
  "OFF-COMBINED-DECKS",
];
const approvedRuleIds = [
  "APR-TIMERS-FOUR-OPTIONAL",
  "APR-SMALL-GROUP-FILL-SIX",
  "APR-PARTICIPANT-TIE-OVERTIME",
  "APR-SAME-ROOM-REMATCH",
];
const expectedRuleIds = new Set([...officialRuleIds, ...approvedRuleIds]);

const fail = (message) => {
  throw new Error(`Rules audit failed: ${message}`);
};

for (const path of [traceabilityPath, sourcesPath, manifestPath]) {
  if (!existsSync(path)) fail(`missing ${path.slice(root.length + 1)}`);
}

const traceability = readFileSync(traceabilityPath, "utf8");
const sources = readFileSync(sourcesPath, "utf8");
const manifest = readFileSync(manifestPath, "utf8");
const rows = traceability
  .split(/\r?\n/u)
  .filter((line) => /^\| (?:OFF|APR)-/u.test(line))
  .map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );

if (rows.some((row) => row.length !== 10))
  fail("every rule row must have exactly ten columns");
const ids = rows.map((row) => row[0]);
if (new Set(ids).size !== ids.length) fail("duplicate rule IDs");
const missing = [...expectedRuleIds].filter((id) => !ids.includes(id));
const unexpected = ids.filter((id) => !expectedRuleIds.has(id));
if (missing.length || unexpected.length)
  fail(`inventory mismatch; missing=[${missing}] unexpected=[${unexpected}]`);
const approved = ids.filter((id) => id.startsWith("APR-"));
if (
  approved.length !== 4 ||
  approved.some((id) => !approvedRuleIds.includes(id))
) {
  fail("profile must contain exactly the four approved product rules");
}

const manifestLines = manifest
  .split(/\r?\n/u)
  .filter((line) => line.includes('scenario("'));
for (const row of rows) {
  const [
    id,
    sourceType,
    locator,
    normative,
    precedence,
    behavior,
    implementation,
    positive,
    negative,
    status,
  ] = row;
  const expectedSource = id.startsWith("APR-")
    ? "approved-product-rule"
    : "official-3.3";
  if (sourceType !== expectedSource) fail(`${id} has source ${sourceType}`);
  if (!locator || !normative || !precedence || !behavior)
    fail(`${id} has an empty normative field`);
  if (status !== "passing") fail(`${id} status is ${status || "empty"}`);
  if (expectedSource === "official-3.3" && !locator.includes("PDF blocked")) {
    fail(`${id} must preserve the unresolved PDF locator truthfully`);
  }
  const implementations = implementation
    .split("<br>")
    .map((entry) => entry.trim());
  if (
    implementations.length === 0 ||
    implementations.some((entry) => !entry.includes("#"))
  ) {
    fail(`${id} needs module and symbol/state references`);
  }
  for (const entry of implementations) {
    const [file] = entry.replaceAll("`", "").split("#");
    if (!existsSync(resolve(root, file)))
      fail(`${id} references missing implementation ${file}`);
  }
  for (const [kind, references] of [
    ["positive", positive],
    ["negative", negative],
  ]) {
    for (const reference of references
      .split("<br>")
      .map((entry) => entry.replaceAll("`", "").trim())) {
      const match = /^(DOM|SRV|UI|E2E)-\d{3}:[A-Za-z][A-Za-z0-9]*$/u.exec(
        reference,
      );
      if (!match)
        fail(`${id} has malformed ${kind} test reference ${reference}`);
      const [scenarioId, assertion] = reference.split(":");
      const scenarioLine = manifestLines.find((line) =>
        line.includes(`scenario("${scenarioId}"`),
      );
      if (!scenarioLine || !scenarioLine.includes(`"${assertion}"`)) {
        fail(`${id} references undeclared acceptance assertion ${reference}`);
      }
    }
  }
}

if (!sources.includes("PDF_STATUS: blocked-publisher-link"))
  fail("SOURCES.md must record blocked publisher PDF status");
if (!sources.includes("PDF_SHA256: unavailable"))
  fail("SOURCES.md must not fabricate a PDF checksum");
if (/PDF_SHA256:\s*[a-f0-9]{64}/iu.test(sources))
  fail(
    "a PDF checksum cannot be recorded before valid PDF bytes are retrieved",
  );

console.log(
  `Rules audit passed: ${rows.length} rules, ${approved.length} approved overrides, all references resolved.`,
);

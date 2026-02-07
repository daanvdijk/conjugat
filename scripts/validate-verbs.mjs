#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, "..", "src", "data", "verbs.json");
const PERSONS = ["jo", "tu", "ell", "nosaltres", "vosaltres", "ells"];
const TENSES = [
  "present",
  "imperfect",
  "future",
  "conditional",
  "subjunctive_present",
  "subjunctive_imperfect",
  "imperative",
];
const REQUIRED_BY_TENSE = {
  present: PERSONS,
  imperfect: PERSONS,
  future: PERSONS,
  conditional: PERSONS,
  subjunctive_present: PERSONS,
  subjunctive_imperfect: PERSONS,
  // Imperative can be defective for some verbs; treat as optional.
  imperative: [],
};

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function validateVerb(verb) {
  const issues = [];
  if (!verb || typeof verb !== "object") {
    issues.push("invalid-verb-object");
    return issues;
  }
  if (!verb.infinitive) issues.push("missing-infinitive");
  if (!verb.tenses || typeof verb.tenses !== "object") {
    issues.push("missing-tenses");
    return issues;
  }

  for (const tense of TENSES) {
    const tenseBlock = verb.tenses[tense];
    if (!tenseBlock || typeof tenseBlock !== "object") {
      issues.push(`missing-tense:${tense}`);
      continue;
    }
    const requiredPersons = REQUIRED_BY_TENSE[tense] || PERSONS;
    for (const person of requiredPersons) {
      const value = tenseBlock[person];
      if (!value || typeof value !== "string" || !value.trim()) {
        issues.push(`missing-form:${tense}:${person}`);
      }
    }
  }

  return issues;
}

function main() {
  if (!fs.existsSync(DATA_PATH)) {
    console.error(`verbs.json not found at ${DATA_PATH}`);
    process.exit(1);
  }

  const verbs = loadJson(DATA_PATH);
  if (!Array.isArray(verbs)) {
    console.error("verbs.json is not an array");
    process.exit(1);
  }

  const report = [];
  for (const verb of verbs) {
    const issues = validateVerb(verb);
    if (issues.length > 0) {
      report.push({ infinitive: verb?.infinitive || "unknown", issues });
    }
  }

  if (report.length > 0) {
    console.error(`Validation failed: ${report.length} verbs with issues`);
    for (const entry of report) {
      console.error(`${entry.infinitive}: ${entry.issues.join(", ")}`);
    }
    process.exit(1);
  }

  console.log(`Validation passed: ${verbs.length} verbs checked`);
}

main();

#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, ".cache");

const FREQUENCY_URL =
  "https://raw.githubusercontent.com/nachocab/words-by-frequency/master/catalan.txt";
const FREEDICT_SRC_URL =
  "https://download.freedict.org/dictionaries/cat-eng/2024.10.10/freedict-cat-eng-2024.10.10.src.tar.xz";

const IRREGULAR_VERBS = [
  "ser",
  "estar",
  "anar",
  "fer",
  "tenir",
  "venir",
  "dir",
  "veure",
  "conèixer",
  "creure",
  "poder",
  "voler",
  "saber",
  "haver",
  "dur",
  "posar",
  "prendre",
  "treure",
  "moure",
  "riure",
  "caure",
  "valer",
  "sortir",
];

const MANUAL_TRANSLATIONS = {
  ser: "to be",
  estar: "to be",
  anar: "to go",
  fer: "to do",
  tenir: "to have",
  venir: "to come",
  dir: "to say",
  veure: "to see",
  conèixer: "to know",
  creure: "to believe",
  poder: "to be able",
  voler: "to want",
  saber: "to know",
  haver: "to have",
  dur: "to last",
  posar: "to put",
  prendre: "to take",
  treure: "to take out",
  moure: "to move",
  riure: "to laugh",
  caure: "to fall",
  valer: "to be worth",
  sortir: "to go out",
};

const PERSON_LABELS = ["jo", "tu", "ell", "nosaltres", "vosaltres", "ells"];
const TENSE_LABELS = ["present", "imperfect", "future", "conditional"];

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getGroup(infinitive) {
  if (infinitive.endsWith("ar")) return "ar";
  if (infinitive.endsWith("ir")) return "ir";
  return "er";
}

function stripTags(value) {
  return value.replace(/<[^>]+>/g, "");
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.text();
}

async function fetchBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function fetchTextCached(url, cachePath) {
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, "utf-8");
  }
  const text = await fetchText(url);
  fs.writeFileSync(cachePath, text, "utf-8");
  return text;
}

async function fetchBufferCached(url, cachePath) {
  if (fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath);
  }
  const buffer = await fetchBuffer(url);
  fs.writeFileSync(cachePath, buffer);
  return buffer;
}

async function fetchTeiFromTarXz(url) {
  const buffer = await fetchBufferCached(url, path.join(CACHE_DIR, "freedict.tar.xz"));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "freedict-"));
  const tarPath = path.join(tmpDir, "freedict.tar.xz");
  fs.writeFileSync(tarPath, buffer);
  execFileSync("tar", ["-xJf", tarPath, "-C", tmpDir]);
  let teiPath = null;
  const stack = [tmpDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".tei")) {
        teiPath = fullPath;
        break;
      }
    }
    if (teiPath) break;
  }
  if (!teiPath) {
    throw new Error("Failed to locate .tei in FreeDict source archive");
  }
  const teiText = fs.readFileSync(teiPath, "utf-8");
  return teiText;
}

function parseFrequencyList(text) {
  const lines = text.split(/\r?\n/);
  const words = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const word = parts[1];
    if (!word) continue;
    words.push(word.toLowerCase());
  }
  return words;
}

function parseFreeDict(teiText) {
  const map = new Map();
  const entryRegex = /<entry[\s\S]*?<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(teiText)) !== null) {
    const entry = match[0];
    const orthMatch = entry.match(/<orth[^>]*>(.*?)<\/orth>/);
    if (!orthMatch) continue;
    const lemma = normalizeText(stripTags(orthMatch[1]));
    if (!lemma) continue;
    const posMatch = entry.match(/<pos[^>]*>(.*?)<\/pos>/);
    if (!posMatch) continue;
    const pos = normalizeText(stripTags(posMatch[1])).toLowerCase();
    if (!(pos === "v" || pos.startsWith("verb"))) continue;
    const quoteMatch = entry.match(/<cit[^>]*type=["']trans["'][\s\S]*?<quote[^>]*>(.*?)<\/quote>/);
    if (!quoteMatch) continue;
    const rawTranslation = normalizeText(stripTags(quoteMatch[1]));
    if (!rawTranslation) continue;
    if (!map.has(lemma)) {
      map.set(lemma, rawTranslation);
    }
  }
  return map;
}

function isVerbCandidate(word) {
  if (!word) return false;
  if (word.includes(" ")) return false;
  if (word.includes("-")) return false;
  if (word.includes("'")) return false;
  if (word.endsWith("-se") || word.endsWith("se")) return false;
  return word.endsWith("ar") || word.endsWith("er") || word.endsWith("re") || word.endsWith("ir");
}

function normalizeTranslation(value) {
  if (!value) return value;
  const cleaned = value.split(";")[0].split(",")[0].trim();
  if (!cleaned) return value;
  if (cleaned.startsWith("to ")) return cleaned;
  return `to ${cleaned}`;
}

function regularPresent(infinitive, group, person) {
  const stem = infinitive.slice(0, -2);
  if (group === "ar") {
    return (
      {
        jo: `${stem}o`,
        tu: `${stem}es`,
        ell: `${stem}a`,
        nosaltres: `${stem}em`,
        vosaltres: `${stem}eu`,
        ells: `${stem}en`,
      }[person] ?? ""
    );
  }
  if (group === "ir") {
    return (
      {
        jo: `${stem}o`,
        tu: `${stem}s`,
        ell: `${stem}`,
        nosaltres: `${stem}im`,
        vosaltres: `${stem}iu`,
        ells: `${stem}en`,
      }[person] ?? ""
    );
  }
  return (
    {
      jo: `${stem}o`,
      tu: `${stem}s`,
      ell: `${stem}`,
      nosaltres: `${stem}em`,
      vosaltres: `${stem}eu`,
      ells: `${stem}en`,
    }[person] ?? ""
  );
}

function regularImperfect(infinitive, group, person) {
  const stem = infinitive.slice(0, -2);
  if (group === "ar") {
    return (
      {
        jo: `${stem}ava`,
        tu: `${stem}aves`,
        ell: `${stem}ava`,
        nosaltres: `${stem}àvem`,
        vosaltres: `${stem}àveu`,
        ells: `${stem}aven`,
      }[person] ?? ""
    );
  }
  return (
    {
      jo: `${stem}ia`,
      tu: `${stem}ies`,
      ell: `${stem}ia`,
      nosaltres: `${stem}íem`,
      vosaltres: `${stem}íeu`,
      ells: `${stem}ien`,
    }[person] ?? ""
  );
}

function regularFuture(infinitive, person) {
  return (
    {
      jo: `${infinitive}é`,
      tu: `${infinitive}às`,
      ell: `${infinitive}à`,
      nosaltres: `${infinitive}em`,
      vosaltres: `${infinitive}eu`,
      ells: `${infinitive}an`,
    }[person] ?? ""
  );
}

function regularConditional(infinitive, person) {
  return (
    {
      jo: `${infinitive}ia`,
      tu: `${infinitive}ies`,
      ell: `${infinitive}ia`,
      nosaltres: `${infinitive}íem`,
      vosaltres: `${infinitive}íeu`,
      ells: `${infinitive}ien`,
    }[person] ?? ""
  );
}

function buildRegularTenses(infinitive, group) {
  return {
    present: Object.fromEntries(
      PERSON_LABELS.map((person) => [person, regularPresent(infinitive, group, person)])
    ),
    imperfect: Object.fromEntries(
      PERSON_LABELS.map((person) => [person, regularImperfect(infinitive, group, person)])
    ),
    future: Object.fromEntries(
      PERSON_LABELS.map((person) => [person, regularFuture(infinitive, person)])
    ),
    conditional: Object.fromEntries(
      PERSON_LABELS.map((person) => [person, regularConditional(infinitive, person)])
    ),
  };
}

function sliceTenseLines(lines, tenseLabel, allLabels) {
  const target = tenseLabel.toLowerCase();
  const startIndex = lines.findIndex((line) => line.toLowerCase().includes(target));
  if (startIndex === -1) return [];
  const result = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (allLabels.some((label) => line.toLowerCase().includes(label.toLowerCase()))) break;
    result.push(line);
  }
  return result;
}

function extractVerbForms(blockLines) {
  const forms = {};
  for (const rawLine of blockLines) {
    const line = normalizeText(rawLine.replace(/\|/g, " "));
    if (!line) continue;
    if (line.startsWith("jo ")) {
      forms.jo = line.replace(/^jo\s+/, "");
      continue;
    }
    if (line.startsWith("tu ")) {
      forms.tu = line.replace(/^tu\s+/, "");
      continue;
    }
    if (line.startsWith("ell, ella, vostè")) {
      forms.ell = line.replace(/^ell, ella, vostè\s+/, "");
      continue;
    }
    if (line.startsWith("nosaltres ")) {
      forms.nosaltres = line.replace(/^nosaltres\s+/, "");
      continue;
    }
    if (line.startsWith("vosaltres, vós ")) {
      forms.vosaltres = line.replace(/^vosaltres, vós\s+/, "");
      continue;
    }
    if (line.startsWith("ells, elles, vostès ")) {
      forms.ells = line.replace(/^ells, elles, vostès\s+/, "");
    }
  }

  for (const key of Object.keys(forms)) {
    const cleaned = forms[key]
      .split(",")[0]
      .replace(/\(.*?\)/g, "")
      .trim();
    forms[key] = cleaned;
  }

  return forms;
}

async function fetchIrregularConjugations(infinitive) {
  const url = `https://www.verbs.cat/en/conjugation/${encodeURIComponent(infinitive)}.html`;
  const cachePath = path.join(CACHE_DIR, `verbs-cat-${infinitive}.html`);
  const html = await fetchTextCached(url, cachePath);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "\n");
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean);

  const labels = ["Present", "Imperfect", "Future", "Conditional"];
  const presentLines = sliceTenseLines(lines, "Present", labels);
  const imperfectLines = sliceTenseLines(lines, "Imperfect", labels);
  const futureLines = sliceTenseLines(lines, "Future", labels);
  const conditionalLines = sliceTenseLines(lines, "Conditional", labels);

  const present = extractVerbForms(presentLines);
  const imperfect = extractVerbForms(imperfectLines);
  const future = extractVerbForms(futureLines);
  const conditional = extractVerbForms(conditionalLines);

  for (const person of PERSON_LABELS) {
    if (!present[person] || !imperfect[person] || !future[person] || !conditional[person]) {
      throw new Error(`Missing ${person} for ${infinitive}`);
    }
  }

  return { present, imperfect, future, conditional };
}

async function validateAgainstSource(verb, expectedTenses) {
  const source = await fetchIrregularConjugations(verb.infinitive);
  const mismatches = [];
  for (const tense of TENSE_LABELS) {
    for (const person of PERSON_LABELS) {
      const expected = expectedTenses[tense]?.[person];
      const actual = source[tense]?.[person];
      if (!expected || !actual || expected !== actual) {
        mismatches.push({
          tense,
          person,
          expected,
          actual,
        });
      }
    }
  }
  return mismatches;
}

async function main() {
  const args = process.argv.slice(2);
  const validate = args.includes("--validate");
  const validateArg = args.find((arg) => arg.startsWith("--validate-count="));
  const validateCount = validateArg ? Number(validateArg.split("=")[1]) || 30 : 30;

  console.log("Downloading frequency list...");
  const frequencyText = await fetchTextCached(
    FREQUENCY_URL,
    path.join(CACHE_DIR, "catalan-frequency.txt")
  );
  console.log("Downloading FreeDict source...");
  const freedictText = await fetchTeiFromTarXz(FREEDICT_SRC_URL);

  console.log("Parsing FreeDict...");
  const translationMap = parseFreeDict(freedictText);

  console.log("Parsing frequency list...");
  const freqWords = parseFrequencyList(frequencyText);

  console.log("Fetching irregular conjugations...");
  const irregularData = [];
  const irregularSet = new Set(IRREGULAR_VERBS);
  const missingIrregulars = [];
  for (const verb of IRREGULAR_VERBS) {
    try {
      const tenses = await fetchIrregularConjugations(verb);
      const translation = normalizeTranslation(
        translationMap.get(verb) || MANUAL_TRANSLATIONS[verb] || ""
      );
      irregularData.push({
        infinitive: verb,
        translation: translation || "",
        regular: false,
        group: getGroup(verb),
        tenses,
      });
      console.log(`Fetched ${verb}`);
    } catch (error) {
      missingIrregulars.push(`${verb}: ${error.message}`);
      console.warn(`Skipping irregular ${verb}: ${error.message}`);
    }
  }

  const regularData = [];
  const missingTranslations = [];

  const orthographyCandidates = [];

  for (const word of freqWords) {
    if (regularData.length + irregularData.length >= 200) break;
    if (!isVerbCandidate(word)) continue;
    if (irregularSet.has(word)) continue;
    const translationRaw = translationMap.get(word);
    if (!translationRaw) {
      missingTranslations.push(word);
      continue;
    }
    const translation = normalizeTranslation(translationRaw);
    if (/(car|gar|çar)$/i.test(word)) {
      orthographyCandidates.push({ infinitive: word, translation });
      continue;
    }
    regularData.push({
      infinitive: word,
      translation,
      regular: true,
      group: getGroup(word),
    });
  }

  if (orthographyCandidates.length > 0) {
    console.log(`Fetching ${orthographyCandidates.length} orthographic verbs...`);
    for (const candidate of orthographyCandidates) {
      if (regularData.length + irregularData.length >= 200) break;
      try {
        const tenses = await fetchIrregularConjugations(candidate.infinitive);
        irregularData.push({
          infinitive: candidate.infinitive,
          translation: candidate.translation,
          regular: false,
          group: getGroup(candidate.infinitive),
          tenses,
        });
      } catch (error) {
        regularData.push({
          infinitive: candidate.infinitive,
          translation: candidate.translation,
          regular: true,
          group: getGroup(candidate.infinitive),
        });
      }
    }
  }

  if (missingTranslations.length > 0) {
    fs.writeFileSync(
      path.join(CACHE_DIR, "missing-translations.txt"),
      missingTranslations.join("\\n"),
      "utf-8"
    );
  }
  if (missingIrregulars.length > 0) {
    fs.writeFileSync(
      path.join(CACHE_DIR, "missing-irregulars.txt"),
      missingIrregulars.join("\\n"),
      "utf-8"
    );
  }

  const verbs = [...irregularData, ...regularData];
  const outputPath = path.join(__dirname, "..", "src", "data", "verbs.json");
  fs.writeFileSync(outputPath, JSON.stringify(verbs, null, 2), "utf-8");
  console.log(`Wrote ${verbs.length} verbs to ${outputPath}`);

  if (validate) {
    console.log(`Validating ${validateCount} regular verbs against source...`);
    const report = [];
    const sample = regularData.slice(0, validateCount);
    for (const verb of sample) {
      try {
        const expected = buildRegularTenses(verb.infinitive, verb.group);
        const mismatches = await validateAgainstSource(verb, expected);
        if (mismatches.length > 0) {
          report.push({ infinitive: verb.infinitive, mismatches });
        }
      } catch (error) {
        report.push({ infinitive: verb.infinitive, error: error.message });
      }
    }
    const reportPath = path.join(CACHE_DIR, "validation-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
    if (report.length === 0) {
      console.log("Validation passed.");
    } else {
      console.log(`Validation found ${report.length} verbs with mismatches.`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

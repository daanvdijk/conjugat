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
const MAX_VERBS = 500;

const IRREGULAR_VERBS = new Set([
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
  "seure",
  "asseure",
  "fondre",
  "sorprendre",
]);

const MANUAL_TRANSLATIONS = {
  ser: "to be",
  estar: "to be",
  anar: "to go",
  fer: "to do",
  tenir: "to have",
  venir: "to come",
  dir: "to say",
  veure: "to see",
  poder: "to be able",
  voler: "to want",
  saber: "to know",
  haver: "to have",
  posar: "to put",
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

function parseConjugationsFromHtml(html, infinitive) {
  const cleanedHtml = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "");

  const extractTableById = (sectionHtml, headingId) => {
    const re = new RegExp(
      `<h3[^>]*id=["']${headingId}["'][^>]*>[\\s\\S]*?<\\/h3>\\s*<table[^>]*>([\\s\\S]*?)<\\/table>`,
      "i"
    );
    const match = sectionHtml.match(re);
    return match ? match[1] : "";
  };

  const parseTable = (tableHtml) => {
    const forms = {};
    const rowRe = /<tr[^>]*>[\s\S]*?<th[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
    let match;
    while ((match = rowRe.exec(tableHtml)) !== null) {
      const pronoun = normalizeText(stripTags(match[1])).replace(/[()]/g, "");
      const valueRaw = normalizeText(stripTags(match[2]));
      if (!pronoun || !valueRaw) continue;
      let key = null;
      if (pronoun.startsWith("jo")) key = "jo";
      else if (pronoun.startsWith("tu")) key = "tu";
      else if (pronoun.startsWith("ell, ella")) key = "ell";
      else if (pronoun.startsWith("vostè")) key = "ell";
      else if (pronoun.startsWith("nosaltres")) key = "nosaltres";
      else if (pronoun.startsWith("vosaltres")) key = "vosaltres";
      else if (pronoun.startsWith("ells, elles")) key = "ells";
      else if (pronoun.startsWith("vostès")) key = "ells";
      if (!key) continue;
      const cleaned = valueRaw.split(",")[0].replace(/\(.*?\)/g, "").trim();
      forms[key] = cleaned;
    }
    return forms;
  };

  const extractFirstTableAfter = (sectionHtml, headingId) => {
    const startRe = new RegExp(`<h2[^>]*id=["']${headingId}["'][^>]*>`, "i");
    const startMatch = sectionHtml.match(startRe);
    if (!startMatch) return "";
    const startIndex = sectionHtml.indexOf(startMatch[0]);
    const afterStart = sectionHtml.slice(startIndex);
    const match = afterStart.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
    return match ? match[1] : "";
  };

  const tenses = {
    present: parseTable(extractTableById(cleanedHtml, "indicatiu-present")),
    imperfect: parseTable(extractTableById(cleanedHtml, "indicatiu-imperfet")),
    future: parseTable(extractTableById(cleanedHtml, "indicatiu-futur")),
    conditional: parseTable(extractTableById(cleanedHtml, "condicional")),
    subjunctive_present: parseTable(
      extractTableById(cleanedHtml, "subjuntiu-present")
    ),
    subjunctive_imperfect: parseTable(
      extractTableById(cleanedHtml, "subjuntiu-imperfet")
    ),
    imperative: parseTable(extractFirstTableAfter(cleanedHtml, "mode-imperatiu")),
  };

  const requiredByTense = {
    present: PERSON_LABELS,
    imperfect: PERSON_LABELS,
    future: PERSON_LABELS,
    conditional: PERSON_LABELS,
    subjunctive_present: PERSON_LABELS,
    subjunctive_imperfect: PERSON_LABELS,
  };

  for (const [tense, requiredPersons] of Object.entries(requiredByTense)) {
    for (const person of requiredPersons) {
      if (!tenses[tense][person]) {
        throw new Error(`Missing ${person} for ${infinitive} (${tense})`);
      }
    }
  }

  return tenses;
}

async function fetchConjugationUrl(infinitive) {
  const url = `https://www.verbs.cat/en/conjugation.json?view=suggest&userinput=${encodeURIComponent(
    infinitive
  )}`;
  const cachePath = path.join(CACHE_DIR, `verbs-cat-suggest-${infinitive}.json`);
  let raw;
  if (fs.existsSync(cachePath)) {
    raw = fs.readFileSync(cachePath, "utf-8");
  } else {
    raw = await fetchText(url);
    fs.writeFileSync(cachePath, raw, "utf-8");
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse suggestion response for ${infinitive}`);
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No suggestions for ${infinitive}`);
  }
  const normalized = infinitive.toLowerCase();
  const exact = data.find((item) => item?.suggestion?.toLowerCase() === normalized);
  const chosen = exact || data[0];
  if (!chosen?.url) {
    throw new Error(`Missing conjugation URL for ${infinitive}`);
  }
  const resolved = new URL(chosen.url, "https://www.verbs.cat");
  return resolved.toString();
}

async function fetchConjugationHtml(infinitive) {
  const url = await fetchConjugationUrl(infinitive);
  return fetchText(url);
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



async function fetchIrregularConjugations(infinitive) {
  const cachePath = path.join(CACHE_DIR, `verbs-cat-${infinitive}.html`);
  let html;
  if (fs.existsSync(cachePath)) {
    html = fs.readFileSync(cachePath, "utf-8");
    if (!html.includes("Indicative mood")) {
      html = await fetchConjugationHtml(infinitive);
      fs.writeFileSync(cachePath, html, "utf-8");
    }
  } else {
    html = await fetchConjugationHtml(infinitive);
    fs.writeFileSync(cachePath, html, "utf-8");
  }
  return parseConjugationsFromHtml(html, infinitive);
}

async function main() {
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

  const selected = [];
  const missingTranslations = [];
  const orthographyCandidates = [];
  let rank = 0;

  for (const word of freqWords) {
    if (selected.length >= MAX_VERBS) break;
    if (!isVerbCandidate(word)) continue;
    const translationRaw = translationMap.get(word);
    if (!translationRaw) {
      missingTranslations.push(word);
      continue;
    }
    const translation = normalizeTranslation(translationRaw);
    if (/(car|gar|çar)$/i.test(word)) {
      rank += 1;
      orthographyCandidates.push({ infinitive: word, translation, rank });
      continue;
    }
    rank += 1;
    selected.push({ infinitive: word, translation, rank });
  }

  if (orthographyCandidates.length > 0) {
    console.log(`Including ${orthographyCandidates.length} orthographic verbs...`);
    for (const candidate of orthographyCandidates) {
      if (selected.length >= MAX_VERBS) break;
      selected.push(candidate);
    }
  }

  if (missingTranslations.length > 0) {
    fs.writeFileSync(
      path.join(CACHE_DIR, "missing-translations.txt"),
      missingTranslations.join("\n"),
      "utf-8"
    );
  }

  console.log("Fetching conjugations for selected verbs...");
  const verbs = [];
  const missingConjugations = [];

  for (const verb of selected) {
    try {
      const tenses = await fetchIrregularConjugations(verb.infinitive);
      const isOrthographic = /(car|gar|çar)$/i.test(verb.infinitive);
      const isIrregular = IRREGULAR_VERBS.has(verb.infinitive) || isOrthographic;
      verbs.push({
        infinitive: verb.infinitive,
        translation:
          normalizeTranslation(
            translationMap.get(verb.infinitive) ||
              verb.translation ||
              MANUAL_TRANSLATIONS[verb.infinitive] ||
              ""
          ) || "",
        regular: !isIrregular,
        group: getGroup(verb.infinitive),
        rank: verb.rank,
        tenses,
      });
      console.log(`Fetched ${verb.infinitive}`);
    } catch (error) {
      missingConjugations.push(`${verb.infinitive}: ${error.message}`);
      console.warn(`Skipping ${verb.infinitive}: ${error.message}`);
    }
  }

  if (missingConjugations.length > 0) {
    fs.writeFileSync(
      path.join(CACHE_DIR, "missing-conjugations.txt"),
      missingConjugations.join("\n"),
      "utf-8"
    );
  }

  const outputPath = path.join(__dirname, "..", "src", "data", "verbs.json");
  fs.writeFileSync(outputPath, JSON.stringify(verbs, null, 2), "utf-8");
  console.log(`Wrote ${verbs.length} verbs to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

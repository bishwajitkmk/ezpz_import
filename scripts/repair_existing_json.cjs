#!/usr/bin/env node
// One-off repair for the JSON written before the scraper fixes.
//
// Four things were wrong in the files already committed here:
//
//   1. curriculum.path said hsc/physics/1st on every item, because
//      CONFIG.subjectPath was left at its default. Chemistry, Math and
//      Physics 2nd Paper were all filed as Physics 1st Paper, which made them
//      collide with the real Physics rows on (subject, paper, board, year,
//      question number) and be rejected as duplicates. The right subject is
//      still recoverable from sources[0].exam_name, which was always correct.
//   2. clientId carried the same wrong subject.
//   3. Choice and part keys were lower case; the question bank keys Latin
//      options A B C D.
//   4. CQ items used a shape the contract does not define: stimulusText for
//      the stem, and parts of {key, questionText, answerText, assets} instead
//      of {ordinal, key, prompt, solution}. Part figures also carried roles
//      like part-c-answer, which is not a valid asset role.
//
// Three things this cannot repair, because the missing text is not in the
// file: items with no chapter, items with no correct choice, and items whose
// stem came back empty. All three are reported at the end and need filling in
// by hand against the paper.
//
// Usage: node scripts/repair_existing_json.cjs [--dry-run]

const fs = require('node:fs');
const path = require('node:path');

const DRY_RUN = process.argv.includes('--dry-run');
const SUBJECTS = [[/chem/i, 'chemistry'], [/bio/i, 'biology'], [/math/i, 'math'], [/phys/i, 'physics']];

function subjectPathFrom(examName, paper) {
  const found = SUBJECTS.find(([pattern]) => pattern.test(examName || ''));
  const printed = paper || ((examName || '').match(/1st|2nd/i) || [])[0];
  if (!found || !printed) return null;
  return `${found[1]}/${printed.toLowerCase()}`;
}

function upperLatin(key) {
  return typeof key === 'string' && /^[a-z]$/.test(key) ? key.toUpperCase() : key;
}

function findJsonFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findJsonFiles(full, out);
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

const repoRoot = path.resolve(__dirname, '..');
const skip = new Set([path.join(repoRoot, 'import-json', 'reference.json')]);
const files = findJsonFiles(repoRoot).filter(
  (f) => !skip.has(f) && !f.includes(`${path.sep}samples${path.sep}`)
);

const needChapter = [];
const needAnswer = [];
const needStem = [];
let filesChanged = 0;
let itemsRepathed = 0;
let itemsRekeyed = 0;
let itemsReshaped = 0;

for (const file of files) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    continue;
  }
  if (!Array.isArray(doc.items)) continue;

  const relative = path.relative(repoRoot, file);
  let changed = false;

  for (const item of doc.items) {
    const source = (item.sources || [])[0] || {};
    const subjectPath = subjectPathFrom(source.exam_name, source.paper);

    // 1 and 2: put the item under its real subject and paper.
    if (subjectPath) {
      const slug = subjectPath.replace('/', '');
      const currentPath = (item.curriculum || {}).path;
      if (currentPath) {
        const chapter = currentPath.split('/').pop();
        const corrected = `hsc/${subjectPath}/${chapter}`;
        if (corrected !== currentPath) {
          item.curriculum.path = corrected;
          itemsRepathed += 1;
          changed = true;
        }
      }
      if (typeof item.clientId === 'string') {
        const corrected = item.clientId.replace(
          /-(physics|chemistry|math|biology)(1st|2nd)-/,
          `-${slug}-`
        );
        if (corrected !== item.clientId) {
          item.clientId = corrected;
          changed = true;
        }
      }
    }

    if (!((item.curriculum || {}).path)) needChapter.push(`${relative}  ${item.clientId}`);

    // 3: Latin option keys are upper case in the bank.
    let rekeyed = false;
    for (const choice of item.choices || []) {
      const corrected = upperLatin(choice.key);
      if (corrected !== choice.key) {
        choice.key = corrected;
        rekeyed = true;
      }
    }
    if (rekeyed) {
      itemsRekeyed += 1;
      changed = true;
    }

    if ((item.choices || []).length > 0 && !item.choices.some((c) => c.isCorrect)) {
      needAnswer.push(`${relative}  ${item.clientId}`);
    }

    // 4: CQ items to the shape the contract defines.
    const locale = Object.keys(item.translations || {})[0] || 'bn';
    const translation = (item.translations || {})[locale] || {};
    let reshaped = false;

    if (typeof translation.stimulusText === 'string') {
      translation.questionText = translation.stimulusText;
      delete translation.stimulusText;
      if (translation.solutionText === undefined) translation.solutionText = null;
      reshaped = true;
    }

    if (Array.isArray(item.parts) && item.parts.some((part) => 'questionText' in part)) {
      item.assets = item.assets || [];
      item.parts = item.parts.map((part, index) => {
        for (const asset of part.assets || []) {
          // part-a-answer and friends are not valid asset roles.
          const role = /answer|solution/i.test(asset.role || '') ? 'solution' : 'part';
          item.assets.push({ ...asset, role });
        }
        const repaired = {
          ordinal: index + 1,
          key: upperLatin(part.key),
          prompt: { [locale]: part.questionText },
        };
        if (part.answerText) repaired.solution = { [locale]: part.answerText };
        return repaired;
      });
      reshaped = true;
    }

    if (reshaped) {
      itemsReshaped += 1;
      changed = true;
    }

    for (const [code, text] of Object.entries(item.translations || {})) {
      if (!(text.questionText || '').trim()) needStem.push(`${relative}  ${item.clientId}  (${code})`);
    }
  }

  if (changed) {
    filesChanged += 1;
    if (!DRY_RUN) fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
  }
}

console.log(`${DRY_RUN ? 'Would change' : 'Changed'} ${filesChanged} file(s).`);
console.log(`  curriculum.path corrected: ${itemsRepathed} item(s)`);
console.log(`  option keys upper-cased:   ${itemsRekeyed} item(s)`);
console.log(`  CQ items reshaped:         ${itemsReshaped} item(s)`);

if (needChapter.length > 0) {
  console.log(`\nNo chapter, curriculum.path is null. Fill these in by hand (${needChapter.length}):`);
  for (const line of needChapter) console.log(`  ${line}`);
}
if (needAnswer.length > 0) {
  console.log(`\nNo correct choice. Fill the answer in by hand (${needAnswer.length}):`);
  for (const line of needAnswer) console.log(`  ${line}`);
}
if (needStem.length > 0) {
  console.log(`\nEmpty question text. Copy the stem from the paper (${needStem.length}):`);
  for (const line of needStem) console.log(`  ${line}`);
}

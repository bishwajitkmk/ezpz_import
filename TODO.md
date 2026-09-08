# TODO

The pipeline faults are fixed. What is left is content that was never captured,
so it cannot be recovered from the files in this repo. Each item below has to be
read off the paper by a person.

Run `node scripts/repair_existing_json.cjs` at any time to reprint the three
lists below from the current files. It is idempotent and safe to re-run.

Check your work with `node check.cjs <file>`. Zero errors means the file is
ready. There are **105 errors** across the tree right now, all of them from the
items listed here.

---

## 1. English for all 1213 items

Every item in this repo is Bengali only. Not one has English. The old scrapers
hardcoded `bn` and never looked for English, so the text was never captured.

Bengali only is **valid** and imports fine, so this is an improvement, not a
blocker. Do it paper by paper.

**Before starting, confirm the source page actually has an English view.** If it
does not, this task cannot be done from the scraper and the content stays
Bengali only.

Once confirmed, for each paper: scrape Bengali, switch the page to English,
re-run with `&lang=en`, then download. The two passes merge on `clientId`. See
`scripts/README.md`.

| Paper | Items | Files |
|---|---|---|
| HSC Physics 1st Paper | 524 | `Phy/1st/**` |
| HSC Chemistry 1st Paper | 200 | `Che/1st/**` |
| HSC Chemistry 2nd Paper | 200 | `Che/2nd/**` |
| HSC Physics 2nd Paper | 125 | `Phy/2nd/**` |
| HSC Higher Math 2nd Paper | 100 | `Math/MCQ/2nd/**` |
| HSC Higher Math 1st Paper | 64 | `Math/CQ/1st/**` |

54 papers, 1213 items.

Worth checking first: many of these papers are already in the question bank in
English. Pulling the English side from there may be cheaper than re-scraping
every paper. Ask before doing 54 papers by hand.

---

## 2. Missing chapter, 51 items

`curriculum.path` is `null`. The chapter was never printed where the scraper
looked. Set it to `hsc/<subject>/<paper>/chapter-N` using the chapter list at
the end of `GUIDE.md`.

These are almost all the first question of a file, plus one whole file.

| File | Items | Question numbers |
|---|---|---|
| `Phy/1st/2025/comilla-phy-1st-2025-mcq.json` | 25 | 1 to 25, the whole file |
| `Che/2nd/2017/barisal-chem-2nd-2017-mcq.json` | 7 | 1, 2, 3, 4, 5, 6, 7 |
| `Che/2nd/2017/rajshahi-chem-2nd-2017-mcq.json` | 5 | 1, 2, 3, 4, 5 |
| `Che/1st/2017/rajshahi-chem-1st-2017-mcq.json` | 2 | 1, 2 |
| `Phy/1st/2017/rajshahi-phy-1st-2017-mcq.json` | 2 | 1, 2 |
| `Phy/2nd/2018/combined-phy-2nd-2018-mcq.json` | 2 | 1, 2 |
| `Che/1st/2017/dhaka-chem-1st-2017-mcq.json` | 1 | 1 |
| `Che/1st/2017/dinajpur-chem-1st-2017-mcq.json` | 1 | 1 |
| `Che/1st/2017/jessore-chem-1st-2017-mcq.json` | 1 | 1 |
| `Che/2nd/2017/dhaka-chem-2nd-2017-mcq.json` | 1 | 1 |
| `Che/2nd/2017/jessore-chem-2nd-2017-mcq.json` | 1 | 1 |
| `Che/2nd/2017/sylhet-chem-2nd-2017-mcq.json` | 1 | 1 |
| `Phy/1st/2017/barisal-phy-1st-2017-mcq.json` | 1 | 1 |
| `Phy/1st/2025/sylhet-phy-1st-2025-mcq.json` | 1 | 1 |

Do not guess a chapter. If it is unclear, use the closest match and set
`provenance.confidence` below 0.8 so the item goes to review.

---

## 3. Empty question text, 2 items

The stem came back blank. Copy it from the paper.

- `Math/CQ/1st/2017/barisal-math-1st-2017-cq.json` — `barisal-2017-math1st-cq08`
- `Phy/1st/2019/dinajpur-phy-1st-2019-mcq.json` — `dinajpur-2019-physics1st-q23`

---

## 4. No correct answer, 1 item

Every choice is `isCorrect: false`. Mark the right one from the answer key.

- `Math/MCQ/2nd/2025/mymensingh-math-2nd-2025-mcq.json` — `mymensingh-2025-math2nd-q24`

---

## Fixed, do not redo

These were pipeline faults, not content. They are corrected in the scrapers, so
a new scrape will not reintroduce them.

- Subject and paper are read from the page's `sub` label. The old hardcoded
  `physics/1st` filed all Chemistry, Math and Physics 2nd Paper content under
  Physics 1st Paper, which made it collide with the real Physics rows and be
  rejected as a duplicate.
- Latin option and part keys are upper case, matching the question bank.
- CQ items use `questionText` and `{ordinal, key, prompt, solution}` parts.
- Part figures use the asset roles `part` and `solution`.
- The chapter falls back to the card text, the last chapter seen, then
  `&chapter=N`, instead of writing `null`.
- `provenance` points at the source page and lowers `confidence` below 0.8 when
  the answer or chapter was not read cleanly.

---

## When importing

These will arrive as new items, not merged into what is already in the bank.
The bank holds many of these papers in English, and a Bengali-only item does not
exact-match an English one, so it goes to similarity review instead. Expect a
review queue rather than a silent clean import.

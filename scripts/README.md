# Scrapers

`mcq_script.js` and `cq_script.js` are pasted into the browser console on a
question page. Both read their settings from the page URL, so nothing is
hardcoded per subject any more.

## URL parameters

| parameter | meaning |
|---|---|
| `boardName` | board name as the guide spells it, e.g. `Barisal` |
| `year` | four digit year |
| `sub` | the paper label, e.g. `Chemistry 2nd Paper`. Subject and paper are read from this |
| `current` | page number, recorded as `provenance.page` |
| `lang` | `bn` (default) or `en`. Write only the language the page is showing |
| `subjectPath` | override, e.g. `chemistry/2nd`. Only needed when `sub` is missing or unusual |
| `chapter` | fallback chapter number for pages that never print "Chapter N" |

The script stops with an error rather than guessing if it cannot work out the
subject and paper from `sub`. That guess was previously `physics/1st` for
everything, which filed all Chemistry, Math and Physics 2nd Paper content
under Physics 1st Paper.

## Both languages

One run captures one language. `clientId` carries no language, so a second run
over the same paper in the other language merges into the first, filling in
the missing stem, options, part prompts and part solutions:

1. Scrape the Bengali view: `...&lang=bn`
2. Switch the page to English, re-run with `...&lang=en`
3. `downloadJSON()` (MCQ) or `downloadCQBundle()` (CQ)

The console prints which languages it holds after every run. A file with one
language is valid and imports fine, so stop after step 1 if the paper only
exists in Bengali.

## Before sending

    node check.cjs yourfile.json

Zero errors means it is ready. Warnings are fine.

## repair_existing_json.cjs

A one-off pass over the JSON committed before these fixes. It corrects the
subject in `curriculum.path` and `clientId`, upper-cases Latin option keys, and
rewrites CQ items into the shape the contract defines. It is idempotent, and it
prints the items it cannot repair because the text is not in the file.

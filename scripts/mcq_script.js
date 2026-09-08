(async function () {
  const params = new URLSearchParams(location.search);

  // Subject and paper are read from the page's own `sub` label, never
  // hardcoded. The old `subjectPath: 'physics/1st'` constant was left at its
  // default on every Chemistry, Math and Physics-2nd scrape, which filed all
  // of that content under Physics 1st Paper and made it collide with the
  // real Physics rows on (subject, paper, board, year, question number).
  const SUBJECTS = [
    [/chem/i, 'chemistry'],
    [/bio/i, 'biology'],
    [/math/i, 'math'],
    [/phys/i, 'physics'],
  ];

  function subjectPathFrom(label) {
    const override = params.get('subjectPath');
    if (override) return override;
    const found = SUBJECTS.find(([pattern]) => pattern.test(label));
    const paper = (label.match(/1st|2nd/i) || [])[0];
    if (!found || !paper) return null;
    return `${found[1]}/${paper.toLowerCase()}`;
  }

  const CONFIG = {
    board: params.get('boardName') || 'Unknown',
    year: Number(params.get('year')) || null,
    subjectLabel: params.get('sub') || 'Unknown',
    subjectPath: subjectPathFrom(params.get('sub') || ''),
    // The paper is only ever Bengali or English; the scraper writes whichever
    // language the page is currently showing. Run it once per language and
    // the two passes merge on clientId.
    locale: params.get('lang') === 'en' ? 'en' : 'bn',
    // Fallback chapter for pages that do not print "Chapter N" anywhere.
    chapterFallback: params.get('chapter') || null,
    page: Number(params.get('current')) || null,
  };

  if (!CONFIG.subjectPath) {
    console.error(
      `Cannot tell the subject and paper from sub="${CONFIG.subjectLabel}". ` +
      'Re-run with &subjectPath=chemistry/2nd (or the right subject/paper).'
    );
    return;
  }

  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Provenance has to point at something a reviewer can re-open. Hashing the
  // label string gave every question of a paper the same meaningless digest,
  // so hash the page URL the questions were actually read from.
  CONFIG.sourceUrl = location.origin + location.pathname + location.search;
  CONFIG.sourceDocumentSha256 = await sha256Hex(CONFIG.sourceUrl);

  const GREEK = {
    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'Γ': '\\Gamma', 'δ': '\\delta', 'Δ': '\\Delta',
    'ε': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'Θ': '\\Theta', 'ι': '\\iota',
    'κ': '\\kappa', 'λ': '\\lambda', 'Λ': '\\Lambda', 'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi',
    'π': '\\pi', 'Π': '\\Pi', 'ρ': '\\rho', 'σ': '\\sigma', 'Σ': '\\Sigma', 'τ': '\\tau',
    'φ': '\\phi', 'Φ': '\\Phi', 'χ': '\\chi', 'ψ': '\\psi', 'Ψ': '\\Psi', 'ω': '\\omega', 'Ω': '\\Omega',
    '∂': '\\partial',
  };

  const FUNCTIONS = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lim', 'exp', 'min', 'max'];

  const OPERATORS = {
    '−': '-', '×': '\\times', '÷': '\\div', '⋅': '\\cdot', '·': '\\cdot',
    '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx', '∞': '\\infty',
    '→': '\\to', '±': '\\pm', '∘': '\\circ', '∫': '\\int', '∑': '\\sum', '∏': '\\prod',
    '{': '\\{', '}': '\\}',
  };

  function mapSymbol(text) {
    if (GREEK[text]) return GREEK[text];
    if (FUNCTIONS.includes(text)) return '\\' + text;
    return text;
  }

  function mapOperator(text) {
    return OPERATORS[text] !== undefined ? OPERATORS[text] : text;
  }

  function wrapBrace(latex) {
    return '{' + latex + '}';
  }

  function childrenToLatex(node) {
    return Array.from(node.childNodes).map(mmlToLatex).join('');
  }

  function mmlToLatex(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const kids = Array.from(node.children);

    switch (tag) {
      case 'math':
      case 'mrow':
      case 'mstyle':
      case 'mpadded':
      case 'mphantom':
        return childrenToLatex(node);
      case 'mn':
        return node.textContent;
      case 'mi':
        return mapSymbol(node.textContent);
      case 'mo':
        return mapOperator(node.textContent);
      case 'mtext':
        return '\\text{' + node.textContent + '}';
      case 'mspace':
        return ' ';
      case 'msup':
        return wrapBrace(mmlToLatex(kids[0])) + '^' + wrapBrace(mmlToLatex(kids[1]));
      case 'msub':
        return wrapBrace(mmlToLatex(kids[0])) + '_' + wrapBrace(mmlToLatex(kids[1]));
      case 'msubsup':
        return (
          wrapBrace(mmlToLatex(kids[0])) +
          '_' + wrapBrace(mmlToLatex(kids[1])) +
          '^' + wrapBrace(mmlToLatex(kids[2]))
        );
      case 'mfrac':
        return '\\frac' + wrapBrace(mmlToLatex(kids[0])) + wrapBrace(mmlToLatex(kids[1]));
      case 'msqrt':
        return '\\sqrt' + wrapBrace(childrenToLatex(node));
      case 'mroot':
        return '\\sqrt[' + mmlToLatex(kids[1]) + ']' + wrapBrace(mmlToLatex(kids[0]));
      case 'mover': {
        const base = mmlToLatex(kids[0]);
        const overText = kids[1] ? kids[1].textContent.trim() : '';
        if (overText === '^' || overText === 'ˆ') return '\\hat' + wrapBrace(base);
        if (overText === '\u2192') return '\\vec' + wrapBrace(base);
        if (overText === '\u00AF' || overText === '-') return '\\overline' + wrapBrace(base);
        if (overText === '~') return '\\tilde' + wrapBrace(base);
        return '\\overset' + wrapBrace(mmlToLatex(kids[1])) + wrapBrace(base);
      }
      case 'munder':
        return '\\underset' + wrapBrace(mmlToLatex(kids[1])) + wrapBrace(mmlToLatex(kids[0]));
      case 'munderover':
        return (
          mmlToLatex(kids[0]) +
          '_' + wrapBrace(mmlToLatex(kids[1])) +
          '^' + wrapBrace(mmlToLatex(kids[2]))
        );
      case 'mtable':
        return '\\begin{matrix}' + kids.map(mmlToLatex).join('\\\\ ') + '\\end{matrix}';
      case 'mtr':
        return kids.map(mmlToLatex).join(' & ');
      case 'mtd':
        return childrenToLatex(node);
      case 'semantics': {
        const annotation = node.querySelector(':scope > annotation[encoding="application/x-tex"]');
        if (annotation) return annotation.textContent.trim();
        return kids.length ? mmlToLatex(kids[0]) : '';
      }
      default:
        return childrenToLatex(node);
    }
  }

  function texify(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')));

    // Space-guard: prevent Bangla text and inline math from fusing together
    // when the source has no explicit whitespace between them (e.g. "...সাপেক্ষে$\vec{F}$...").
    clone.querySelectorAll('mjx-container, span.katex').forEach((el) => {
      const prev = el.previousSibling;
      if (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.length && !/\s$/.test(prev.textContent)) {
        prev.textContent += ' ';
      }
      const next = el.nextSibling;
      if (next && next.nodeType === Node.TEXT_NODE && next.textContent.length && !/^\s/.test(next.textContent)) {
        next.textContent = ' ' + next.textContent;
      }
    });

    clone.querySelectorAll('mjx-container').forEach((mjx) => {
      const mathEl = mjx.querySelector('mjx-assistive-mml math') || mjx.querySelector('math');
      const latex = mathEl ? mmlToLatex(mathEl).trim() : mjx.textContent.trim();
      mjx.replaceWith(document.createTextNode('$' + latex + '$'));
    });

    clone.querySelectorAll('span.katex').forEach((katex) => {
      const annotation = katex.querySelector('annotation[encoding="application/x-tex"]');
      const tex = annotation ? annotation.textContent.trim() : katex.textContent.trim();
      katex.replaceWith(document.createTextNode('$' + tex + '$'));
    });

    return clone.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
  }

  function findCards() {
    return Array.from(document.querySelectorAll('div')).filter(
      (d) =>
        d.classList.contains('rounded-2xl') &&
        d.classList.contains('shadow-sm') &&
        d.classList.contains('overflow-hidden') &&
        d.classList.contains('border')
    );
  }

  let lastChapterNumber = null;

  // Correct answer only gets its emerald highlight class AFTER the user
  // picks an option on the page. If scraping runs before any pick, every
  // choice reads isCorrect:false and the whole item fails validation.
  // Auto-click one option first so the DOM reveals the real answer.
  async function revealAnswer(card) {
    const alreadyRevealed = Array.from(card.querySelectorAll('button')).some((b) =>
      b.className.includes('emerald')
    );
    if (alreadyRevealed) return;

    const firstBtn = card.querySelector('button');
    if (!firstBtn) return;

    firstBtn.click();
    // give the UI time to paint the emerald/red state + any animation
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  async function scrapeCard(card) {
    const numberBadge = card.querySelector('span.rounded-lg.poppins');
    const questionNumber = numberBadge ? numberBadge.textContent.trim() : null;
    if (!questionNumber) return null;

    await revealAnswer(card);

    const questionEl = card.querySelector('div.noto.font-medium');
    const questionText = questionEl ? texify(questionEl) : '';

    // p.poppins alone missed the chapter on some pages and left curriculum.path
    // null for the whole file, so fall back to the card text, then to the last
    // chapter seen, then to the ?chapter= override.
    const chapterEl = card.querySelector('p.poppins');
    const chapterMatch =
      (chapterEl && chapterEl.textContent.match(/Chapter\s*(\d+)/i)) ||
      card.textContent.match(/Chapter\s*(\d+)/i);
    const chapterNumber = chapterMatch
      ? chapterMatch[1]
      : lastChapterNumber || CONFIG.chapterFallback;
    const chapterIsExact = Boolean(chapterMatch);
    if (chapterMatch) lastChapterNumber = chapterMatch[1];
    if (!chapterNumber) {
      console.warn(`No chapter found for question ${questionNumber} — pass &chapter=N.`);
    }

    const choiceButtons = Array.from(card.querySelectorAll('button')).filter((b) =>
      b.querySelector('span.rounded-full')
    );
    if (choiceButtons.length === 0) return null;

    const choices = choiceButtons.map((btn, i) => {
      // The page prints a b c d; the question bank keys Latin options A B C D.
      // Lower case keys never matched an existing question, so every re-scrape
      // came back as a new item instead of the one already in the bank.
      const rawKey = btn.querySelector('span.rounded-full').textContent.trim();
      const key = /^[a-z]$/.test(rawKey) ? rawKey.toUpperCase() : rawKey;
      const textEl = btn.querySelector('div.noto');
      const isCorrect = btn.className.includes('emerald');
      return {
        ordinal: i + 1,
        key,
        isCorrect,
        body: { [CONFIG.locale]: textEl ? texify(textEl) : '' },
      };
    });

    const answerFound = choices.some((c) => c.isCorrect);
    if (!answerFound) {
      console.warn(`No correct choice detected for question ${questionNumber} — check reveal logic / class names.`);
    }

    const explanationEl = card.querySelector('div.bg-sky-50 div.noto');
    const explanationText = explanationEl ? texify(explanationEl) : '';
    const solutionText = explanationText.length > 0 ? explanationText : null;

    const subjectSlug = CONFIG.subjectPath.replace('/', '');
    const clientId = `${CONFIG.board.toLowerCase()}-${CONFIG.year}-${subjectSlug}-q${questionNumber}`;
    const paperMatch = CONFIG.subjectLabel.match(/1st|2nd/i);

    return {
      clientId,
      curriculum: {
        path: chapterNumber ? `hsc/${CONFIG.subjectPath}/chapter-${chapterNumber}` : null,
      },
      questionNumber,
      formatCode: 'mcq_single',
      translations: {
        [CONFIG.locale]: {
          questionText,
          solutionText,
        },
      },
      choices,
      assets: [],
      provenance: {
        sourceDocumentSha256: CONFIG.sourceDocumentSha256,
        page: CONFIG.page,
        bbox: null,
        extractorModel: 'ezpz-mcq-scraper',
        promptVersion: 'import-json-guide-2026-09',
        // Under 0.8 sends the item to review, which is where anything with a
        // missing answer or a guessed chapter belongs.
        confidence: answerFound && chapterIsExact ? 1 : 0.5,
      },
      sources: [
        {
          source_type: 'board_exam',
          exam_category_code: 'board',
          organization: CONFIG.board,
          exam_name: `HSC ${CONFIG.subjectLabel}`,
          year: CONFIG.year,
          session: null,
          paper: paperMatch ? paperMatch[0] : null,
          unit_name: null,
          set_name: null,
          source_reference: null,
          source_item_reference: questionNumber,
        },
      ],
    };
  }

  window.__scrapedItems = window.__scrapedItems || [];

  // A second pass over the same paper in the other language must fill in the
  // missing locale, not overwrite the first pass. clientId carries no
  // language, so the two passes line up item by item and choice by choice.
  function mergeItem(existing, incoming) {
    const merged = { ...incoming };
    merged.translations = { ...existing.translations, ...incoming.translations };
    merged.choices = incoming.choices.map((choice) => {
      const previous = existing.choices.find((c) => c.key === choice.key);
      return previous ? { ...choice, body: { ...previous.body, ...choice.body } } : choice;
    });
    return merged;
  }

  async function scrapePage() {
    const cards = findCards();
    let added = 0;
    let updated = 0;

    for (const card of cards) {
      const item = await scrapeCard(card);
      if (!item) continue;

      const idx = window.__scrapedItems.findIndex((x) => x.clientId === item.clientId);
      if (idx === -1) {
        window.__scrapedItems.push(item);
        added++;
      } else {
        window.__scrapedItems[idx] = mergeItem(window.__scrapedItems[idx], item);
        updated++;
      }
    }

    const languages = new Set();
    window.__scrapedItems.forEach((item) => {
      Object.keys(item.translations).forEach((locale) => languages.add(locale));
    });
    console.log(
      `Added ${added}, updated ${updated}. Total: ${window.__scrapedItems.length}. ` +
      `Languages: ${[...languages].join(', ')}.`
    );
    if (languages.size === 1) {
      console.log(
        `Only ${[...languages][0]} captured. If this paper also has the other ` +
        'language, switch the page to it and re-run with &lang=' +
        (CONFIG.locale === 'bn' ? 'en' : 'bn') + ' before downloading.'
      );
    }
    return window.__scrapedItems;
  }

  function downloadJSON(filename) {
    const output = {
      schemaVersion: 'ezpz-content-import-v2',
      items: window.__scrapedItems,
    };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'scraped.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  window.scrapePage = scrapePage;
  window.downloadJSON = downloadJSON;
  await scrapePage();
})();
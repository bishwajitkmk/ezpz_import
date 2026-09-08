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

  async function sha256HexBytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function sha256HexText(text) {
    return sha256HexBytes(new TextEncoder().encode(text));
  }

  // Hash the page the questions were read from, not a label string: every
  // item of a paper used to share one digest that identified nothing.
  CONFIG.sourceUrl = location.origin + location.pathname + location.search;
  CONFIG.sourceDocumentSha256 = await sha256HexText(CONFIG.sourceUrl);

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
    '\u2061': '', // invisible function application (e.g. after cos, sin, log)
    '\u2062': '', // invisible times
    '\u2063': '', // invisible separator
    '\u2064': '', // invisible plus
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

  const MIME_EXT = {
    'image/svg+xml': 'svg',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };

  function extFromMime(mime) {
    return MIME_EXT[(mime || '').split(';')[0].trim()] || null;
  }

  function extFromUrl(url) {
    const match = (url || '').match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
    return match ? match[1].toLowerCase() : null;
  }

  // Pulls <img> and inline <svg> out of the clone, replaces each with a
  // "[IMG_n]" placeholder in the text stream, and pushes a preliminary
  // descriptor into assetsOut. Bytes/hash are resolved later by finalizeAssets,
  // since hashing requires an async crypto call.
  function extractImages(clone, assetsOut, role) {
    clone.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      const dataMatch = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
      const idx = assetsOut.length;
      if (dataMatch) {
        assetsOut.push({
          index: idx,
          role,
          kind: 'data',
          mimeType: dataMatch[1],
          dataB64: dataMatch[2],
        });
      } else {
        assetsOut.push({ index: idx, role, kind: 'url', url: src });
      }
      img.replaceWith(document.createTextNode(`[IMG_${idx}]`));
    });

    clone.querySelectorAll('svg').forEach((svg) => {
      const idx = assetsOut.length;
      assetsOut.push({ index: idx, role, kind: 'inline-svg', markup: svg.outerHTML });
      svg.replaceWith(document.createTextNode(`[IMG_${idx}]`));
    });
  }

  // Composites a raster image (which may have alpha transparency) onto a
  // white background and re-encodes it as PNG.
  function rasterizeWithWhiteBackground(bytes, mimeType) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([bytes], { type: mimeType || 'image/png' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((outBlob) => {
          outBlob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
        }, 'image/png');
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      };
      img.src = url;
    });
  }

  // Inserts a white background <rect> as the first child of an SVG's root,
  // so it no longer renders transparent when viewed outside the page.
  function addWhiteBackgroundToSvg(markup) {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const svgEl = doc.documentElement;
    const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', 'white');
    svgEl.insertBefore(rect, svgEl.firstChild);
    return new XMLSerializer().serializeToString(svgEl);
  }

  // Resolves each preliminary descriptor to real bytes, hashes it, stores the
  // bytes in window.__imageBytes keyed by hash (dedupes identical images),
  // and rewrites assetsOut entries to the clean {sha256, role, page, bbox}
  // shape used in the schema. All raster/SVG output gets a white background.
  async function finalizeAssets(assetsOut) {
    window.__imageBytes = window.__imageBytes || new Map();

    for (let i = 0; i < assetsOut.length; i++) {
      const a = assetsOut[i];
      let bytes;
      let ext;

      if (a.kind === 'data') {
        const binary = atob(a.dataB64);
        const rawBytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) rawBytes[j] = binary.charCodeAt(j);
        if (a.mimeType === 'image/svg+xml') {
          bytes = new TextEncoder().encode(addWhiteBackgroundToSvg(new TextDecoder().decode(rawBytes)));
          ext = 'svg';
        } else {
          bytes = await rasterizeWithWhiteBackground(rawBytes, a.mimeType);
          ext = 'png';
        }
      } else if (a.kind === 'url') {
        const res = await fetch(a.url, { credentials: 'same-origin' });
        const buf = await res.arrayBuffer();
        const rawBytes = new Uint8Array(buf);
        const detectedExt = extFromMime(res.headers.get('content-type')) || extFromUrl(a.url) || 'bin';
        if (detectedExt === 'svg') {
          bytes = new TextEncoder().encode(addWhiteBackgroundToSvg(new TextDecoder().decode(rawBytes)));
          ext = 'svg';
        } else {
          bytes = await rasterizeWithWhiteBackground(rawBytes, res.headers.get('content-type'));
          ext = 'png';
        }
      } else if (a.kind === 'inline-svg') {
        bytes = new TextEncoder().encode(addWhiteBackgroundToSvg(a.markup));
        ext = 'svg';
      } else {
        bytes = new Uint8Array(0);
        ext = 'bin';
      }

      const sha256 = await sha256HexBytes(bytes);
      if (!window.__imageBytes.has(sha256)) {
        window.__imageBytes.set(sha256, { bytes, ext });
      }

      assetsOut[i] = { sha256, role: a.role, page: CONFIG.page, bbox: null };
    }
  }

  function texify(root, assetsOut, role) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')));

    if (assetsOut) extractImages(clone, assetsOut, role);

    // Space-guard: keep Bangla text and inline math from fusing together when
    // the source has no whitespace between them.
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

  // Each CQ part lives in its own accordion wrapper: a div.rounded-lg.border
  // holding a <button> (question) that, on click, reveals the answer as a
  // sibling block inside the same wrapper. Only one part stays expanded at a
  // time, so parts must be scraped one-by-one, in order.
  function findParts(card) {
    return Array.from(card.querySelectorAll('div.rounded-lg.border')).filter((d) =>
      d.querySelector('button span.rounded-full')
    );
  }

  async function revealPart(partEl) {
    const notoBefore = partEl.querySelectorAll('div.noto').length;
    if (notoBefore > 1) return; // already expanded from a previous run

    const btn = partEl.querySelector('button');
    if (!btn) return;

    btn.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  let lastChapterNumber = null;

  async function scrapeCard(card) {
    const numberBadge = card.querySelector('span.rounded-lg.poppins, span.poppins.font-bold');
    const questionNumber = numberBadge ? numberBadge.textContent.trim() : null;
    if (!questionNumber) return null;

    const stimulusAssets = [];
    const stimulusEl = card.querySelector('div.noto.font-medium');
    const stimulusText = stimulusEl ? texify(stimulusEl, stimulusAssets, 'stem') : '';
    await finalizeAssets(stimulusAssets);

    // Fall back to the card text, the last chapter seen, then ?chapter=,
    // rather than emitting curriculum.path null.
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

    const partEls = findParts(card);
    if (partEls.length === 0) return null;

    // A part is {ordinal, key, prompt per locale, solution per locale}. The
    // old {key, questionText, answerText, assets} shape is not in the
    // contract, so every CQ file written before this was rejected outright.
    // Part figures belong to the item's assets[] with role part or solution;
    // roles like "part-a-question" are not valid asset roles.
    const parts = [];
    const partAssets = [];
    let ordinal = 0;
    for (const partEl of partEls) {
      ordinal += 1;
      const keyEl = partEl.querySelector('button span.rounded-full');
      const rawKey = keyEl ? keyEl.textContent.trim() : null;
      const key = rawKey && /^[a-z]$/.test(rawKey) ? rawKey.toUpperCase() : rawKey;

      const promptAssets = [];
      const questionEl = partEl.querySelector('button div.noto');
      const promptText = questionEl ? texify(questionEl, promptAssets, 'part') : '';
      await finalizeAssets(promptAssets);

      await revealPart(partEl);

      const notoDivs = Array.from(partEl.querySelectorAll('div.noto'));
      const answerEls = notoDivs.slice(1);
      const solutionAssets = [];
      const solutionText = answerEls.length
        ? answerEls.map((el) => texify(el, solutionAssets, 'solution')).join('\n\n')
        : null;
      await finalizeAssets(solutionAssets);

      if (!solutionText) {
        console.warn(`Part "${key}" of question ${questionNumber} has no revealed answer — click/selector may need adjusting.`);
      }

      partAssets.push(...promptAssets, ...solutionAssets);

      const part = {
        ordinal,
        key,
        prompt: { [CONFIG.locale]: promptText },
      };
      // The guide leaves the solution key out when the paper gives none.
      if (solutionText) part.solution = { [CONFIG.locale]: solutionText };
      parts.push(part);
    }
    const answersFound = parts.every((part) => part.solution);

    const subjectSlug = CONFIG.subjectPath.replace('/', '');
    const clientId = `${CONFIG.board.toLowerCase()}-${CONFIG.year}-${subjectSlug}-cq${questionNumber}`;
    const paperMatch = CONFIG.subjectLabel.match(/1st|2nd/i);

    return {
      clientId,
      curriculum: {
        path: chapterNumber ? `hsc/${CONFIG.subjectPath}/chapter-${chapterNumber}` : null,
      },
      questionNumber,
      formatCode: 'cq',
      translations: {
        // The stem of a CQ is questionText like any other format. stimulusText
        // is not a key the contract knows.
        [CONFIG.locale]: {
          questionText: stimulusText,
          solutionText: null,
        },
      },
      parts,
      assets: [...stimulusAssets, ...partAssets],
      provenance: {
        sourceDocumentSha256: CONFIG.sourceDocumentSha256,
        page: CONFIG.page,
        bbox: null,
        extractorModel: 'ezpz-cq-scraper',
        promptVersion: 'import-json-guide-2026-09',
        confidence: answersFound && chapterIsExact ? 1 : 0.5,
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

  window.__scrapedCQItems = window.__scrapedCQItems || [];

  // A second pass in the other language fills in the missing locale on the
  // stem and on every part, instead of replacing the first pass.
  function mergeItem(existing, incoming) {
    const merged = { ...incoming };
    merged.translations = { ...existing.translations, ...incoming.translations };
    merged.parts = incoming.parts.map((part) => {
      const previous = existing.parts.find((p) => p.key === part.key);
      if (!previous) return part;
      const solution = { ...(previous.solution || {}), ...(part.solution || {}) };
      const filled = { ...part, prompt: { ...previous.prompt, ...part.prompt } };
      if (Object.keys(solution).length > 0) filled.solution = solution;
      return filled;
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

      const idx = window.__scrapedCQItems.findIndex((x) => x.clientId === item.clientId);
      if (idx === -1) {
        window.__scrapedCQItems.push(item);
        added++;
      } else {
        window.__scrapedCQItems[idx] = mergeItem(window.__scrapedCQItems[idx], item);
        updated++;
      }
    }

    const languages = new Set();
    window.__scrapedCQItems.forEach((item) => {
      Object.keys(item.translations).forEach((locale) => languages.add(locale));
    });
    console.log(
      `Added ${added}, updated ${updated}. Total: ${window.__scrapedCQItems.length}. ` +
      `Images cached: ${window.__imageBytes ? window.__imageBytes.size : 0}. ` +
      `Languages: ${[...languages].join(', ')}.`
    );
    if (languages.size === 1) {
      console.log(
        `Only ${[...languages][0]} captured. If this paper also has the other ` +
        'language, switch the page to it and re-run with &lang=' +
        (CONFIG.locale === 'bn' ? 'en' : 'bn') + ' before downloading.'
      );
    }
    return window.__scrapedCQItems;
  }

  function downloadCQJSON(filename) {
    const output = { schemaVersion: 'ezpz-content-import-v2', items: window.__scrapedCQItems };
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'scraped-cq.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function crc32(data) {
    let crc = ~0;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return ~crc >>> 0;
  }

  // Minimal ZIP writer, STORE method (no compression). Self-contained so we
  // don't have to load a third-party library into the page's console context,
  // which could be blocked by the site's CSP.
  function buildZip(files) {
    const encoder = new TextEncoder();
    let offset = 0;
    const localParts = [];
    const centralParts = [];

    for (const file of files) {
      const nameBytes = encoder.encode(file.name);
      const data = file.data;
      const crc = crc32(data);
      const size = data.length;

      const localHeader = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(localHeader.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, data);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(centralHeader.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);

      offset += localHeader.length + data.length;
    }

    const centralStart = offset;
    const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);

    const endRecord = new Uint8Array(22);
    const ev = new DataView(endRecord.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralStart, true);
    ev.setUint16(20, 0, true);

    const allParts = [...localParts, ...centralParts, endRecord];
    const totalLength = allParts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let pos = 0;
    for (const part of allParts) {
      result.set(part, pos);
      pos += part.length;
    }
    return result;
  }

  function downloadCQBundle(baseName) {
    const name = baseName || 'export';
    const output = { schemaVersion: 'ezpz-content-import-v2', items: window.__scrapedCQItems };
    const jsonBytes = new TextEncoder().encode(JSON.stringify(output, null, 2));

    const files = [{ name: `${name}.json`, data: jsonBytes }];
    const imageBytes = window.__imageBytes || new Map();
    imageBytes.forEach((val, sha) => {
      files.push({ name: `assets/${sha}.${val.ext}`, data: val.bytes });
    });

    const zipBytes = buildZip(files);
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  window.scrapeCQPage = scrapePage;
  window.downloadCQJSON = downloadCQJSON;
  window.downloadCQBundle = downloadCQBundle;
  await scrapePage();
})();
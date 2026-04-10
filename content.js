(function () {
  const PANEL_ID = 'myuste-latin-honors-panel';
  const HONORS = [
    { key: 'summa', label: 'Summa Cum Laude', min: 1.0, max: 1.2, theme: 'gold' },
    { key: 'magna', label: 'Magna Cum Laude', min: 1.201, max: 1.45, theme: 'green' },
    { key: 'cum', label: 'Cum Laude', min: 1.451, max: 1.75, theme: 'green' }
  ];


  const DISMISSED_KEY = 'myusteTrackerDismissed';

  function isDismissed() {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  }

  function setDismissed(value) {
    if (value) sessionStorage.setItem(DISMISSED_KEY, '1');
    else sessionStorage.removeItem(DISMISSED_KEY);
  }

  const POSITION_KEY = 'myusteTrackerPosition';

  function getStoredPosition() {
    try {
      const raw = sessionStorage.getItem(POSITION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function setStoredPosition(left, top) {
    sessionStorage.setItem(POSITION_KEY, JSON.stringify({ left, top }));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function parseNumber(text) {
    if (!text) return NaN;
    const cleaned = String(text).replace(/,/g, '').replace(/[^\d.]/g, '').trim();
    return cleaned ? parseFloat(cleaned) : NaN;
  }

  function nearlyEqual(a, b, epsilon = 0.0005) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
  }

  function getHonorTier(gwa) {
    if (!Number.isFinite(gwa)) return { label: 'Unavailable', key: 'na', theme: 'neutral' };
    for (const honor of HONORS) {
      if (gwa >= honor.min && gwa <= honor.max) return honor;
    }
    return { label: 'Not yet eligible for Latin honors', key: 'none', theme: 'red' };
  }

  function getNextBetterTier(gwa) {
    if (!Number.isFinite(gwa)) return null;
    if (gwa > 1.75) return HONORS[2];
    if (gwa > 1.45) return HONORS[1];
    if (gwa > 1.2) return HONORS[0];
    return null;
  }

  function getHighestMaintainableTier(gwa) {
    const current = getHonorTier(gwa);
    if (current.key !== 'none' && current.key !== 'na') return current;
    return null;
  }

  function computeRequiredAverage(currentWeightedSum, currentUnits, futureUnits, targetMaxGwa) {
    if (!Number.isFinite(currentWeightedSum) || !Number.isFinite(currentUnits) || !Number.isFinite(futureUnits) || futureUnits <= 0) {
      return null;
    }
    return ((targetMaxGwa * (currentUnits + futureUnits)) - currentWeightedSum) / futureUnits;
  }

  function getMessageSet(gwa, projection) {
    const tier = getHonorTier(gwa);
    if (tier.key === 'summa') {
      return {
        theme: 'gold',
        title: 'You are on Summa track.',
        body: 'Excellent work. Stay consistent, protect your strongest habits, and do not get careless this close to the top.'
      };
    }
    if (tier.key === 'magna' || tier.key === 'cum') {
      return {
        theme: 'green',
        title: `You are currently on ${tier.label} track.`,
        body: projection.nextTier
          ? `Strong position. Keep pushing. ${projection.guidance}`
          : 'Strong position. Keep pushing and protect your consistency every term.'
      };
    }
    return {
      theme: 'red',
      title: 'You are not yet in Latin honors range.',
      body: projection.nextTier
        ? `Do not write yourself off. ${projection.guidance}`
        : 'Do not write yourself off. One strong term will not fix everything, but disciplined improvement every term can still move you into range.'
    };
  }

  function buildProjection(data, savedTerms, futureUnits) {
    const currentTermIndex = savedTerms.findIndex(t => t.term === data.term);
    let totalWeighted = 0;
    let totalUnits = 0;

    if (savedTerms.length) {
      savedTerms.forEach((term, idx) => {
        if (idx === currentTermIndex) {
          totalWeighted += Number(data.weightedSum) || 0;
          totalUnits += Number(data.totalUnits) || 0;
        } else {
          totalWeighted += Number(term.weightedSum) || 0;
          totalUnits += Number(term.totalUnits) || 0;
        }
      });
      if (currentTermIndex === -1) {
        totalWeighted += Number(data.weightedSum) || 0;
        totalUnits += Number(data.totalUnits) || 0;
      }
    } else {
      totalWeighted = Number(data.weightedSum) || 0;
      totalUnits = Number(data.totalUnits) || 0;
    }

    const cumulativeGwa = totalUnits > 0 ? totalWeighted / totalUnits : NaN;
    const maintainable = getHighestMaintainableTier(cumulativeGwa);
    const nextTier = getNextBetterTier(cumulativeGwa);
    let guidance = 'You are already at the highest Latin honors tier.';

    if (nextTier) {
      const needed = computeRequiredAverage(totalWeighted, totalUnits, futureUnits, nextTier.max);
      if (needed !== null) {
        if (needed < 1.0) {
          guidance = `To keep ${nextTier.label} within reach, stay as close to 1.000 as possible over the next ${futureUnits} unit(s).`;
        } else if (needed > 5.0) {
          guidance = `A jump to ${nextTier.label} is not realistic with only ${futureUnits} future unit(s). You would need about ${needed.toFixed(3)}, which is beyond the normal grading scale.`;
        } else {
          guidance = `To reach ${nextTier.label}, you need about a ${needed.toFixed(3)} average across the next ${futureUnits} unit(s).`;
        }
      }
    } else if (!maintainable) {
      const neededCum = computeRequiredAverage(totalWeighted, totalUnits, futureUnits, HONORS[2].max);
      if (neededCum !== null) {
        if (neededCum > 5.0) {
          guidance = `With only ${futureUnits} future unit(s), reaching Cum Laude is not realistic yet. You need a bigger runway or stronger earlier terms.`;
        } else {
          guidance = `To enter Cum Laude range, you need about a ${neededCum.toFixed(3)} average across the next ${futureUnits} unit(s).`;
        }
      }
    }

    return {
      cumulativeGwa,
      maintainable,
      nextTier,
      guidance,
      futureUnits
    };
  }

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function getTables() {
    return Array.from(document.querySelectorAll('table'));
  }

  function isLikelyGradesTable(table) {
    const text = normalizeText(table.innerText).toLowerCase();
    const score = [
      text.includes('subject name'),
      text.includes('description'),
      text.includes('lec units'),
      text.includes('lab units'),
      text.includes('prelims'),
      text.includes('finals')
    ].filter(Boolean).length;
    return score >= 3;
  }

  function detectGradesTable() {
    const tables = getTables();
    let best = null;
    let bestRows = 0;
    for (const table of tables) {
      if (!isLikelyGradesTable(table)) continue;
      const rows = table.querySelectorAll('tr').length;
      if (rows > bestRows) {
        best = table;
        bestRows = rows;
      }
    }
    return best;
  }

  function extractTermLabel() {
    const bodyTextNodes = Array.from(document.querySelectorAll('body *'));
    const possible = bodyTextNodes.find(el => /academic year and term/i.test(el.textContent || ''));
    if (!possible) return 'Unknown Term';

    const normalized = normalizeText(possible.textContent || '');
    const raw = (normalized.match(/Academic Year and Term:\s*(.*)/i)?.[1] || normalized).trim();

    const syMatch = raw.match(/(\d{4}\s*[-–]\s*\d{4})/i);
    const termMatch = raw.match(/((?:1st|2nd|3rd|4th)\s+Term|Special\s+Term|Summer\s+Term)/i);

    if (syMatch && termMatch) {
      return `${termMatch[1].replace(/\s+/g, ' ').trim()} | SY ${syMatch[1].replace(/\s*[-–]\s*/g, '-').trim()}`;
    }

    if (termMatch) return termMatch[1].replace(/\s+/g, ' ').trim();
    if (syMatch) return `SY ${syMatch[1].replace(/\s*[-–]\s*/g, '-').trim()}`;

    const compact = raw
      .split(/\s{2,}|\|/)
      .find(part => /term|\d{4}\s*[-–]\s*\d{4}/i.test(part)) || raw;

    return compact.trim();
  }

  function extractSemestralAverage() {
    const bodyText = normalizeText(document.body ? document.body.innerText : '');
    const directMatch = bodyText.match(/semestral\s*ave(?:rage)?\s*[:\-]?\s*(\d(?:\.\d{1,3})?)/i);
    if (directMatch) return parseNumber(directMatch[1]);

    const labeledEl = Array.from(document.querySelectorAll('body *')).find(el => /semestral\s*ave/i.test(normalizeText(el.textContent || '')));
    if (!labeledEl) return NaN;

    const selfText = normalizeText(labeledEl.textContent || '');
    const selfMatch = selfText.match(/semestral\s*ave(?:rage)?\s*[:\-]?\s*(\d(?:\.\d{1,3})?)/i);
    if (selfMatch) return parseNumber(selfMatch[1]);

    const siblingCandidates = [
      labeledEl.nextElementSibling,
      labeledEl.parentElement && labeledEl.parentElement.nextElementSibling,
      labeledEl.parentElement,
    ].filter(Boolean);

    for (const candidate of siblingCandidates) {
      const valueMatch = normalizeText(candidate.textContent || '').match(/(\d(?:\.\d{1,3})?)/);
      if (valueMatch) return parseNumber(valueMatch[1]);
    }

    return NaN;
  }

  function calculateFromTable(table) {
    if (!table) return { totalUnits: 0, weightedSum: 0, gwa: NaN, subjects: [] };

    const rows = Array.from(table.querySelectorAll('tr'));
    const subjects = [];
    let totalUnits = 0;
    let weightedSum = 0;

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) continue;

      const code = normalizeText(cells[0].innerText || '');
      const description = normalizeText(cells[1] ? cells[1].innerText : '');
      const lecUnits = parseNumber(cells[2] ? cells[2].innerText : '');
      const labUnits = parseNumber(cells[3] ? cells[3].innerText : '');
      const finals = parseNumber(cells[cells.length - 1] ? cells[cells.length - 1].innerText : '');
      const units = (Number.isFinite(lecUnits) ? lecUnits : 0) + (Number.isFinite(labUnits) ? labUnits : 0);

      if (!code || !Number.isFinite(finals) || units <= 0) continue;

      totalUnits += units;
      weightedSum += finals * units;
      subjects.push({ code, description, units, finals });
    }

    const gwa = totalUnits > 0 ? weightedSum / totalUnits : NaN;
    return { totalUnits, weightedSum, gwa, subjects };
  }

  function collectPageData() {
    const table = detectGradesTable();
    const calc = calculateFromTable(table);
    const portalGwa = extractSemestralAverage();
    const chosenGwa = Number.isFinite(portalGwa) ? portalGwa : calc.gwa;
    const source = Number.isFinite(portalGwa) ? 'Portal Semestral Ave' : 'Calculated Estimate';
    const totalUnits = Number(calc.totalUnits) || 0;
    const weightedSum = totalUnits > 0 && Number.isFinite(chosenGwa) ? chosenGwa * totalUnits : (Number(calc.weightedSum) || 0);

    return {
      term: extractTermLabel(),
      gwa: chosenGwa,
      source,
      totalUnits,
      weightedSum,
      subjects: calc.subjects,
      portalGwa,
      calculatedGwa: calc.gwa
    };
  }

  async function getSavedState(term, gwa, totalUnits) {
    const data = await chrome.storage.local.get(['savedTerms', 'plannerFutureUnits']);
    const savedTerms = Array.isArray(data.savedTerms) ? data.savedTerms : [];
    const existing = savedTerms.find(t => t.term === term);
    const sameSnapshot = !!existing && nearlyEqual(Number(existing.gwa), Number(gwa)) && Number(existing.totalUnits || 0) === Number(totalUnits || 0);
    const futureUnits = Number.isFinite(Number(data.plannerFutureUnits)) && Number(data.plannerFutureUnits) > 0
      ? Number(data.plannerFutureUnits)
      : (totalUnits || 20);
    return { savedTerms, existing, sameSnapshot, futureUnits };
  }

  async function saveTerm(data, button) {
    const existing = await chrome.storage.local.get(['savedTerms']);
    const savedTerms = Array.isArray(existing.savedTerms) ? existing.savedTerms : [];
    const index = savedTerms.findIndex(t => t.term === data.term);
    const payload = {
      term: data.term,
      totalUnits: data.totalUnits,
      weightedSum: data.weightedSum,
      gwa: data.gwa,
      source: data.source,
      savedAt: new Date().toISOString()
    };

    if (index >= 0) savedTerms[index] = payload;
    else savedTerms.push(payload);

    await chrome.storage.local.set({ savedTerms });
    if (button) {
      button.textContent = 'Term already saved';
      button.disabled = true;
      button.classList.add('is-disabled');
    }
    await renderPanel(data);
  }

  function applyPanelPosition(panel) {
    const saved = getStoredPosition();
    if (!saved) {
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '20px';
      panel.style.bottom = '20px';
      return;
    }

    const maxLeft = Math.max(window.innerWidth - panel.offsetWidth - 8, 8);
    const maxTop = Math.max(window.innerHeight - panel.offsetHeight - 8, 8);
    const left = clamp(saved.left, 8, maxLeft);
    const top = clamp(saved.top, 8, maxTop);

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function makePanelDraggable(panel) {
    const handle = panel.querySelector('.myuste-panel-header');
    if (!handle) return;

    handle.addEventListener('mousedown', (event) => {
      if (event.target.closest('button')) return;
      event.preventDefault();

      const rect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const originLeft = rect.left;
      const originTop = rect.top;

      panel.style.left = `${originLeft}px`;
      panel.style.top = `${originTop}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';

      const onMove = (moveEvent) => {
        const rawLeft = originLeft + (moveEvent.clientX - startX);
        const rawTop = originTop + (moveEvent.clientY - startY);
        const maxLeft = Math.max(window.innerWidth - panel.offsetWidth - 8, 8);
        const maxTop = Math.max(window.innerHeight - panel.offsetHeight - 8, 8);
        const left = clamp(rawLeft, 8, maxLeft);
        const top = clamp(rawTop, 8, maxTop);
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        setStoredPosition(left, top);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  async function renderPanel(data) {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }

    if (isDismissed()) {
      panel.innerHTML = `
        <button id="myuste-reopen-btn" class="myuste-reopen-btn" title="Show Latin Honors Tracker">Show Tracker</button>
      `;
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '20px';
      panel.style.bottom = '20px';
      const reopenBtn = panel.querySelector('#myuste-reopen-btn');
      if (reopenBtn) {
        reopenBtn.addEventListener('click', () => {
          setDismissed(false);
          renderPanel(data);
        });
      }
      return;
    }

    const { savedTerms, sameSnapshot, futureUnits } = await getSavedState(data.term, data.gwa, data.totalUnits);
    const tier = getHonorTier(data.gwa);
    const projection = buildProjection(data, savedTerms, futureUnits);
    const message = getMessageSet(projection.cumulativeGwa, projection);
    const gwaText = Number.isFinite(data.gwa) ? data.gwa.toFixed(3) : 'N/A';
    const maintainableText = projection.maintainable ? projection.maintainable.label : 'None yet';
    const sourceDetail = data.source === 'Portal Semestral Ave'
      ? 'Using the term average already shown by myUSTe.'
      : 'Portal term average was not found, so this is a fallback estimate from visible subject rows.';

    panel.innerHTML = `
      <div class="myuste-panel-card theme-${message.theme}">
        <div class="myuste-panel-header">
          <div class="myuste-panel-title">Latin Honors Tracker</div>
          <button id="myuste-close-panel-btn" class="myuste-icon-btn" title="Close tracker" aria-label="Close tracker">×</button>
        </div>
        <div class="myuste-status-box theme-${message.theme}">
          <div class="myuste-status-title">${message.title}</div>
          <div class="myuste-status-body">${message.body}</div>
        </div>
        <div class="myuste-panel-row"><strong>Term:</strong> <span>${data.term}</span></div>
        <div class="myuste-panel-row"><strong>Term GWA:</strong> <span>${gwaText}</span></div>
        <div class="myuste-panel-row"><strong>Source:</strong> <span class="myuste-source-badge ${data.source === 'Portal Semestral Ave' ? 'source-official' : 'source-fallback'}">${data.source}</span></div>
        <div class="myuste-panel-row"><strong>Current term status:</strong> <span class="myuste-tier-badge theme-${tier.theme}">${tier.label}</span></div>
        <div class="myuste-panel-row"><strong>Highest tier you can maintain now:</strong> <span class="myuste-highlight">${maintainableText}</span></div>
        <div class="myuste-panel-row"><strong>What you need for a higher tier:</strong> <span>${projection.guidance}</span></div>
        <div class="myuste-panel-row"><strong>Total Units:</strong> <span>${data.totalUnits || 'N/A'}</span></div>
        <button id="myuste-save-term-btn" class="myuste-btn ${sameSnapshot ? 'is-disabled' : ''}" ${sameSnapshot ? 'disabled' : ''}>${sameSnapshot ? 'Term already saved' : 'Save this term'}</button>
        <div class="myuste-panel-note">${sourceDetail} Projection uses your saved terms plus this visible term. Future-grade guidance assumes your next term has ${futureUnits} unit(s). Change that in the popup if needed.</div>
      </div>
    `;

    applyPanelPosition(panel);
    makePanelDraggable(panel);

    const btn = panel.querySelector('#myuste-save-term-btn');
    if (btn && !sameSnapshot) {
      btn.addEventListener('click', () => saveTerm(data, btn));
    }

    const closeBtn = panel.querySelector('#myuste-close-panel-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        setDismissed(true);
        renderPanel(data);
      });
    }
  }

  async function run() {
    const data = collectPageData();
    const pageLooksRelevant = data.term !== 'Unknown Term' || Number.isFinite(data.portalGwa) || data.subjects.length > 0;

    if (!pageLooksRelevant || !Number.isFinite(data.gwa)) {
      chrome.storage.local.set({ latestTermCalculation: null });
      return;
    }

    await renderPanel(data);
    chrome.storage.local.set({ latestTermCalculation: data });
  }

  let runTimer = null;
  const scheduleRun = () => {
    clearTimeout(runTimer);
    runTimer = setTimeout(() => {
      run();
    }, 400);
  };

  const observer = new MutationObserver(() => {
    scheduleRun();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.savedTerms || changes.plannerFutureUnits)) {
      scheduleRun();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleRun);
  } else {
    scheduleRun();
  }

  window.addEventListener('load', scheduleRun);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();

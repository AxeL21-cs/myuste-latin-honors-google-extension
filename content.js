(function () {
  const PANEL_ID = 'myuste-latin-honors-panel';
  const HONORS = [
    { key: 'summa', label: 'Summa Cum Laude', min: 1.0, max: 1.2, theme: 'gold' },
    { key: 'magna', label: 'Magna Cum Laude', min: 1.201, max: 1.45, theme: 'green' },
    { key: 'cum', label: 'Cum Laude', min: 1.451, max: 1.75, theme: 'green' }
  ];
  const TOTAL_TERMS = 8;

  const DISMISSED_KEY = 'myusteTrackerDismissed';
  const HIDDEN_KEY = 'myusteTrackerFullyHidden';
  const POSITION_KEY = 'myusteTrackerPosition';

  function isDismissed() {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  }

  function setDismissed(value) {
    if (value) sessionStorage.setItem(DISMISSED_KEY, '1');
    else sessionStorage.removeItem(DISMISSED_KEY);
  }

  function isFullyHidden() {
    return sessionStorage.getItem(HIDDEN_KEY) === '1';
  }

  function setFullyHidden(value) {
    if (value) sessionStorage.setItem(HIDDEN_KEY, '1');
    else sessionStorage.removeItem(HIDDEN_KEY);
  }

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
    const cleaned = String(text).replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
    return cleaned ? parseFloat(cleaned) : NaN;
  }

  function isUnencodedGrade(gwa) {
    return Number.isFinite(gwa) && gwa <= 0;
  }

  function nearlyEqual(a, b, epsilon = 0.0005) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
  }

  function getHonorTier(gwa) {
    if (!Number.isFinite(gwa) || gwa <= 0) {
      return { label: 'Unavailable', key: 'na', theme: 'neutral' };
    }
    for (const honor of HONORS) {
      if (gwa >= honor.min && gwa <= honor.max) return honor;
    }
    return { label: 'Not yet eligible for Latin honors', key: 'none', theme: 'red' };
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

    const compact = raw.split(/\s{2,}|\|/).find(part => /term|\d{4}\s*[-–]\s*\d{4}/i.test(part)) || raw;
    return compact.trim();
  }

  function extractSemestralAverage() {
    const bodyText = normalizeText(document.body ? document.body.innerText : '');
    const directMatch = bodyText.match(/semestral\s*ave(?:rage)?\s*[:\-]?\s*(\d(?:\.\d{1,3})?)/i);
    if (directMatch) return parseNumber(directMatch[1]);

    const labeledEl = Array.from(document.querySelectorAll('body *')).find(el =>
      /semestral\s*ave/i.test(normalizeText(el.textContent || ''))
    );
    if (!labeledEl) return NaN;

    const selfText = normalizeText(labeledEl.textContent || '');
    const selfMatch = selfText.match(/semestral\s*ave(?:rage)?\s*[:\-]?\s*(\d(?:\.\d{1,3})?)/i);
    if (selfMatch) return parseNumber(selfMatch[1]);

    const siblingCandidates = [
      labeledEl.nextElementSibling,
      labeledEl.parentElement && labeledEl.parentElement.nextElementSibling,
      labeledEl.parentElement
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
    const weightedSum = totalUnits > 0 && Number.isFinite(chosenGwa)
      ? chosenGwa * totalUnits
      : (Number(calc.weightedSum) || 0);

    return {
      term: extractTermLabel(),
      gwa: chosenGwa,
      source,
      totalUnits,
      weightedSum,
      subjects: calc.subjects,
      portalGwa,
      calculatedGwa: calc.gwa,
      isUnavailable: isUnencodedGrade(chosenGwa)
    };
  }

  function mergeTermRecords(savedTerms, currentTerm) {
    const map = new Map();

    for (const term of (Array.isArray(savedTerms) ? savedTerms : [])) {
      const gwa = Number(term?.gwa);
      if (!term || !term.term || !Number.isFinite(gwa) || gwa <= 0) continue;
      map.set(term.term, { ...term, gwa });
    }

    if (
      currentTerm &&
      currentTerm.term &&
      Number.isFinite(currentTerm.gwa) &&
      currentTerm.gwa > 0
    ) {
      map.set(currentTerm.term, {
        term: currentTerm.term,
        gwa: Number(currentTerm.gwa),
        source: currentTerm.source || 'Unknown'
      });
    }

    return Array.from(map.values());
  }

  function buildProgressSnapshot(savedTerms, currentTerm) {
    const merged = mergeTermRecords(savedTerms, currentTerm);
    const completedTerms = merged.length;
    const remainingTerms = Math.max(TOTAL_TERMS - completedTerms, 0);
    const gwaValues = merged.map(t => Number(t.gwa)).filter(gwa => Number.isFinite(gwa) && gwa > 0);
    const totalSoFar = gwaValues.reduce((sum, value) => sum + value, 0);
    const cumulativeGwa = completedTerms ? totalSoFar / completedTerms : NaN;
    return { merged, completedTerms, remainingTerms, totalSoFar, cumulativeGwa };
  }

  function getHigherTiers(cumulativeGwa) {
    if (!Number.isFinite(cumulativeGwa) || cumulativeGwa <= 0) {
      return [HONORS[2], HONORS[1], HONORS[0]];
    }

    const currentTier = getHonorTier(cumulativeGwa);

    if (currentTier.key === 'summa') return [];
    if (currentTier.key === 'magna') return [HONORS[0]];
    if (currentTier.key === 'cum') return [HONORS[1], HONORS[0]];
    return [HONORS[2], HONORS[1], HONORS[0]];
  }

  function getTierTargetPlans(cumulativeGwa, completedTerms, remainingTerms) {
    const tiers = getHigherTiers(cumulativeGwa);

    if (!Number.isFinite(cumulativeGwa) || completedTerms <= 0 || cumulativeGwa <= 0) {
      return [];
    }

    if (!tiers.length) return [];

    return tiers.map(tier => {
      if (remainingTerms <= 0) {
        return {
          label: tier.label,
          targetGrade: NaN,
          isPossible: false,
          guidance: `Nice try 🌷 ${tier.label} may no longer be within reach, but finishing strong is still something to be proud of.`
        };
      }

      const requiredAverage = ((tier.max * TOTAL_TERMS) - (cumulativeGwa * completedTerms)) / remainingTerms;
      const roundedRequired = Math.round(requiredAverage * 1000) / 1000;

      if (roundedRequired < 1.0) {
        return {
          label: tier.label,
          targetGrade: 1.0,
          isPossible: false,
          guidance: `Nice try 🌷 Even perfect remaining terms may not be enough for ${tier.label}, but you can still finish strong and be proud of your progress.`
        };
      }

      return {
        label: tier.label,
        targetGrade: roundedRequired,
        isPossible: true,
        guidance: `Aim for about ${roundedRequired.toFixed(3)} or better per remaining semester to reach ${tier.label} 🌱`
      };
    });
  }

  function pickStableMessage(list, seedText = '') {
    if (!Array.isArray(list) || !list.length) return { title: '', body: '' };
    let hash = 0;
    const text = String(seedText || '');
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return list[Math.abs(hash) % list.length];
  }

  function getMessageSet(cumulativeGwa, plans, remainingTerms, termLabel = '') {
    const tier = getHonorTier(cumulativeGwa);
    const semesterLine = remainingTerms > 0
      ? `You still have ${remainingTerms} more semester${remainingTerms === 1 ? '' : 's'} to catch up. You can do it! 💪🌸`
      : 'You have already reached the last estimated semester in the tracker 🌼';

    const bestPlan = Array.isArray(plans) ? plans.find(p => p.isPossible) : null;

    const redMessages = [
      {
        title: '🌸 Not yet in Latin honors range—but keep going.',
        body: `${semesterLine} Small improvements still count, and each good term helps more than you think 💗`
      },
      {
        title: '💖 You are still building momentum.',
        body: `${semesterLine} One better semester can shift your direction more than you think 🌷`
      },
      {
        title: '🌱 You are not out of the fight.',
        body: `${semesterLine} A stronger finish is still worth chasing, and your next terms can still help ✨`
      }
    ];

    const cumMessages = [
      {
        title: '🍀 You are currently on Cum Laude track.',
        body: `${semesterLine} That is already something to be proud of. ${bestPlan ? `Try to stay around ${bestPlan.targetGrade.toFixed(3)} or better per remaining semester if you want to climb higher 🌷` : 'Protect this standing and keep your momentum going 🌷'}`
      },
      {
        title: '💚 Cum Laude is within your hands right now.',
        body: `${semesterLine} You have built a solid base already. ${bestPlan ? `A steady ${bestPlan.targetGrade.toFixed(3)} or better can help you climb toward the next tier 🌱` : 'Stay disciplined and finish strong 🌱'}`
      },
      {
        title: '✨ You are doing well—keep pressing forward.',
        body: `${semesterLine} Your effort is showing. ${bestPlan ? `Keep your next terms near ${bestPlan.targetGrade.toFixed(3)} or better if you want to push higher 💫` : 'One strong stretch can still improve your finish 💫'}`
      }
    ];

    const magnaMessages = [
      {
        title: '💚 You are currently on Magna Cum Laude track.',
        body: `${semesterLine} You are in a very strong spot. ${bestPlan ? `Aim for around ${bestPlan.targetGrade.toFixed(3)} or better per remaining semester if you want to chase Summa 🌱` : 'Keep protecting this excellent standing 🌱'}`
      },
      {
        title: '🌟 Magna track looks good on you.',
        body: `${semesterLine} You are already performing at a high level. ${bestPlan ? `A consistent ${bestPlan.targetGrade.toFixed(3)} or better can keep Summa within reach ✨` : 'Stay sharp and keep your quality high ✨'}`
      },
      {
        title: '🍃 You are closer to the top than you think.',
        body: `${semesterLine} This is already an impressive position. ${bestPlan ? `Maintain roughly ${bestPlan.targetGrade.toFixed(3)} or better if you want a serious shot at Summa 💚` : 'Finish gracefully and protect your momentum 💚'}`
      }
    ];

    const summaMessages = [
      {
        title: '🌟 You are on Summa track.',
        body: `${semesterLine} You are doing beautifully. Keep your rhythm steady and protect the habits that got you here ✨`
      },
      {
        title: '🏅 You are currently in Summa Cum Laude range.',
        body: `${semesterLine} That is amazing work. Stay consistent and protect your momentum 💛`
      },
      {
        title: '💫 Summa track is yours to protect.',
        body: `${semesterLine} You have already built something special. Keep your standards high and your pace sustainable 🌼`
      }
    ];

    const seed = `${tier.key}|${termLabel}|${remainingTerms}|${Number.isFinite(cumulativeGwa) ? cumulativeGwa.toFixed(3) : 'na'}`;

    if (tier.key === 'summa') return { theme: 'gold', ...pickStableMessage(summaMessages, seed) };
    if (tier.key === 'magna') return { theme: 'green', ...pickStableMessage(magnaMessages, seed) };
    if (tier.key === 'cum') return { theme: 'green', ...pickStableMessage(cumMessages, seed) };
    return { theme: 'red', ...pickStableMessage(redMessages, seed) };
  }

  async function getSavedState(term, gwa) {
    const data = await chrome.storage.local.get(['savedTerms']);
    const savedTerms = Array.isArray(data.savedTerms) ? data.savedTerms : [];
    const existing = savedTerms.find(t => t.term === term);
    const sameSnapshot = !!existing && nearlyEqual(Number(existing.gwa), Number(gwa));
    return { savedTerms, existing, sameSnapshot };
  }

  async function saveTerm(data, button) {
    if (data.isUnavailable || !Number.isFinite(data.gwa) || data.gwa <= 0) {
      return;
    }

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

    if (isFullyHidden()) {
      panel.innerHTML = '';
      return;
    }

    if (isDismissed()) {
      panel.innerHTML = `
        <div class="myuste-reopen-wrap">
          <button id="myuste-reopen-btn" class="myuste-reopen-btn" title="Show Latin Honors Tracker">Show Tracker</button>
          <button id="myuste-hide-btn" class="myuste-mini-close-btn" title="Hide tracker completely" aria-label="Hide tracker completely">×</button>
        </div>
      `;
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '20px';
      panel.style.bottom = '20px';

      panel.querySelector('#myuste-reopen-btn')?.addEventListener('click', () => {
        setDismissed(false);
        setFullyHidden(false);
        renderPanel(data);
      });

      panel.querySelector('#myuste-hide-btn')?.addEventListener('click', () => {
        setFullyHidden(true);
        panel.innerHTML = '';
      });
      return;
    }

    if (data.isUnavailable) {
      panel.innerHTML = `
        <div class="myuste-panel-card theme-neutral">
          <div class="myuste-panel-header">
            <div class="myuste-panel-title">Latin Honors Tracker</div>
            <button id="myuste-close-panel-btn" class="myuste-icon-btn" title="Close tracker" aria-label="Close tracker">×</button>
          </div>

          <div class="myuste-status-box theme-neutral">
            <div class="myuste-status-title">🌼 Grades not yet available</div>
            <div class="myuste-status-body">
              Your semestral average appears as <strong>0.000</strong>, which may mean your grades have not been encoded yet. Please check again later once your grades are posted.
            </div>
          </div>

          <div class="myuste-panel-row"><strong>Term:</strong> <span>${data.term}</span></div>
          <div class="myuste-panel-row"><strong>Term GWA:</strong> <span>${Number.isFinite(data.gwa) ? data.gwa.toFixed(3) : 'N/A'}</span></div>
          <div class="myuste-panel-row"><strong>Source:</strong> <span class="myuste-source-badge ${data.source === 'Portal Semestral Ave' ? 'source-official' : 'source-fallback'}">${data.source}</span></div>

          <button id="myuste-save-term-btn" class="myuste-btn is-disabled" disabled>Cannot save yet</button>

          <div class="myuste-panel-note">
            This term is being treated as unavailable because a 0.000 semestral average most likely means grades have not been encoded yet.
          </div>
        </div>
      `;

      applyPanelPosition(panel);
      makePanelDraggable(panel);

      panel.querySelector('#myuste-close-panel-btn')?.addEventListener('click', () => {
        setDismissed(true);
        setFullyHidden(false);
        renderPanel(data);
      });
      return;
    }

    const { savedTerms, sameSnapshot } = await getSavedState(data.term, data.gwa);
    const progress = buildProgressSnapshot(savedTerms, data);
    const cumulativeTier = getHonorTier(progress.cumulativeGwa);
    const plans = getTierTargetPlans(progress.cumulativeGwa, progress.completedTerms, progress.remainingTerms);
    const message = getMessageSet(progress.cumulativeGwa, plans, progress.remainingTerms, data.term);
    const gwaText = Number.isFinite(data.gwa) ? data.gwa.toFixed(3) : 'N/A';
    const cumulativeText = Number.isFinite(progress.cumulativeGwa) ? progress.cumulativeGwa.toFixed(3) : 'N/A';
    const sourceDetail = data.source === 'Portal Semestral Ave'
      ? 'Using the term average already shown by myUSTe.'
      : 'Portal term average was not found, so this is a fallback estimate from visible subject rows.';

    const targetRows = plans.length
      ? plans.map(plan => `
          <div class="myuste-panel-row">
            <strong>${plan.label} target:</strong>
            <span>${plan.isPossible
              ? `${plan.targetGrade.toFixed(3)} or better per remaining semester`
              : plan.guidance}</span>
          </div>
        `).join('')
      : `<div class="myuste-panel-row"><strong>Maintain:</strong> <span>Keep your GWA at 1.200 or better to stay within Summa range ✨</span></div>`;

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
        <div class="myuste-panel-row"><strong>Cumulative GWA:</strong> <span>${cumulativeText}</span></div>
        <div class="myuste-panel-row"><strong>Source:</strong> <span class="myuste-source-badge ${data.source === 'Portal Semestral Ave' ? 'source-official' : 'source-fallback'}">${data.source}</span></div>
        <div class="myuste-panel-row"><strong>Current standing:</strong> <span class="myuste-tier-badge theme-${cumulativeTier.theme}">${cumulativeTier.label}</span></div>
        <div class="myuste-panel-row"><strong>Estimated semesters left:</strong> <span>${progress.remainingTerms}</span></div>
        ${targetRows}
        <button id="myuste-save-term-btn" class="myuste-btn ${sameSnapshot ? 'is-disabled' : ''}" ${sameSnapshot ? 'disabled' : ''}>${sameSnapshot ? 'Term already saved' : 'Save this term'}</button>
        <div class="myuste-panel-note">${sourceDetail} Remaining semesters are estimated using a standard 8-term program, and the target grade is averaged across those remaining terms.</div>
      </div>
    `;

    applyPanelPosition(panel);
    makePanelDraggable(panel);

    const btn = panel.querySelector('#myuste-save-term-btn');
    if (btn && !sameSnapshot) {
      btn.addEventListener('click', () => saveTerm(data, btn));
    }

    panel.querySelector('#myuste-close-panel-btn')?.addEventListener('click', () => {
      setDismissed(true);
      setFullyHidden(false);
      renderPanel(data);
    });
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
    if (areaName === 'local' && changes.savedTerms) {
      scheduleRun();
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'MYUSTE_OPEN_TRACKER') return;

    setFullyHidden(false);
    setDismissed(false);
    scheduleRun();
    sendResponse({ ok: true });
    return true;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleRun);
  } else {
    scheduleRun();
  }

  window.addEventListener('load', scheduleRun);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
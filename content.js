(function () {
  const PANEL_ID = 'myuste-latin-honors-panel';
  const HONORS = [
    { key: 'summa', label: 'Summa Cum Laude', min: 1.0, max: 1.2, color: '#0a7f3f' },
    { key: 'magna', label: 'Magna Cum Laude', min: 1.201, max: 1.45, color: '#1565c0' },
    { key: 'cum', label: 'Cum Laude', min: 1.451, max: 1.75, color: '#b26a00' }
  ];

  function parseNumber(text) {
    if (!text) return NaN;
    const cleaned = String(text).replace(/[^
\d.]/g, '').trim();
    return cleaned ? parseFloat(cleaned) : NaN;
  }

  function getHonorTier(gwa) {
    if (!Number.isFinite(gwa)) return { label: 'Unavailable', color: '#666', key: 'na' };
    for (const honor of HONORS) {
      if (gwa >= honor.min && gwa <= honor.max) return honor;
    }
    return { label: 'Not on Latin honors track', color: '#b00020', key: 'none' };
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
    const required = ((targetMaxGwa * (currentUnits + futureUnits)) - currentWeightedSum) / futureUnits;
    return required;
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
          guidance = `You only need to avoid dropping below ${nextTier.label}. With ${futureUnits} future unit(s), even a 1.000 average keeps you within reach.`;
        } else if (needed > 5.0) {
          guidance = `Reaching ${nextTier.label} is not realistic with only ${futureUnits} future unit(s). You would need an average of ${needed.toFixed(3)}, which is above the usual grading scale.`;
        } else {
          guidance = `To reach ${nextTier.label}, you need about a ${needed.toFixed(3)} average across the next ${futureUnits} unit(s).`;
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

  function detectGradesTable() {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.find((table) => {
      const text = table.innerText.toLowerCase();
      return text.includes('subject name') && text.includes('lec units') && text.includes('finals');
    });
  }

  function extractTermLabel() {
    const possible = Array.from(document.querySelectorAll('body *')).find(el =>
      /academic year and term/i.test(el.textContent || '')
    );
    if (!possible) return 'Unknown Term';
    const match = possible.textContent.replace(/\s+/g, ' ').match(/Academic Year and Term:\s*(.*)/i);
    return match ? match[1].trim() : possible.textContent.trim();
  }

  function calculateFromTable(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    const subjects = [];
    let totalUnits = 0;
    let weightedSum = 0;

    for (const row of rows.slice(1)) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 6) continue;

      const code = cells[0].innerText.trim();
      const description = cells[1].innerText.trim();
      const lecUnits = parseNumber(cells[2].innerText);
      const labUnits = parseNumber(cells[3].innerText);
      const finals = parseNumber(cells[5].innerText);
      const units = (Number.isFinite(lecUnits) ? lecUnits : 0) + (Number.isFinite(labUnits) ? labUnits : 0);

      if (!code || !Number.isFinite(finals) || units <= 0) continue;

      totalUnits += units;
      weightedSum += finals * units;
      subjects.push({ code, description, units, finals });
    }

    const gwa = totalUnits > 0 ? weightedSum / totalUnits : NaN;
    return { term: extractTermLabel(), totalUnits, weightedSum, gwa, subjects };
  }

  async function getSavedState(term, weightedSum, totalUnits) {
    const data = await chrome.storage.local.get(['savedTerms', 'plannerFutureUnits']);
    const savedTerms = Array.isArray(data.savedTerms) ? data.savedTerms : [];
    const existing = savedTerms.find(t => t.term === term);
    const sameSnapshot = !!existing && Number(existing.weightedSum) === Number(weightedSum) && Number(existing.totalUnits) === Number(totalUnits);
    const futureUnits = Number.isFinite(Number(data.plannerFutureUnits)) && Number(data.plannerFutureUnits) > 0
      ? Number(data.plannerFutureUnits)
      : totalUnits;
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

  async function renderPanel(data) {
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }

    const { savedTerms, sameSnapshot, futureUnits } = await getSavedState(data.term, data.weightedSum, data.totalUnits);
    const tier = getHonorTier(data.gwa);
    const projection = buildProjection(data, savedTerms, futureUnits);
    const gwaText = Number.isFinite(data.gwa) ? data.gwa.toFixed(3) : 'N/A';
    const maintainableText = projection.maintainable ? projection.maintainable.label : 'None yet';

    panel.innerHTML = `
      <div class="myuste-panel-card">
        <div class="myuste-panel-title">Latin Honors Tracker</div>
        <div class="myuste-panel-row"><strong>Term:</strong> <span>${data.term}</span></div>
        <div class="myuste-panel-row"><strong>Computed GWA:</strong> <span>${gwaText}</span></div>
        <div class="myuste-panel-row"><strong>Current term status:</strong> <span style="color:${tier.color};font-weight:700;">${tier.label}</span></div>
        <div class="myuste-panel-row"><strong>Highest tier you can maintain now:</strong> <span class="myuste-highlight">${maintainableText}</span></div>
        <div class="myuste-panel-row"><strong>What you need for a higher tier:</strong> <span>${projection.guidance}</span></div>
        <div class="myuste-panel-row"><strong>Total Units:</strong> <span>${data.totalUnits}</span></div>
        <button id="myuste-save-term-btn" class="myuste-btn ${sameSnapshot ? 'is-disabled' : ''}" ${sameSnapshot ? 'disabled' : ''}>${sameSnapshot ? 'Term already saved' : 'Save this term'}</button>
        <div class="myuste-panel-note">Projection uses your saved terms plus this visible term. Future-grade guidance assumes your next term has ${futureUnits} unit(s). Change that in the popup if needed.</div>
      </div>
    `;

    const btn = panel.querySelector('#myuste-save-term-btn');
    if (btn && !sameSnapshot) {
      btn.addEventListener('click', () => saveTerm(data, btn));
    }
  }

  async function run() {
    const table = detectGradesTable();
    if (!table) return;
    const data = calculateFromTable(table);
    if (!data.subjects.length) return;
    await renderPanel(data);
    chrome.storage.local.set({ latestTermCalculation: data });
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById(PANEL_ID)) run();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.savedTerms || changes.plannerFutureUnits)) {
      run();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();

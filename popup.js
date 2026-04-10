const HONORS = [
  { key: 'summa', label: 'Summa Cum Laude', min: 1.0, max: 1.2, className: 'gold' },
  { key: 'magna', label: 'Magna Cum Laude', min: 1.201, max: 1.45, className: 'good' },
  { key: 'cum', label: 'Cum Laude', min: 1.451, max: 1.75, className: 'good' }
];

function getHonorTier(gwa) {
  if (!Number.isFinite(gwa)) return { label: 'Unavailable', className: '' };
  for (const honor of HONORS) {
    if (gwa >= honor.min && gwa <= honor.max) return honor;
  }
  return { label: 'Not yet eligible for Latin honors', className: 'bad', key: 'none' };
}

function getNextBetterTier(gwa) {
  if (!Number.isFinite(gwa)) return null;
  if (gwa > 1.75) return HONORS[2];
  if (gwa > 1.45) return HONORS[1];
  if (gwa > 1.2) return HONORS[0];
  return null;
}

function computeRequiredAverage(currentWeightedSum, currentUnits, futureUnits, targetMaxGwa) {
  if (!Number.isFinite(currentWeightedSum) || !Number.isFinite(currentUnits) || !Number.isFinite(futureUnits) || futureUnits <= 0) {
    return null;
  }
  return ((targetMaxGwa * (currentUnits + futureUnits)) - currentWeightedSum) / futureUnits;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderSavedTermsTable(savedTerms) {
  const termsBox = document.getElementById('terms');
  if (!savedTerms.length) {
    termsBox.innerHTML = '<div class="small">No saved terms yet.</div>';
    return;
  }

  const rows = savedTerms
    .slice()
    .sort((a, b) => String(a.term).localeCompare(String(b.term)))
    .map(term => `
      <tr>
        <td>${escapeHtml(term.term)}</td>
        <td>${Number(term.totalUnits || 0).toFixed(0)}</td>
        <td>${Number(term.gwa || 0).toFixed(3)}</td>
        <td>${escapeHtml(term.source || 'Unknown')}</td>
      </tr>
    `)
    .join('');

  termsBox.innerHTML = `
    <div class="table-wrap">
      <table class="terms-table">
        <thead>
          <tr>
            <th>Term</th>
            <th>Units</th>
            <th>GWA</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function buildGuidance(totalWeighted, totalUnits, futureUnits, currentGwa) {
  const currentTier = getHonorTier(currentGwa);
  const nextTier = getNextBetterTier(currentGwa);
  const highestNow = currentTier.key && currentTier.key !== 'none' ? currentTier.label : 'None yet';

  let detail = 'You are already at the highest Latin honors tier.';
  if (nextTier) {
    const needed = computeRequiredAverage(totalWeighted, totalUnits, futureUnits, nextTier.max);
    if (needed !== null) {
      if (needed < 1.0) {
        detail = `Stay disciplined. Keeping your average near 1.000 over the next ${futureUnits} unit(s) keeps ${nextTier.label} in reach.`;
      } else if (needed > 5.0) {
        detail = `A higher tier is not realistic with only ${futureUnits} future unit(s). Required average: ${needed.toFixed(3)}.`;
      } else {
        detail = `To reach ${nextTier.label}, you need about a ${needed.toFixed(3)} average over the next ${futureUnits} unit(s).`;
      }
    }
  } else if (highestNow === 'None yet') {
    const neededCum = computeRequiredAverage(totalWeighted, totalUnits, futureUnits, HONORS[2].max);
    if (neededCum !== null) {
      if (neededCum > 5.0) {
        detail = `With only ${futureUnits} future unit(s), reaching Cum Laude is not realistic yet.`;
      } else {
        detail = `To enter Cum Laude range, you need about a ${neededCum.toFixed(3)} average over the next ${futureUnits} unit(s).`;
      }
    }
  }

  return { highestNow, detail };
}

async function load() {
  const data = await chrome.storage.local.get(['latestTermCalculation', 'savedTerms', 'plannerFutureUnits']);
  const latest = data.latestTermCalculation;
  const savedTerms = Array.isArray(data.savedTerms) ? data.savedTerms : [];

  const latestBox = document.getElementById('latest');
  if (latest && Number.isFinite(latest.gwa)) {
    const tier = getHonorTier(latest.gwa);
    latestBox.innerHTML = `
      <div><strong>${escapeHtml(latest.term)}</strong></div>
      <div>GWA: ${latest.gwa.toFixed(3)}</div>
      <div>Total Units: ${latest.totalUnits || 'N/A'}</div>
      <div>Source: ${escapeHtml(latest.source || 'Unknown')}</div>
      <div class="${tier.className}">${tier.label}</div>
    `;
  } else {
    latestBox.innerHTML = 'Open the myUSTe Grades page to load data.';
  }

  renderSavedTermsTable(savedTerms);

  const fallbackUnits = latest && Number.isFinite(Number(latest.totalUnits)) && Number(latest.totalUnits) > 0 ? Number(latest.totalUnits) : 20;
  const futureUnitsInput = document.getElementById('futureUnits');
  futureUnitsInput.value = Number.isFinite(Number(data.plannerFutureUnits)) && Number(data.plannerFutureUnits) > 0
    ? Number(data.plannerFutureUnits)
    : fallbackUnits;

  const cumulativeBox = document.getElementById('cumulative');
  if (savedTerms.length) {
    const totalWeighted = savedTerms.reduce((sum, t) => sum + (Number(t.weightedSum) || 0), 0);
    const totalUnits = savedTerms.reduce((sum, t) => sum + (Number(t.totalUnits) || 0), 0);
    const gwa = totalUnits > 0 ? totalWeighted / totalUnits : NaN;
    const tier = getHonorTier(gwa);
    const futureUnits = Number(futureUnitsInput.value) || fallbackUnits;
    const guidance = buildGuidance(totalWeighted, totalUnits, futureUnits, gwa);

    cumulativeBox.innerHTML = `
      <div>Estimated cumulative GWA: <strong>${gwa.toFixed(3)}</strong></div>
      <div>Total saved units: ${totalUnits}</div>
      <div class="${tier.className}">${tier.label}</div>
      <div><strong>Highest tier you can maintain now:</strong> ${guidance.highestNow}</div>
      <div class="small">${guidance.detail}</div>
      <div class="small">Based only on terms you saved in this extension.</div>
    `;
  } else {
    cumulativeBox.innerHTML = 'No saved terms yet.';
  }
}

function wireEvents() {
  document.getElementById('savePlannerBtn').addEventListener('click', async () => {
    const futureUnitsInput = document.getElementById('futureUnits');
    const value = Number(futureUnitsInput.value);
    if (!Number.isFinite(value) || value <= 0) {
      document.getElementById('plannerNote').textContent = 'Enter a valid number of future units.';
      return;
    }
    await chrome.storage.local.set({ plannerFutureUnits: value });
    document.getElementById('plannerNote').textContent = 'Projection units updated.';
    load();
  });

  document.getElementById('clearBtn').addEventListener('click', async () => {
    await chrome.storage.local.remove(['savedTerms']);
    location.reload();
  });
}

wireEvents();
load();

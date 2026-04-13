const HONORS = [
  { key: 'summa', label: 'Summa Cum Laude', min: 1.0, max: 1.2, className: 'gold' },
  { key: 'magna', label: 'Magna Cum Laude', min: 1.201, max: 1.45, className: 'good' },
  { key: 'cum', label: 'Cum Laude', min: 1.451, max: 1.75, className: 'good' }
];
const TOTAL_TERMS = 8;

function getHonorTier(gwa) {
  if (!Number.isFinite(gwa) || gwa <= 0) return { label: 'Unavailable', className: '' };
  for (const honor of HONORS) {
    if (gwa >= honor.min && gwa <= honor.max) return honor;
  }
  return { label: 'Not yet eligible for Latin honors', className: 'bad', key: 'none' };
}

function isUnencodedGrade(gwa) {
  return Number.isFinite(gwa) && gwa <= 0;
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

function getTargetPlans(cumulativeGwa, completedTerms, remainingTerms) {
  const tiers = getHigherTiers(cumulativeGwa);

  if (!Number.isFinite(cumulativeGwa) || completedTerms <= 0 || cumulativeGwa <= 0) return [];
  if (!tiers.length) return [];

  return tiers.map(tier => {
    if (remainingTerms <= 0) {
      return {
        label: tier.label,
        line: `Nice try 🌷 ${tier.label} may no longer be within reach, but finishing strong is still something to be proud of.`
      };
    }

    const required = ((tier.max * TOTAL_TERMS) - (cumulativeGwa * completedTerms)) / remainingTerms;

    if (required < 1.0) {
      return {
        label: tier.label,
        line: `Nice try 🌷 Even perfect remaining terms may not be enough for ${tier.label}, but you can still finish strong and be proud of your progress.`
      };
    }

    return {
      label: tier.label,
      line: `${tier.label}: aim for about ${required.toFixed(3)} or better in each of the remaining ${remainingTerms} semester${remainingTerms === 1 ? '' : 's'} 🌱`
    };
  });
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
            <th>GWA</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function mergeTerms(savedTerms, latest) {
  const map = new Map();

  for (const term of savedTerms) {
    const gwa = Number(term?.gwa);
    if (term && term.term && Number.isFinite(gwa) && gwa > 0) {
      map.set(term.term, { ...term, gwa });
    }
  }

  if (latest && latest.term && Number.isFinite(latest.gwa) && latest.gwa > 0) {
    map.set(latest.term, {
      term: latest.term,
      gwa: Number(latest.gwa),
      source: latest.source || 'Unknown'
    });
  }

  return Array.from(map.values());
}

async function load() {
  const data = await chrome.storage.local.get(['latestTermCalculation', 'savedTerms']);
  const latest = data.latestTermCalculation;
  const savedTerms = Array.isArray(data.savedTerms) ? data.savedTerms : [];

  const latestBox = document.getElementById('latest');
  if (latest && Number.isFinite(latest.gwa)) {
    if (isUnencodedGrade(latest.gwa)) {
      latestBox.innerHTML = `
        <div><strong>${escapeHtml(latest.term)}</strong></div>
        <div>GWA: ${latest.gwa.toFixed(3)}</div>
        <div>Source: ${escapeHtml(latest.source || 'Unknown')}</div>
        <div class="warn">Grades not yet available</div>
        <div class="small">A 0.000 semestral average may mean the grades have not been encoded yet.</div>
      `;
    } else {
      const tier = getHonorTier(latest.gwa);
      latestBox.innerHTML = `
        <div><strong>${escapeHtml(latest.term)}</strong></div>
        <div>GWA: ${latest.gwa.toFixed(3)}</div>
        <div>Source: ${escapeHtml(latest.source || 'Unknown')}</div>
        <div class="${tier.className}">${tier.label}</div>
      `;
    }
  } else {
    latestBox.innerHTML = 'Open the myUSTe Grades page to load data.';
  }

  renderSavedTermsTable(savedTerms);

  const cumulativeBox = document.getElementById('cumulative');
  const mergedTerms = mergeTerms(savedTerms, latest);

  if (latest && isUnencodedGrade(latest.gwa) && !mergedTerms.length) {
    cumulativeBox.innerHTML = `
      <div class="warn">Grades not yet available</div>
      <div class="small">This term is not being included in cumulative standing yet because 0.000 likely means the grades have not been encoded.</div>
    `;
    return;
  }

  if (mergedTerms.length) {
    const numericGwas = mergedTerms.map(t => Number(t.gwa)).filter(gwa => Number.isFinite(gwa) && gwa > 0);

    if (numericGwas.length) {
      const gwa = numericGwas.reduce((sum, value) => sum + value, 0) / numericGwas.length;
      const tier = getHonorTier(gwa);
      const remainingTerms = Math.max(TOTAL_TERMS - mergedTerms.length, 0);
      const plans = getTargetPlans(gwa, mergedTerms.length, remainingTerms);

      cumulativeBox.innerHTML = `
        <div>Estimated cumulative GWA: <strong>${gwa.toFixed(3)}</strong></div>
        <div class="${tier.className}">${tier.label}</div>
        <div class="small">Estimated semesters left: ${remainingTerms}</div>
        ${plans.length
          ? plans.map(plan => `<div class="small">${escapeHtml(plan.line)}</div>`).join('')
          : `<div class="small">Already in Summa range. Maintain your standing ✨</div>`}
        <div class="small">Based only on terms you saved in this extension and a standard 8-term program.</div>
      `;
    } else {
      cumulativeBox.innerHTML = 'No saved terms yet.';
    }
  } else {
    cumulativeBox.innerHTML = 'No saved terms yet.';
  }
}

async function openTrackerOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'MYUSTE_OPEN_TRACKER' });
    if (!response || !response.ok) {
      const latestBox = document.getElementById('latest');
      latestBox.insertAdjacentHTML('beforeend', '<div class="small bad">Could not reopen the tracker on this page. Open the myUSTe grades page first.</div>');
    }
  } catch (error) {
    const latestBox = document.getElementById('latest');
    latestBox.insertAdjacentHTML('beforeend', '<div class="small bad">Could not reopen the tracker on this page. Refresh the myUSTe grades tab and try again.</div>');
  }
}

function wireEvents() {
  document.getElementById('clearBtn').addEventListener('click', async () => {
    await chrome.storage.local.remove(['savedTerms']);
    location.reload();
  });

  document.getElementById('openTrackerBtn').addEventListener('click', async () => {
    await openTrackerOnActiveTab();
  });
}

wireEvents();
load();
// HyperXosist UI — uses agent-api.js as single source of truth
document.addEventListener('DOMContentLoaded', () => {
  const Agent = window.HyperXosistAgent;
  if (!Agent) {
    console.error('HyperXosistAgent not loaded');
    return;
  }

  const FIELD_KEYS = [
    'keywords', 'anyOf', 'exactPhrase', 'hashtags', 'fromUser', 'toUser', 'mentionUser',
    'excludeWords', 'sinceDate', 'untilDate', 'minFaves', 'minRetweets', 'minReplies',
    'lang', 'urlDomain', 'rawOperators',
    'hasImages', 'hasVideos', 'hasMedia', 'nativeVideo', 'excludeLinks', 'hasLinks',
    'excludeReplies', 'onlyReplies', 'verifiedOnly', 'quoteOnly', 'safeOnly'
  ];

  const CHECKBOX_KEYS = new Set([
    'hasImages', 'hasVideos', 'hasMedia', 'nativeVideo', 'excludeLinks', 'hasLinks',
    'excludeReplies', 'onlyReplies', 'verifiedOnly', 'quoteOnly', 'safeOnly'
  ]);

  const fields = {};
  FIELD_KEYS.forEach((key) => {
    fields[key] = document.getElementById(key);
  });

  const noiseFields = {
    enabled: document.getElementById('noiseEnabled'),
    preset: document.getElementById('noisePreset')
  };

  const queryPreview = document.getElementById('queryPreview');
  const queryMeta = document.getElementById('queryMeta');
  const queryExplain = document.getElementById('queryExplain');
  const noiseChips = document.getElementById('noiseChips');
  const historyList = document.getElementById('historyList');
  const templateGrid = document.getElementById('templateGrid');
  const versionBadge = document.getElementById('versionBadge');
  const toastEl = document.getElementById('toast');

  const btnCopy = document.getElementById('btnCopy');
  const btnCopyUrl = document.getElementById('btnCopyUrl');
  const btnShare = document.getElementById('btnShare');
  const btnExplain = document.getElementById('btnExplain');
  const btnReset = document.getElementById('btnReset');
  const btnResetNoise = document.getElementById('btnResetNoise');
  const btnSearchLive = document.getElementById('btnSearchLive');
  const btnSearchTop = document.getElementById('btnSearchTop');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const btnClearDates = document.getElementById('btnClearDates');

  const NOISE_STORAGE_KEY = 'hyperxosist_noise_filter';
  const HISTORY_STORAGE_KEY = 'x_search_history';
  const MAX_HISTORY = 15;

  let noiseState = loadNoiseState();
  let explainVisible = false;
  let toastTimer = null;

  if (versionBadge) {
    versionBadge.textContent = `v${Agent.version}`;
  }

  function toast(message, ms = 2000) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('show');
      toastEl.hidden = true;
    }, ms);
  }

  function loadNoiseState() {
    try {
      const saved = JSON.parse(localStorage.getItem(NOISE_STORAGE_KEY) || '{}');
      return {
        enabled: !!saved.enabled,
        preset: ['low', 'medium', 'high'].includes(saved.preset) ? saved.preset : 'medium',
        removed: Array.isArray(saved.removed) ? saved.removed : []
      };
    } catch (e) {
      return { enabled: false, preset: 'medium', removed: [] };
    }
  }

  function saveNoiseState() {
    try {
      localStorage.setItem(NOISE_STORAGE_KEY, JSON.stringify(noiseState));
    } catch (e) {
      console.error('Noise save failed', e);
    }
  }

  function captureInput() {
    const input = {};
    FIELD_KEYS.forEach((key) => {
      const el = fields[key];
      if (!el) return;
      if (CHECKBOX_KEYS.has(key)) {
        input[key] = !!el.checked;
      } else {
        const v = el.value;
        if (v !== '' && v !== undefined && v !== null) input[key] = v;
      }
    });
    if (noiseState.enabled) {
      input.noise = {
        enabled: true,
        preset: noiseState.preset,
        removed: noiseState.removed.slice()
      };
    }
    return input;
  }

  function applyInputToForm(input, options) {
    const opts = options || {};
    if (!input) return;

    FIELD_KEYS.forEach((key) => {
      const el = fields[key];
      if (!el) return;
      if (CHECKBOX_KEYS.has(key)) {
        el.checked = !!input[key];
      } else if (Object.prototype.hasOwnProperty.call(input, key)) {
        el.value = input[key] == null ? '' : input[key];
      } else if (opts.clearMissing) {
        el.value = key === 'lang' ? '' : '';
      }
    });

    if (input.noise) {
      noiseState.enabled = !!input.noise.enabled;
      if (['low', 'medium', 'high'].includes(input.noise.preset)) {
        noiseState.preset = input.noise.preset;
      }
      if (Array.isArray(input.noise.removed)) {
        noiseState.removed = input.noise.removed.slice();
      }
      noiseFields.enabled.checked = noiseState.enabled;
      noiseFields.preset.value = noiseState.preset;
      saveNoiseState();
    }
  }

  function renderNoiseChips() {
    noiseChips.innerHTML = '';
    const terms = Agent.getActiveNoiseTerms(noiseState);

    if (!noiseState.enabled) {
      noiseChips.innerHTML = '<span class="noise-empty">Noise filter is off</span>';
      return;
    }
    if (terms.length === 0) {
      noiseChips.innerHTML = '<span class="noise-empty">適用中の除外語はありません</span>';
      return;
    }

    // Cap visual chips for performance; full set still applied in query
    const shown = terms.slice(0, 48);
    shown.forEach((term) => {
      const chip = document.createElement('span');
      chip.className = 'noise-chip';
      chip.append(document.createTextNode(term));

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '×';
      button.setAttribute('aria-label', `${term} を削除`);
      button.addEventListener('click', () => {
        const key = Agent.normalizeTerm(term);
        if (!noiseState.removed.map(Agent.normalizeTerm).includes(key)) {
          noiseState.removed.push(term);
        }
        saveNoiseState();
        renderNoiseChips();
        refreshPreview();
      });
      chip.appendChild(button);
      noiseChips.appendChild(chip);
    });

    if (terms.length > shown.length) {
      const more = document.createElement('span');
      more.className = 'noise-empty';
      more.textContent = `+${terms.length - shown.length} more applied`;
      noiseChips.appendChild(more);
    }
  }

  function refreshPreview() {
    const input = captureInput();
    const query = Agent.buildQuery(input);
    const analysis = Agent.analyzeQuery(input);
    const validation = Agent.validateInput(input);

    queryPreview.value = query;

    const metaParts = [];
    metaParts.push(`${analysis.length} chars`);
    if (analysis.excludeCount) metaParts.push(`${analysis.excludeCount} excludes`);
    if (analysis.operatorCount) metaParts.push(`${analysis.operatorCount} ops`);

    queryMeta.textContent = metaParts.join(' · ');
    queryMeta.className = 'query-meta';
    if (analysis.severity === 'warn' || validation.warnings.length) {
      queryMeta.classList.add('meta-warn');
    }
    if (analysis.severity === 'error' || !validation.valid) {
      queryMeta.classList.add('meta-error');
    }
    if (analysis.severity === 'empty') {
      queryMeta.classList.add('meta-muted');
    }

    if (explainVisible) {
      queryExplain.hidden = false;
      const lines = [Agent.explainQuery(input)];
      if (validation.errors.length) lines.push('\nErrors:\n- ' + validation.errors.join('\n- '));
      if (validation.warnings.length) lines.push('\nWarnings:\n- ' + validation.warnings.join('\n- '));
      queryExplain.textContent = lines.join('\n');
    }
  }

  function renderTemplates() {
    const templates = Agent.listTemplates();
    templateGrid.innerHTML = '';
    templates.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'template-card';
      btn.setAttribute('role', 'listitem');
      btn.innerHTML = `<strong>${escapeHtml(t.labelJa || t.label)}</strong><span>${escapeHtml(t.description)}</span>`;
      btn.addEventListener('click', () => {
        try {
          const current = captureInput();
          // Keep user keywords if already typed; template fills gaps
          const merged = Agent.applyTemplate(t.id, {
            keywords: current.keywords || undefined,
            exactPhrase: current.exactPhrase || undefined,
            fromUser: current.fromUser || undefined
          });
          // Template wins on filters/noise/engagement defaults
          applyInputToForm(merged, { clearMissing: false });
          // Explicitly set template default fields that may be empty in form
          Object.keys(merged).forEach((key) => {
            if (key === 'noise' || key === '_templateId') return;
            if (fields[key]) {
              if (CHECKBOX_KEYS.has(key)) fields[key].checked = !!merged[key];
              else if (merged[key] !== undefined) fields[key].value = merged[key];
            }
          });
          if (merged.noise) {
            noiseState = {
              enabled: !!merged.noise.enabled,
              preset: merged.noise.preset || 'medium',
              removed: Array.isArray(merged.noise.removed) ? merged.noise.removed.slice() : []
            };
            noiseFields.enabled.checked = noiseState.enabled;
            noiseFields.preset.value = noiseState.preset;
            saveNoiseState();
          }
          renderNoiseChips();
          refreshPreview();
          toast(`Template: ${t.labelJa || t.label}`);
          document.getElementById('keywords')?.focus();
        } catch (e) {
          toast('Template failed');
          console.error(e);
        }
      });
      templateGrid.appendChild(btn);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Live update
  FIELD_KEYS.forEach((key) => {
    const el = fields[key];
    if (!el) return;
    el.addEventListener('input', refreshPreview);
    el.addEventListener('change', refreshPreview);
  });

  noiseFields.enabled.addEventListener('change', () => {
    noiseState.enabled = noiseFields.enabled.checked;
    saveNoiseState();
    renderNoiseChips();
    refreshPreview();
  });

  noiseFields.preset.addEventListener('change', () => {
    noiseState.preset = noiseFields.preset.value;
    saveNoiseState();
    renderNoiseChips();
    refreshPreview();
  });

  btnResetNoise.addEventListener('click', () => {
    noiseState = { enabled: true, preset: 'medium', removed: [] };
    noiseFields.enabled.checked = true;
    noiseFields.preset.value = 'medium';
    saveNoiseState();
    renderNoiseChips();
    refreshPreview();
    toast('Noise reset');
  });

  document.querySelectorAll('[data-date-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-date-preset');
      const range = Agent.applyDatePreset(key);
      if (range) {
        fields.sinceDate.value = range.sinceDate;
        fields.untilDate.value = range.untilDate;
        refreshPreview();
        toast(`Date: ${key}`);
      }
    });
  });

  btnClearDates.addEventListener('click', () => {
    fields.sinceDate.value = '';
    fields.untilDate.value = '';
    refreshPreview();
  });

  async function copyText(text, successMsg) {
    if (!text) {
      toast('コピーする内容がありません');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(successMsg || 'コピーしました');
    } catch (e) {
      // Fallback
      queryPreview.select();
      try {
        document.execCommand('copy');
        toast(successMsg || 'コピーしました');
      } catch (e2) {
        toast('コピーに失敗しました');
      }
    }
  }

  btnCopy.addEventListener('click', () => {
    copyText(queryPreview.value.trim(), 'クエリをコピーしました');
  });

  btnCopyUrl.addEventListener('click', () => {
    const input = captureInput();
    input.mode = 'live';
    const url = Agent.buildSearchUrl(input);
    if (!Agent.buildQuery(input)) {
      toast('クエリが空です');
      return;
    }
    copyText(url, '検索URLをコピーしました');
  });

  btnShare.addEventListener('click', () => {
    const input = captureInput();
    const encoded = Agent.encodeState(input);
    if (!encoded) {
      toast('共有リンクの生成に失敗');
      return;
    }
    const url = `${location.origin}${location.pathname}#s=${encoded}`;
    copyText(url, '状態共有リンクをコピー');
    try {
      history.replaceState(null, '', `#s=${encoded}`);
    } catch (e) { /* ignore */ }
  });

  btnExplain.addEventListener('click', () => {
    explainVisible = !explainVisible;
    queryExplain.hidden = !explainVisible;
    btnExplain.textContent = explainVisible ? '解説を隠す' : '解説';
    refreshPreview();
  });

  btnReset.addEventListener('click', () => {
    FIELD_KEYS.forEach((key) => {
      const el = fields[key];
      if (!el) return;
      if (CHECKBOX_KEYS.has(key)) el.checked = false;
      else el.value = '';
    });
    explainVisible = false;
    queryExplain.hidden = true;
    btnExplain.textContent = '解説';
    refreshPreview();
    toast('リセットしました');
  });

  function getHistory() {
    try {
      const data = localStorage.getItem(HISTORY_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(query, state) {
    if (!query) return;
    let history = getHistory().filter((item) => item.query !== query);
    history.unshift({
      query,
      state,
      timestamp: new Date().toLocaleString('ja-JP')
    });
    if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('History write failed', e);
    }
    renderHistory();
  }

  function renderHistory() {
    const history = getHistory();
    historyList.innerHTML = '';
    if (history.length === 0) {
      historyList.innerHTML = '<li class="empty-message">履歴はありません</li>';
      return;
    }
    history.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const queryDiv = document.createElement('div');
      queryDiv.className = 'history-item-query';
      queryDiv.textContent = item.query;
      queryDiv.title = item.query;
      const dateDiv = document.createElement('div');
      dateDiv.className = 'history-item-date';
      dateDiv.textContent = (item.timestamp || '').split(' ')[0] || '';
      li.appendChild(queryDiv);
      li.appendChild(dateDiv);
      li.addEventListener('click', () => {
        if (item.state) {
          // Prefer full input snapshot if present
          if (item.state._v >= 2 || item.state.keywords !== undefined || item.state.anyOf !== undefined) {
            applyInputToForm(item.state, { clearMissing: true });
            // Reset checkboxes not in state
            CHECKBOX_KEYS.forEach((k) => {
              if (fields[k] && item.state[k] === undefined) fields[k].checked = false;
            });
            if (item.state.noise) {
              noiseState = {
                enabled: !!item.state.noise.enabled,
                preset: item.state.noise.preset || 'medium',
                removed: Array.isArray(item.state.noise.removed) ? item.state.noise.removed : []
              };
            }
            noiseFields.enabled.checked = noiseState.enabled;
            noiseFields.preset.value = noiseState.preset;
            renderNoiseChips();
          } else {
            // Legacy history shape
            Object.keys(fields).forEach((key) => {
              if (!fields[key]) return;
              if (CHECKBOX_KEYS.has(key)) fields[key].checked = !!item.state[key];
              else if (item.state[key] !== undefined) fields[key].value = item.state[key] || '';
            });
          }
          refreshPreview();
          toast('履歴を復元');
        }
      });
      historyList.appendChild(li);
    });
  }

  btnClearHistory.addEventListener('click', () => {
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (e) { /* ignore */ }
    renderHistory();
    toast('履歴を削除しました');
  });

  function launchSearch(mode) {
    const input = captureInput();
    input.mode = mode === 'top' ? 'top' : 'live';
    const validation = Agent.validateInput(input);
    const query = Agent.buildQuery(input);

    if (!query) {
      toast('検索条件を入力してください');
      return;
    }
    if (!validation.valid) {
      toast(validation.errors[0] || '入力エラー');
      return;
    }

    const state = { ...input, _v: 2 };
    saveHistory(query, state);

    const url = Agent.buildSearchUrl(input);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  btnSearchLive.addEventListener('click', () => launchSearch('live'));
  btnSearchTop.addEventListener('click', () => launchSearch('top'));

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) launchSearch('top');
      else launchSearch('live');
    }
  });

  // Restore shared state from hash
  function restoreFromHash() {
    const hash = location.hash || '';
    const m = hash.match(/[#&]s=([^&]+)/);
    if (!m) return;
    const decoded = Agent.decodeState(decodeURIComponent(m[1]));
    if (decoded && typeof decoded === 'object') {
      applyInputToForm(decoded, { clearMissing: true });
      CHECKBOX_KEYS.forEach((k) => {
        if (fields[k] && decoded[k] === undefined) fields[k].checked = false;
      });
      if (decoded.noise) {
        noiseState = {
          enabled: !!decoded.noise.enabled,
          preset: decoded.noise.preset || 'medium',
          removed: Array.isArray(decoded.noise.removed) ? decoded.noise.removed : []
        };
        noiseFields.enabled.checked = noiseState.enabled;
        noiseFields.preset.value = noiseState.preset;
        saveNoiseState();
      }
      toast('共有状態を復元しました');
    }
  }

  // Init
  noiseFields.enabled.checked = noiseState.enabled;
  noiseFields.preset.value = noiseState.preset;
  renderTemplates();
  restoreFromHash();
  renderNoiseChips();
  refreshPreview();
  renderHistory();
});

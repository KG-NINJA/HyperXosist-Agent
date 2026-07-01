// X Search Launcher Core Logic

document.addEventListener('DOMContentLoaded', () => {
  // DOM要素の取得
  const fields = {
    keywords: document.getElementById('keywords'),
    exactPhrase: document.getElementById('exactPhrase'),
    fromUser: document.getElementById('fromUser'),
    excludeWords: document.getElementById('excludeWords'),
    sinceDate: document.getElementById('sinceDate'),
    untilDate: document.getElementById('untilDate'),
    minFaves: document.getElementById('minFaves'),
    lang: document.getElementById('lang'),
    hasImages: document.getElementById('hasImages'),
    hasVideos: document.getElementById('hasVideos'),
    excludeLinks: document.getElementById('excludeLinks'),
  };

  const noiseFields = {
    enabled: document.getElementById('noiseEnabled'),
    preset: document.getElementById('noisePreset'),
  };

  const queryPreview = document.getElementById('queryPreview');
  const btnCopy = document.getElementById('btnCopy');
  const btnReset = document.getElementById('btnReset');
  const btnResetNoise = document.getElementById('btnResetNoise');
  const btnSearchLive = document.getElementById('btnSearchLive');
  const btnSearchTop = document.getElementById('btnSearchTop');
  const historyList = document.getElementById('historyList');
  const noiseChips = document.getElementById('noiseChips');

  const NOISE_STORAGE_KEY = 'hyperxosist_noise_filter';
  const repostBlacklistTerms = [
    "what do you think",
    "do you agree",
    "agree or disagree",
    "thoughts on this",
    "your thoughts",
    "thoughts?",
    "comment below",
    "drop a comment",
    "tag someone who",
    "tag your friends",
    "tag a friend",
    "rt if you agree",
    "retweet if you agree",
    "retweet if",
    "save this post",
    "save for later",
    "share this with",
    "share if you agree",
    "this is insane",
    "this is crazy",
    "you won't believe",
    "wait for it",
    "wait till the end",
    "the ending is",
    "mind blown",
    "mind-blowing",
    "unbelievable",
    "shocking",
    "insane video",
    "crazy video",
    "going viral",
    "viral video",
    "internet is losing it",
    "people are losing it",
    "everyone needs to see this",
    "you need to see this",
    "breaking:",
    "just in:",
    "update:",
    "live update",
    "developing",
    "developing story",
    "exclusive:",
    "pov:",
    "me when",
    "when the",
    "the way he",
    "the way she",
    "no words",
    "speechless",
    "hits different",
    "this hits hard",
    "double tap if",
    "like if you agree",
    "follow for more",
    "meanwhile...",
    "writer:",
    "sources:",
    "this is why",
    "the reason is",
    "this video is",
    "wait until you see"
  ];

  const noiseRules = {
    low: [
      'giveaway', 'airdrop', 'claim', 'reward', 'referral', 'free money', 'limited offer', 'click here', 'sign up',
      '無料配布', 'エアドロップ', 'プレゼント企画', '抽選'
    ],
    medium: [
      'thoughts', 'agree', 'bookmark', 'insane', 'game changer', 'big if true', 'must read', 'hot take', 'thread below', 'you need to see this',
      'ブクマ推奨', 'やばい', '革命', 'これはすごい', '知らないと損'
    ],
    high: [
      'gm', 'wagmi', 'alpha', '100x', 'promo', 'presale', 'whitelist', 'pump', 'moonshot', 'paid partnership', 'sponsored', 'follow for more', 'retweet to win',
      '固定ポスト', '完全攻略', 'フォローで', 'リポストで'
    ]
  };

  let noiseState = loadNoiseState();

  function loadNoiseState() {
    try {
      const saved = JSON.parse(localStorage.getItem(NOISE_STORAGE_KEY) || '{}');
      return {
        enabled: !!saved.enabled,
        preset: ['low', 'medium', 'high'].includes(saved.preset) ? saved.preset : 'medium',
        removed: Array.isArray(saved.removed) ? saved.removed : []
      };
    } catch (e) {
      console.error('Noise filter設定読み込み失敗:', e);
      return { enabled: false, preset: 'medium', removed: [] };
    }
  }

  function saveNoiseState() {
    try {
      localStorage.setItem(NOISE_STORAGE_KEY, JSON.stringify(noiseState));
    } catch (e) {
      console.error('Noise filter設定保存失敗:', e);
    }
  }

  function getPresetTerms(preset) {
    if (preset === 'high') {
      return [...noiseRules.low, ...noiseRules.medium, ...repostBlacklistTerms, ...noiseRules.high];
    }
    if (preset === 'medium') {
      return [...noiseRules.low, ...noiseRules.medium, ...repostBlacklistTerms];
    }
    return [...noiseRules.low];
  }

  function normalizeTerm(term) {
    return term.trim().replace(/^[-]+/, '').replace(/^"|"$/g, '').toLowerCase();
  }

  function parseExcludeInput(value) {
    const matches = value.match(/"[^"]+"|\S+/g) || [];
    return matches.map(term => term.replace(/^"|"$/g, '').trim()).filter(Boolean);
  }

  function formatExcludeTerm(term) {
    const cleaned = term.trim();
    const needsQuote = /\s/.test(cleaned) || (/[ぁ-んァ-ン一-龯]/.test(cleaned) && cleaned.length >= 5);
    return `-${needsQuote ? `"${cleaned}"` : cleaned}`;
  }

  // Noise filterは投稿本文をAI判定せず、検索前に除外演算子だけを軽量追加する。
  function getActiveNoiseTerms() {
    if (!noiseState.enabled) return [];
    const removed = new Set(noiseState.removed.map(normalizeTerm));
    return getPresetTerms(noiseState.preset).filter(term => !removed.has(normalizeTerm(term)));
  }

  function getMergedExcludeTerms() {
    const merged = [];
    const seen = new Set();
    [...parseExcludeInput(fields.excludeWords.value), ...getActiveNoiseTerms()].forEach(term => {
      const key = normalizeTerm(term);
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(term);
      }
    });
    return merged;
  }

  function renderNoiseChips() {
    noiseChips.innerHTML = '';
    const activeTerms = getActiveNoiseTerms();

    if (!noiseState.enabled) {
      noiseChips.innerHTML = '<span class="noise-empty">Noise filter is off</span>';
      return;
    }
    if (activeTerms.length === 0) {
      noiseChips.innerHTML = '<span class="noise-empty">適用中の除外語はありません</span>';
      return;
    }

    activeTerms.forEach(term => {
      const chip = document.createElement('span');
      chip.className = 'noise-chip';
      chip.append(document.createTextNode(term));

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '×';
      button.setAttribute('aria-label', `${term} を削除`);
      button.addEventListener('click', () => {
        const key = normalizeTerm(term);
        if (!noiseState.removed.map(normalizeTerm).includes(key)) {
          noiseState.removed.push(term);
        }
        saveNoiseState();
        renderNoiseChips();
        buildQuery();
      });

      chip.appendChild(button);
      noiseChips.appendChild(chip);
    });
  }

  // クエリ生成ロジック
  function buildQuery() {
    const parts = [];

    // 1. キーワード
    const keywordsVal = fields.keywords.value.trim();
    if (keywordsVal) {
      parts.push(keywordsVal);
    }

    // 2. 完全一致フレーズ
    const exactVal = fields.exactPhrase.value.trim();
    if (exactVal) {
      parts.push(`"${exactVal}"`);
    }

    // 3. from:ユーザー
    let userVal = fields.fromUser.value.trim();
    if (userVal) {
      // @マークが最初についている場合は除去
      if (userVal.startsWith('@')) {
        userVal = userVal.substring(1);
      }
      parts.push(`from:${userVal}`);
    }

    // 4. 除外ワード
    getMergedExcludeTerms().forEach(word => {
      parts.push(formatExcludeTerm(word));
    });

    // 5. since:日付
    const sinceVal = fields.sinceDate.value;
    if (sinceVal) {
      parts.push(`since:${sinceVal}`);
    }

    // 6. until:日付
    const untilVal = fields.untilDate.value;
    if (untilVal) {
      parts.push(`until:${untilVal}`);
    }

    // 7. min_faves
    const minFavesVal = fields.minFaves.value.trim();
    if (minFavesVal) {
      parts.push(`min_faves:${minFavesVal}`);
    }

    // 8. lang
    const langVal = fields.lang.value;
    if (langVal) {
      parts.push(`lang:${langVal}`);
    }

    // 9. フィルター群
    if (fields.hasImages.checked) {
      parts.push('filter:images');
    }
    if (fields.hasVideos.checked) {
      parts.push('filter:videos');
    }
    if (fields.excludeLinks.checked) {
      parts.push('-filter:links');
    }

    const finalQuery = parts.join(' ');
    queryPreview.value = finalQuery;
    return finalQuery;
  }

  // リアルタイム反映のイベントリスナー設定
  Object.values(fields).forEach(element => {
    if (element) {
      element.addEventListener('input', buildQuery);
      element.addEventListener('change', buildQuery);
    }
  });

  noiseFields.enabled.addEventListener('change', () => {
    noiseState.enabled = noiseFields.enabled.checked;
    saveNoiseState();
    renderNoiseChips();
    buildQuery();
  });

  noiseFields.preset.addEventListener('change', () => {
    noiseState.preset = noiseFields.preset.value;
    saveNoiseState();
    renderNoiseChips();
    buildQuery();
  });

  btnResetNoise.addEventListener('click', () => {
    noiseState = { enabled: true, preset: 'medium', removed: [] };
    noiseFields.enabled.checked = noiseState.enabled;
    noiseFields.preset.value = noiseState.preset;
    saveNoiseState();
    renderNoiseChips();
    buildQuery();
  });

  // クリップボードへコピー
  btnCopy.addEventListener('click', () => {
    const query = queryPreview.value.trim();
    if (!query) {
      alert('コピーするクエリがありません。');
      return;
    }
    navigator.clipboard.writeText(query)
      .then(() => {
        const originalText = btnCopy.textContent;
        btnCopy.textContent = 'コピー完了！';
        btnCopy.style.borderColor = 'var(--accent-teal)';
        btnCopy.style.color = 'var(--accent-teal)';
        setTimeout(() => {
          btnCopy.textContent = originalText;
          btnCopy.style.borderColor = 'var(--border-color)';
          btnCopy.style.color = 'var(--text-primary)';
        }, 1500);
      })
      .catch(err => {
        console.error('コピー失敗:', err);
        alert('コピーに失敗しました。手動でコピーしてください。');
      });
  });

  // フォームリセット
  btnReset.addEventListener('click', () => {
    Object.keys(fields).forEach(key => {
      if (fields[key].type === 'checkbox') {
        fields[key].checked = false;
      } else if (key === 'lang') {
        fields[key].value = ''; // 初期値はグローバル検索
      } else {
        fields[key].value = '';
      }
    });
    buildQuery();
  });

  // 履歴保存と再表示
  function getHistory() {
    try {
      const data = localStorage.getItem('x_search_history');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('履歴読み込み失敗:', e);
      return [];
    }
  }

  function saveHistory(query, state) {
    if (!query) return;
    let history = getHistory();

    // 既に同じクエリが存在する場合は一旦削除し、先頭（最新）に追加し直す
    history = history.filter(item => item.query !== query);

    history.unshift({
      query: query,
      state: state,
      timestamp: new Date().toLocaleString('ja-JP')
    });

    // 最大10件
    if (history.length > 10) {
      history = history.slice(0, 10);
    }

    try {
      localStorage.setItem('x_search_history', JSON.stringify(history));
    } catch (e) {
      console.error('履歴書き込み失敗:', e);
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

    history.forEach(item => {
      const li = document.createElement('li');
      li.className = 'history-item';

      const queryDiv = document.createElement('div');
      queryDiv.className = 'history-item-query';
      queryDiv.textContent = item.query;
      queryDiv.title = item.query;

      const dateDiv = document.createElement('div');
      dateDiv.className = 'history-item-date';
      dateDiv.textContent = item.timestamp.split(' ')[0]; // 日付のみ簡易表示

      li.appendChild(queryDiv);
      li.appendChild(dateDiv);

      // 履歴クリックで復元
      li.addEventListener('click', () => {
        restoreState(item.state);
      });

      historyList.appendChild(li);
    });
  }

  function restoreState(state) {
    if (!state) return;
    Object.keys(fields).forEach(key => {
      if (fields[key]) {
        if (fields[key].type === 'checkbox') {
          fields[key].checked = !!state[key];
        } else {
          fields[key].value = state[key] || '';
        }
      }
    });
    buildQuery();
  }

  function captureCurrentState() {
    const state = {};
    Object.keys(fields).forEach(key => {
      if (fields[key].type === 'checkbox') {
        state[key] = fields[key].checked;
      } else {
        state[key] = fields[key].value;
      }
    });
    return state;
  }

  // 検索実行
  function launchSearch(mode) {
    const query = buildQuery();
    if (!query) {
      alert('検索クエリが空です。検索条件を入力してください。');
      return;
    }

    // 履歴に保存
    const state = captureCurrentState();
    saveHistory(query, state);

    // URL生成と遷移
    const encodedQuery = encodeURIComponent(query);
    const baseUrl = 'https://x.com/search';
    const finalUrl = `${baseUrl}?q=${encodedQuery}&src=typed_query&f=${mode}`;

    window.open(finalUrl, '_blank');
  }

  btnSearchLive.addEventListener('click', () => launchSearch('live'));
  btnSearchTop.addEventListener('click', () => launchSearch('top'));

  // 初期化時の実行
  noiseFields.enabled.checked = noiseState.enabled;
  noiseFields.preset.value = noiseState.preset;
  renderNoiseChips();
  buildQuery();
  renderHistory();
});


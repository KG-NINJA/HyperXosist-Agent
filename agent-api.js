(function (root) {
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

  function normalizeTerm(term) {
    return String(term || '').trim().replace(/^[-]+/, '').replace(/^"|"$/g, '').toLowerCase();
  }

  function parseExcludeInput(value) {
    if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    const matches = String(value || '').match(/"[^"]+"|\S+/g) || [];
    return matches.map(term => term.replace(/^"|"$/g, '').trim()).filter(Boolean);
  }

  function formatExcludeTerm(term) {
    const cleaned = String(term || '').trim();
    const needsQuote = /\s/.test(cleaned) || (/[ぁ-んァ-ン一-龯]/.test(cleaned) && cleaned.length >= 5);
    return `-${needsQuote ? `"${cleaned}"` : cleaned}`;
  }

  function getPresetTerms(preset) {
    if (preset === 'high') return [...noiseRules.low, ...noiseRules.medium, ...repostBlacklistTerms, ...noiseRules.high];
    if (preset === 'medium') return [...noiseRules.low, ...noiseRules.medium, ...repostBlacklistTerms];
    return [...noiseRules.low];
  }

  function mergeExcludeTerms(manualTerms, noise) {
    const merged = [];
    const seen = new Set();
    const removed = new Set((noise && noise.removed ? noise.removed : []).map(normalizeTerm));
    const autoTerms = noise && noise.enabled ? getPresetTerms(noise.preset || 'medium').filter(term => !removed.has(normalizeTerm(term))) : [];

    [...parseExcludeInput(manualTerms), ...autoTerms].forEach(term => {
      const key = normalizeTerm(term);
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(term);
      }
    });
    return merged;
  }

  function buildQuery(input) {
    const data = input || {};
    const parts = [];

    if (data.keywords) parts.push(String(data.keywords).trim());
    if (data.exactPhrase) parts.push(`"${String(data.exactPhrase).trim()}"`);

    if (data.fromUser) {
      const user = String(data.fromUser).trim().replace(/^@/, '');
      if (user) parts.push(`from:${user}`);
    }

    mergeExcludeTerms(data.excludeWords, data.noise).forEach(term => parts.push(formatExcludeTerm(term)));

    if (data.sinceDate) parts.push(`since:${data.sinceDate}`);
    if (data.untilDate) parts.push(`until:${data.untilDate}`);
    if (data.minFaves) parts.push(`min_faves:${data.minFaves}`);
    if (data.minRetweets) parts.push(`min_retweets:${data.minRetweets}`);
    if (data.lang) parts.push(`lang:${data.lang}`);
    if (data.hasImages) parts.push('filter:images');
    if (data.hasVideos) parts.push('filter:videos');
    if (data.excludeLinks) parts.push('-filter:links');

    return parts.join(' ');
  }

  function buildSearchUrl(input) {
    const mode = input && input.mode === 'top' ? 'top' : 'live';
    const query = buildQuery(input);
    return `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=${mode}`;
  }

  root.HyperXosistAgent = {
    version: '1.0.0',
    paymentRequired: true,
    paymentManifest: 'x402-payment.json',
    paymentEndpoint: 'https://kg-ninja-x402-revenue-gate-mainnet-staging.fuwafuwow.workers.dev/hyperxosist-query',
    paymentOptionsEndpoint: 'https://kg-ninja-x402-revenue-gate-mainnet-staging.fuwafuwow.workers.dev/payment-options.json',
    buildQuery,
    buildSearchUrl,
    noiseRules,
    repostBlacklistTerms
  };
})(typeof window !== 'undefined' ? window : globalThis);

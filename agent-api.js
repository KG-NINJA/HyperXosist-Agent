/**
 * HyperXosist Agent API v2
 * Single source of truth for X advanced search query building,
 * noise reduction, research templates, and x402 paid agent requests.
 */
(function (root) {
  'use strict';

  const VERSION = '2.0.0';

  const PAYMENT_ENDPOINT =
    'https://kg-ninja-x402-revenue-gate-mainnet-staging.fuwafuwow.workers.dev/hyperxosist-query';
  const PAYMENT_OPTIONS_ENDPOINT =
    'https://kg-ninja-x402-revenue-gate-mainnet-staging.fuwafuwow.workers.dev/payment-options.json';

  /** Common high-volume repost / engagement-bait phrases (synced with top30_repost_blacklist.json). */
  const repostBlacklistTerms = [
    'what do you think',
    'do you agree',
    'agree or disagree',
    'thoughts on this',
    'your thoughts',
    'thoughts?',
    'comment below',
    'drop a comment',
    'tag someone who',
    'tag your friends',
    'tag a friend',
    'rt if you agree',
    'retweet if you agree',
    'retweet if',
    'save this post',
    'save for later',
    'share this with',
    'share if you agree',
    'this is insane',
    'this is crazy',
    "you won't believe",
    'wait for it',
    'wait till the end',
    'the ending is',
    'mind blown',
    'mind-blowing',
    'unbelievable',
    'shocking',
    'insane video',
    'crazy video',
    'going viral',
    'viral video',
    'internet is losing it',
    'people are losing it',
    'everyone needs to see this',
    'you need to see this',
    'breaking:',
    'just in:',
    'update:',
    'live update',
    'developing',
    'developing story',
    'exclusive:',
    'pov:',
    'me when',
    'when the',
    'the way he',
    'the way she',
    'no words',
    'speechless',
    'hits different',
    'this hits hard',
    'double tap if',
    'like if you agree',
    'follow for more',
    'meanwhile...',
    'writer:',
    'sources:',
    'this is why',
    'the reason is',
    'this video is',
    'wait until you see'
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

  /** Machine-readable operator catalog for agents and UI tooltips. */
  const OPERATOR_REFERENCE = {
    keywords: { type: 'free-text', description: 'Space-separated keywords (AND).' },
    anyOf: { type: 'free-text-or-array', description: 'OR group: (a OR b OR c).' },
    exactPhrase: { type: 'phrase', description: 'Exact phrase in double quotes.' },
    fromUser: { type: 'user', description: 'from:username — posts by user.' },
    toUser: { type: 'user', description: 'to:username — replies to user.' },
    mentionUser: { type: 'user', description: '@username — mentions.' },
    excludeWords: { type: 'terms', description: 'Minus terms; quoted when needed.' },
    hashtags: { type: 'tags', description: 'One or more #tags (without or with #).' },
    urlDomain: { type: 'domain', description: 'url:domain filter.' },
    sinceDate: { type: 'date', description: 'since:YYYY-MM-DD' },
    untilDate: { type: 'date', description: 'until:YYYY-MM-DD' },
    minFaves: { type: 'number', description: 'min_faves:N' },
    minRetweets: { type: 'number', description: 'min_retweets:N' },
    minReplies: { type: 'number', description: 'min_replies:N' },
    lang: { type: 'lang-code', description: 'lang:xx or omit for global.' },
    hasImages: { type: 'boolean', description: 'filter:images' },
    hasVideos: { type: 'boolean', description: 'filter:videos' },
    hasMedia: { type: 'boolean', description: 'filter:media' },
    hasLinks: { type: 'boolean', description: 'filter:links' },
    excludeLinks: { type: 'boolean', description: '-filter:links' },
    onlyReplies: { type: 'boolean', description: 'filter:replies' },
    excludeReplies: { type: 'boolean', description: '-filter:replies' },
    verifiedOnly: { type: 'boolean', description: 'filter:verified' },
    safeOnly: { type: 'boolean', description: 'filter:safe' },
    quoteOnly: { type: 'boolean', description: 'filter:quote' },
    nativeVideo: { type: 'boolean', description: 'filter:native_video' },
    mode: { type: 'enum', values: ['live', 'top'], description: 'X search tab.' },
    noise: {
      type: 'object',
      description: 'Noise reduction: enabled, preset (low|medium|high), removed[]'
    }
  };

  /**
   * Research templates for common OSINT / product / discourse workflows.
   * Applying a template merges defaults; user fields override.
   */
  const RESEARCH_TEMPLATES = {
    product_feedback: {
      id: 'product_feedback',
      label: 'Product feedback',
      labelJa: 'プロダクトフィードバック',
      description: 'High-signal user complaints and feature requests with noise reduction.',
      defaults: {
        mode: 'live',
        minFaves: 5,
        excludeReplies: false,
        noise: { enabled: true, preset: 'medium', removed: [] },
        anyOf: 'bug, broken, issue, feature request, please add, 不具合, バグ, 改善して'
      }
    },
    competitor_watch: {
      id: 'competitor_watch',
      label: 'Competitor watch',
      labelJa: '競合ウォッチ',
      description: 'Mentions around a brand/product with engagement floor.',
      defaults: {
        mode: 'live',
        minFaves: 10,
        excludeReplies: true,
        noise: { enabled: true, preset: 'medium', removed: [] }
      }
    },
    news_pulse: {
      id: 'news_pulse',
      label: 'News pulse',
      labelJa: 'ニュース速報',
      description: 'Breaking discourse without pure engagement bait.',
      defaults: {
        mode: 'live',
        minFaves: 50,
        excludeReplies: true,
        noise: { enabled: true, preset: 'high', removed: [] }
      }
    },
    ai_discourse: {
      id: 'ai_discourse',
      label: 'AI discourse',
      labelJa: 'AI議論',
      description: 'Frontier AI / LLM conversation with spam cut.',
      defaults: {
        keywords: 'AI OR LLM OR "frontier model"',
        lang: 'en',
        mode: 'live',
        minFaves: 20,
        noise: { enabled: true, preset: 'medium', removed: [] }
      }
    },
    japanese_trend: {
      id: 'japanese_trend',
      label: 'Japanese trend',
      labelJa: '日本語トレンド',
      description: 'JP-language trending discussion, light engagement filter.',
      defaults: {
        lang: 'ja',
        mode: 'top',
        minFaves: 30,
        noise: { enabled: true, preset: 'low', removed: [] }
      }
    },
    media_only: {
      id: 'media_only',
      label: 'Media only',
      labelJa: 'メディアのみ',
      description: 'Images or videos with engagement floor.',
      defaults: {
        mode: 'top',
        hasMedia: true,
        minFaves: 100,
        noise: { enabled: true, preset: 'medium', removed: [] }
      }
    },
    clean_original: {
      id: 'clean_original',
      label: 'Clean original posts',
      labelJa: 'クリーンな原文投稿',
      description: 'Exclude replies, links optional, aggressive bait filter.',
      defaults: {
        mode: 'live',
        excludeReplies: true,
        minFaves: 15,
        noise: { enabled: true, preset: 'high', removed: [] }
      }
    },
    signal_to_fix: {
      id: 'signal_to_fix',
      label: 'Signal-to-Fix handoff',
      labelJa: 'Signal-to-Fix 連携',
      description: 'Candidate feedback for keep-only PR spec pipelines.',
      defaults: {
        mode: 'live',
        minFaves: 3,
        minReplies: 1,
        noise: { enabled: true, preset: 'medium', removed: [] },
        anyOf: 'feedback, complaint, request, broken, missing, 要望, 不便, 直して'
      }
    }
  };

  const DATE_PRESETS = {
    '24h': { days: 1, label: 'Last 24h' },
    '7d': { days: 7, label: 'Last 7 days' },
    '30d': { days: 30, label: 'Last 30 days' },
    '90d': { days: 90, label: 'Last 90 days' },
    '1y': { days: 365, label: 'Last year' }
  };

  const MAX_QUERY_LENGTH = 500;
  const WARN_QUERY_LENGTH = 400;

  function normalizeTerm(term) {
    return String(term || '').trim().replace(/^[-]+/, '').replace(/^"|"$/g, '').toLowerCase();
  }

  function stripAt(user) {
    return String(user || '').trim().replace(/^@+/, '');
  }

  function normalizeHashtag(tag) {
    const t = String(tag || '').trim();
    if (!t) return '';
    return t.startsWith('#') ? t : `#${t}`;
  }

  function parseExcludeInput(value) {
    if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
    const matches = String(value || '').match(/"[^"]+"|\S+/g) || [];
    return matches.map((term) => term.replace(/^"|"$/g, '').trim()).filter(Boolean);
  }

  function parseListInput(value) {
    if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
    return String(value || '')
      .split(/[,\n]+|\s+OR\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** Hashtags: split on commas, whitespace, or OR (each token is one tag). */
  function parseHashtagInput(value) {
    if (Array.isArray(value)) {
      return value
        .flatMap((v) => String(v).split(/[\s,]+/))
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return String(value || '')
      .split(/[\s,]+|\s+OR\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function formatExcludeTerm(term) {
    const cleaned = String(term || '').trim();
    const needsQuote = /\s/.test(cleaned) || (/[ぁ-んァ-ン一-龯]/.test(cleaned) && cleaned.length >= 5);
    return `-${needsQuote ? `"${cleaned}"` : cleaned}`;
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

  function mergeExcludeTerms(manualTerms, noise) {
    const merged = [];
    const seen = new Set();
    const removed = new Set((noise && noise.removed ? noise.removed : []).map(normalizeTerm));
    const autoTerms =
      noise && noise.enabled
        ? getPresetTerms(noise.preset || 'medium').filter((term) => !removed.has(normalizeTerm(term)))
        : [];

    [...parseExcludeInput(manualTerms), ...autoTerms].forEach((term) => {
      const key = normalizeTerm(term);
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(term);
      }
    });
    return merged;
  }

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function applyDatePreset(presetKey, baseDate) {
    const preset = DATE_PRESETS[presetKey];
    if (!preset) return null;
    const end = baseDate ? new Date(baseDate) : new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - preset.days);
    return {
      sinceDate: formatDateISO(start),
      untilDate: formatDateISO(end)
    };
  }

  function applyTemplate(templateId, overrides) {
    const template = RESEARCH_TEMPLATES[templateId];
    if (!template) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    const base = JSON.parse(JSON.stringify(template.defaults));
    const over = overrides || {};
    const merged = { ...base, ...over };
    if (base.noise || over.noise) {
      merged.noise = { ...(base.noise || {}), ...(over.noise || {}) };
    }
    merged._templateId = templateId;
    return merged;
  }

  function positiveNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }

  function buildAnyOfClause(anyOf) {
    const terms = parseListInput(anyOf);
    if (terms.length === 0) return '';
    if (terms.length === 1) return terms[0];
    const formatted = terms.map((t) => (/\s/.test(t) ? `"${t}"` : t));
    return `(${formatted.join(' OR ')})`;
  }

  function buildQuery(input) {
    const data = input || {};
    const parts = [];

    if (data.keywords) parts.push(String(data.keywords).trim());

    const anyClause = buildAnyOfClause(data.anyOf);
    if (anyClause) parts.push(anyClause);

    if (data.exactPhrase) parts.push(`"${String(data.exactPhrase).trim()}"`);

    if (data.fromUser) {
      const user = stripAt(data.fromUser);
      if (user) parts.push(`from:${user}`);
    }
    if (data.toUser) {
      const user = stripAt(data.toUser);
      if (user) parts.push(`to:${user}`);
    }
    if (data.mentionUser) {
      const user = stripAt(data.mentionUser);
      if (user) parts.push(`@${user}`);
    }

    const tags = parseHashtagInput(data.hashtags);
    tags.forEach((tag) => {
      const h = normalizeHashtag(tag);
      if (h) parts.push(h);
    });

    if (data.urlDomain) {
      const domain = String(data.urlDomain).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (domain) parts.push(`url:${domain}`);
    }

    mergeExcludeTerms(data.excludeWords, data.noise).forEach((term) => {
      parts.push(formatExcludeTerm(term));
    });

    if (data.sinceDate) parts.push(`since:${data.sinceDate}`);
    if (data.untilDate) parts.push(`until:${data.untilDate}`);

    const minFaves = positiveNumber(data.minFaves);
    const minRetweets = positiveNumber(data.minRetweets);
    const minReplies = positiveNumber(data.minReplies);
    if (minFaves !== null) parts.push(`min_faves:${minFaves}`);
    if (minRetweets !== null) parts.push(`min_retweets:${minRetweets}`);
    if (minReplies !== null) parts.push(`min_replies:${minReplies}`);

    if (data.lang) parts.push(`lang:${data.lang}`);

    if (data.hasImages) parts.push('filter:images');
    if (data.hasVideos) parts.push('filter:videos');
    if (data.hasMedia) parts.push('filter:media');
    if (data.hasLinks) parts.push('filter:links');
    if (data.excludeLinks) parts.push('-filter:links');
    if (data.onlyReplies) parts.push('filter:replies');
    if (data.excludeReplies) parts.push('-filter:replies');
    if (data.verifiedOnly) parts.push('filter:verified');
    if (data.safeOnly) parts.push('filter:safe');
    if (data.quoteOnly) parts.push('filter:quote');
    if (data.nativeVideo) parts.push('filter:native_video');

    // Raw advanced fragment for power users (appended last).
    if (data.rawOperators) {
      const raw = String(data.rawOperators).trim();
      if (raw) parts.push(raw);
    }

    return parts.join(' ');
  }

  function buildSearchUrl(input) {
    const mode = input && input.mode === 'top' ? 'top' : 'live';
    const query = buildQuery(input);
    return `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=${mode}`;
  }

  function analyzeQuery(inputOrQuery) {
    const query =
      typeof inputOrQuery === 'string' ? inputOrQuery : buildQuery(inputOrQuery || {});
    const length = query.length;
    const operators = [];
    const opPatterns = [
      /\bfrom:\S+/gi,
      /\bto:\S+/gi,
      /\bsince:\S+/gi,
      /\buntil:\S+/gi,
      /\bmin_faves:\d+/gi,
      /\bmin_retweets:\d+/gi,
      /\bmin_replies:\d+/gi,
      /\blang:\S+/gi,
      /\burl:\S+/gi,
      /#\S+/g,
      /@\S+/g,
      /filter:\w+/gi,
      /-filter:\w+/gi,
      /"[^"]+"/g,
      /\([^)]*\bOR\b[^)]*\)/gi
    ];
    opPatterns.forEach((re) => {
      const m = query.match(re);
      if (m) operators.push(...m);
    });
    const excludeCount = (query.match(/(?:^|\s)-(?!filter:)(?:"[^"]+"|\S+)/g) || []).length;

    let severity = 'ok';
    const warnings = [];
    if (length === 0) {
      severity = 'empty';
      warnings.push('Query is empty.');
    } else if (length > MAX_QUERY_LENGTH) {
      severity = 'error';
      warnings.push(`Query length ${length} exceeds recommended max ${MAX_QUERY_LENGTH}.`);
    } else if (length > WARN_QUERY_LENGTH) {
      severity = 'warn';
      warnings.push(`Query is long (${length} chars); some clients may truncate.`);
    }
    if (excludeCount > 40) {
      severity = severity === 'error' ? 'error' : 'warn';
      warnings.push(`Many exclude terms (${excludeCount}); consider a lower noise preset.`);
    }

    return {
      query,
      length,
      operatorCount: operators.length,
      excludeCount,
      operators: operators.slice(0, 50),
      severity,
      warnings,
      limits: { max: MAX_QUERY_LENGTH, warn: WARN_QUERY_LENGTH }
    };
  }

  function explainQuery(input) {
    const data = input || {};
    const lines = [];
    if (data.keywords) lines.push(`Keywords (AND): ${data.keywords}`);
    if (data.anyOf) lines.push(`Any of (OR): ${parseListInput(data.anyOf).join(' | ')}`);
    if (data.exactPhrase) lines.push(`Exact phrase: "${data.exactPhrase}"`);
    if (data.fromUser) lines.push(`From user: @${stripAt(data.fromUser)}`);
    if (data.toUser) lines.push(`To user: @${stripAt(data.toUser)}`);
    if (data.mentionUser) lines.push(`Mentions: @${stripAt(data.mentionUser)}`);
    if (data.hashtags) lines.push(`Hashtags: ${parseHashtagInput(data.hashtags).map(normalizeHashtag).join(' ')}`);
    if (data.urlDomain) lines.push(`URL domain: ${data.urlDomain}`);
    const excludes = mergeExcludeTerms(data.excludeWords, data.noise);
    if (excludes.length) {
      lines.push(`Excludes (${excludes.length}): ${excludes.slice(0, 12).join(', ')}${excludes.length > 12 ? '…' : ''}`);
    }
    if (data.noise && data.noise.enabled) {
      lines.push(`Noise reduction: ${data.noise.preset || 'medium'}`);
    }
    if (data.sinceDate || data.untilDate) {
      lines.push(`Date range: ${data.sinceDate || '…'} → ${data.untilDate || '…'}`);
    }
    const eng = [];
    if (positiveNumber(data.minFaves) !== null) eng.push(`likes≥${positiveNumber(data.minFaves)}`);
    if (positiveNumber(data.minRetweets) !== null) eng.push(`RTs≥${positiveNumber(data.minRetweets)}`);
    if (positiveNumber(data.minReplies) !== null) eng.push(`replies≥${positiveNumber(data.minReplies)}`);
    if (eng.length) lines.push(`Engagement: ${eng.join(', ')}`);
    if (data.lang) lines.push(`Language: ${data.lang}`);
    const filters = [];
    if (data.hasImages) filters.push('images');
    if (data.hasVideos) filters.push('videos');
    if (data.hasMedia) filters.push('media');
    if (data.hasLinks) filters.push('links');
    if (data.excludeLinks) filters.push('no-links');
    if (data.onlyReplies) filters.push('replies-only');
    if (data.excludeReplies) filters.push('no-replies');
    if (data.verifiedOnly) filters.push('verified');
    if (data.safeOnly) filters.push('safe');
    if (data.quoteOnly) filters.push('quotes');
    if (data.nativeVideo) filters.push('native-video');
    if (filters.length) lines.push(`Filters: ${filters.join(', ')}`);
    if (data.rawOperators) lines.push(`Raw: ${data.rawOperators}`);
    lines.push(`Mode: ${data.mode === 'top' ? 'Top' : 'Latest'}`);
    lines.push(`Query: ${buildQuery(data)}`);
    return lines.join('\n');
  }

  function validateInput(input) {
    const errors = [];
    const warnings = [];
    const data = input || {};

    if (data.sinceDate && data.untilDate && data.sinceDate > data.untilDate) {
      errors.push('sinceDate must be on or before untilDate.');
    }
    ['minFaves', 'minRetweets', 'minReplies'].forEach((k) => {
      if (data[k] !== undefined && data[k] !== null && data[k] !== '') {
        const n = Number(data[k]);
        if (!Number.isFinite(n) || n < 0) errors.push(`${k} must be a non-negative number.`);
      }
    });
    if (data.hasLinks && data.excludeLinks) {
      warnings.push('hasLinks and excludeLinks conflict; excludeLinks wins if both are set in practice—prefer one.');
    }
    if (data.onlyReplies && data.excludeReplies) {
      errors.push('onlyReplies and excludeReplies cannot both be true.');
    }
    if (data.noise && data.noise.preset && !['low', 'medium', 'high'].includes(data.noise.preset)) {
      errors.push('noise.preset must be low, medium, or high.');
    }
    if (data.mode && !['live', 'top'].includes(data.mode)) {
      errors.push('mode must be live or top.');
    }

    const analysis = analyzeQuery(data);
    warnings.push(...analysis.warnings.filter((w) => !errors.includes(w)));
    if (analysis.severity === 'error') {
      errors.push(...analysis.warnings);
    }

    const hasSubstance =
      !!(data.keywords || data.anyOf || data.exactPhrase || data.fromUser || data.toUser ||
        data.mentionUser || data.hashtags || data.urlDomain || data.rawOperators ||
        (data.excludeWords && String(data.excludeWords).trim()) ||
        (data.noise && data.noise.enabled));

    if (!hasSubstance && !buildQuery(data)) {
      warnings.push('Input produces an empty query.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      analysis
    };
  }

  function buildPaidRequest(input) {
    const validation = validateInput(input);
    const query = buildQuery(input);
    const searchUrl = buildSearchUrl(input);
    return {
      paymentRequired: true,
      method: 'POST',
      endpoint: PAYMENT_ENDPOINT,
      paymentOptionsEndpoint: PAYMENT_OPTIONS_ENDPOINT,
      expectedUnpaidStatus: 402,
      expectedPaidStatus: 200,
      body: input || {},
      preview: {
        query,
        searchUrl,
        explanation: explainQuery(input),
        validation
      },
      instruction:
        'AI agents must send this request to the x402 endpoint and complete payment before using the generated query or search URL. preview is for local inspection only and is not a paid result.'
    };
  }

  function buildBatch(inputs) {
    if (!Array.isArray(inputs)) {
      throw new Error('buildBatch expects an array of inputs');
    }
    return inputs.map((input, index) => {
      const validation = validateInput(input);
      return {
        index,
        input,
        query: buildQuery(input),
        searchUrl: buildSearchUrl(input),
        validation,
        paidRequest: buildPaidRequest(input)
      };
    });
  }

  function listTemplates() {
    return Object.values(RESEARCH_TEMPLATES).map((t) => ({
      id: t.id,
      label: t.label,
      labelJa: t.labelJa,
      description: t.description,
      defaults: t.defaults
    }));
  }

  function encodeState(input) {
    try {
      const json = JSON.stringify(input || {});
      if (typeof btoa === 'function') {
        return btoa(unescape(encodeURIComponent(json)));
      }
      // Node
      return Buffer.from(json, 'utf8').toString('base64');
    } catch (e) {
      return '';
    }
  }

  function decodeState(encoded) {
    try {
      let json;
      if (typeof atob === 'function') {
        json = decodeURIComponent(escape(atob(encoded)));
      } else {
        json = Buffer.from(encoded, 'base64').toString('utf8');
      }
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  function getActiveNoiseTerms(noise) {
    if (!noise || !noise.enabled) return [];
    const removed = new Set((noise.removed || []).map(normalizeTerm));
    return getPresetTerms(noise.preset || 'medium').filter((term) => !removed.has(normalizeTerm(term)));
  }

  const api = {
    version: VERSION,
    paymentRequired: true,
    agentUseRequiresPayment: true,
    paymentManifest: 'x402-payment.json',
    paymentEndpoint: PAYMENT_ENDPOINT,
    paymentOptionsEndpoint: PAYMENT_OPTIONS_ENDPOINT,
    MAX_QUERY_LENGTH,
    WARN_QUERY_LENGTH,
    OPERATOR_REFERENCE,
    RESEARCH_TEMPLATES,
    DATE_PRESETS,
    noiseRules,
    repostBlacklistTerms,
    // Core
    buildQuery,
    buildSearchUrl,
    buildPaidRequest,
    buildBatch,
    // Intelligence
    validateInput,
    analyzeQuery,
    explainQuery,
    applyTemplate,
    applyDatePreset,
    listTemplates,
    getPresetTerms,
    getActiveNoiseTerms,
    mergeExcludeTerms,
    // State
    encodeState,
    decodeState,
    // Helpers exposed for UI
    normalizeTerm,
    parseExcludeInput,
    parseListInput,
    formatExcludeTerm,
    stripAt,
    normalizeHashtag
  };

  // UMD-ish export
  root.HyperXosistAgent = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);

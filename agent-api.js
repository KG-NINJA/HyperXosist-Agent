/**
 * HyperXosist Agent API v2.4.0
 * Universal X advanced search toolkit for any AI agent runtime
 * (OpenAI / Anthropic / Grok / Llama / local tool-callers / shell CLI).
 *
 * Core (always on): plan → score → pay → collect → refine → handoff → receipt.
 * Optional: Grok Build mode (X voice → one small code-change prompt).
 *
 * Multi-runtime practical layer:
 *   dispatchToolCall / runTool — real tool-name → method dispatch
 *   toOpenAITools / toAnthropicTools — schema adapters
 *   exportKeepOnlyJson — keep-only machine export for any coding agent
 *   CLI: bin/hyperxosist.js (plan | dispatch | tools | keep | handoff …)
 *
 * Outputs prefer dual shape: structured JSON + .markdown for LLMs that read text.
 * Backward compatible with v2.1 / v2.2 / v2.3 method names and shapes.
 */
(function (root) {
  'use strict';

  const VERSION = '2.5.0';
  const SIGNAL_TO_FIX_URL = 'https://kg-ninja.github.io/Signal-to-Fix/';
  const SIGNAL_TO_FIX_AGENT_USE = 'https://kg-ninja.github.io/Signal-to-Fix/agent-use.json';
  const PUBLIC_BASE = 'https://kg-ninja.github.io/HyperXosist-Agent';
  /** Default agent mode: universal for all LLMs. Pass mode:'grok' for optional Grok Build emphasis. */
  const DEFAULT_AGENT_MODE = 'universal';

  const PaymentEndpoints =
    root.HyperXosistPaymentEndpoints ||
    (typeof module === 'object' && module.exports ? require('./payment-endpoints.js') : null);

  function resolvePaymentEndpoints(options) {
    if (!PaymentEndpoints || typeof PaymentEndpoints.resolve !== 'function') {
      throw new Error('Load payment-endpoints.js before agent-api.js in browser environments.');
    }
    const environment =
      options && (options.paymentEnvironment || options.paymentEndpointEnvironment)
        ? options.paymentEnvironment || options.paymentEndpointEnvironment
        : PaymentEndpoints.defaultEnvironment;
    return PaymentEndpoints.resolve(environment);
  }

  const DEFAULT_PAYMENT_ENDPOINTS = resolvePaymentEndpoints();
  const PAYMENT_ENDPOINT = DEFAULT_PAYMENT_ENDPOINTS.paymentEndpoint;
  const PAYMENT_OPTIONS_ENDPOINT = DEFAULT_PAYMENT_ENDPOINTS.paymentOptionsEndpoint;

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

  /**
   * Noise tiers (editable via customizeNoiseRules / noise.extraTerms / noise.customRules).
   * Tuned so any agent harvests fewer giveaways, engagement bait, and empty hype.
   */
  const DEFAULT_NOISE_RULES = {
    low: [
      'giveaway', 'airdrop', 'claim', 'reward', 'referral', 'free money', 'limited offer', 'click here', 'sign up',
      '無料配布', 'エアドロップ', 'プレゼント企画', '抽選'
    ],
    medium: [
      'thoughts', 'agree', 'bookmark', 'insane', 'game changer', 'big if true', 'must read', 'hot take', 'thread below', 'you need to see this',
      'ブクマ推奨', 'やばい', '革命', 'これはすごい', '知らないと損',
      'love this', 'so good', 'amazing product', 'best ever', 'absolute fire', 'no notes', 'chef kiss',
      'ratio', 'cope', 'seethe', 'touch grass', 'skill issue', 'just vibes', 'main character energy',
      '神', '最強', '尊い', '煽り'
    ],
    high: [
      'gm', 'wagmi', 'alpha', '100x', 'promo', 'presale', 'whitelist', '固定ポスト', '完全攻略', 'フォローで', 'リポストで',
      'pump', 'moonshot', 'paid partnership', 'sponsored', 'follow for more', 'retweet to win',
      'unpopular opinion', 'change my mind', 'fight me', 'based', 'mid', 'ngl', 'lowkey', 'highkey',
      '論破', '草生える', 'ワロタ'
    ]
  };

  /** Runtime-mutable noise rules (starts as copy of defaults). */
  let noiseRules = {
    low: DEFAULT_NOISE_RULES.low.slice(),
    medium: DEFAULT_NOISE_RULES.medium.slice(),
    high: DEFAULT_NOISE_RULES.high.slice()
  };

  /**
   * Patterns that make a post useful for Grok Build code improvement (Keep).
   * Used by scoreTechnicalDepth / filterKeepSignals — not X query excludes.
   */
  const GROK_KEEP_PATTERNS = [
    { re: /\b(bug|crash|error|exception|stack\s*trace|broken|regression|fail(s|ed|ing)?|doesn't work|does not work)\b/i, weight: 28, tag: 'bug' },
    { re: /(不具合|バグ|落ちる|エラー|クラッシュ|動かない|壊れて)/i, weight: 28, tag: 'bug' },
    { re: /\b(feature\s*request|please add|should (have|support)|wish|missing|needs? to|can you add)\b/i, weight: 22, tag: 'feature' },
    { re: /(欲しい|追加して|改善して|要望|実装して|対応して|〜してほしい)/i, weight: 22, tag: 'feature' },
    { re: /\b(ui|ux|layout|button|modal|nav(igation)?|sidebar|dark mode|accessibility|a11y|responsive|mobile)\b/i, weight: 18, tag: 'ui' },
    { re: /(UI|UX|レイアウト|ボタン|モーダル|ナビ|ダークモード|アクセシビリティ|スマホ|見づらい|押しづらい)/i, weight: 18, tag: 'ui' },
    { re: /\b(slow|latency|performance|memory|leak|timeout|lag|cpu|fps|load time)\b/i, weight: 20, tag: 'perf' },
    { re: /(遅い|重い|カクつく|タイムアウト|パフォーマンス|メモリ|待ち時間)/i, weight: 20, tag: 'perf' },
    { re: /\b(api|sdk|docs?|documentation|rate\s*limit|dx|cli|config|type(s|script)?|compile)\b/i, weight: 16, tag: 'dx' },
    { re: /(ドキュメント|API|SDK|型エラー|設定|分かりにくい|手順)/i, weight: 16, tag: 'dx' },
    { re: /\b(steps? to reproduce|repro|expected|actual|when i|after (i|you)|on (ios|android|chrome|safari|firefox))\b/i, weight: 14, tag: 'repro' },
    { re: /(再現|手順|期待|実際|すると|したら|のとき)/i, weight: 10, tag: 'repro' }
  ];

  /** Signals that are usually useless for a single small code change (Drop / low score). */
  const GROK_DROP_PATTERNS = [
    { re: /^(so good|love this|amazing|fire|goat|best ever|no notes)[.!]*$/i, weight: 40, tag: 'empty_praise' },
    { re: /\b(ratio|cope|seethe|touch grass|skill issue|just vibes|main character)\b/i, weight: 30, tag: 'ragebait' },
    { re: /\b(what do you think|thoughts\?|agree or disagree|hot take)\b/i, weight: 25, tag: 'engagement_bait' },
    { re: /(神|最強|尊い|好き|推し)[！!。.\s]*$/i, weight: 20, tag: 'empty_praise_ja' },
    { re: /\b(lfg|wagmi|gm\b|to the moon|100x)\b/i, weight: 25, tag: 'hype' }
  ];

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
    },
    grok_code_improvement: {
      id: 'grok_code_improvement',
      label: 'Grok Build code improvement',
      labelJa: 'Grok Build コード改善',
      description: 'Concrete bugs/feature asks Grok can turn into one small code change.',
      defaults: {
        mode: 'live',
        minFaves: 2,
        minReplies: 0,
        noise: { enabled: true, preset: 'high', removed: [] },
        anyOf:
          'bug, crash, error, broken, regression, feature request, please add, missing, 不具合, バグ, 改善して, 欲しい, 直して'
      }
    },
    ui_ux_feedback: {
      id: 'ui_ux_feedback',
      label: 'UI/UX feedback harvest',
      labelJa: 'UI/UX フィードバック',
      description: 'Layout, interaction, accessibility, and visual friction for frontend fixes.',
      defaults: {
        mode: 'live',
        minFaves: 3,
        excludeReplies: false,
        noise: { enabled: true, preset: 'medium', removed: [] },
        anyOf:
          'UI, UX, layout, button, modal, cluttered, confusing, dark mode, accessibility, 見づらい, 押しづらい, わかりにくい, デザイン'
      }
    },
    performance_complaint: {
      id: 'performance_complaint',
      label: 'Performance complaints',
      labelJa: 'パフォーマンス不満',
      description: 'Latency, jank, memory, and load-time complaints for perf work.',
      defaults: {
        mode: 'live',
        minFaves: 2,
        noise: { enabled: true, preset: 'medium', removed: [] },
        anyOf:
          'slow, lag, latency, performance, timeout, memory leak, heavy, jank, 遅い, 重い, カクつく, タイムアウト, 待たされる'
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

  // Practical X search URL budgets (encoded). Keep excludes capped so agents rarely hit hard fails.
  const MAX_QUERY_LENGTH = 900;
  const WARN_QUERY_LENGTH = 650;
  const NOISE_TERM_LIMITS = { low: 14, medium: 26, high: 36 };

  /** Highest-signal repost/bait phrases first (full list remains in repostBlacklistTerms). */
  const repostBlacklistPriority = [
    'what do you think',
    'do you agree',
    'rt if you agree',
    'retweet if you agree',
    'you need to see this',
    'everyone needs to see this',
    'you won\'t believe',
    'follow for more',
    'like if you agree',
    'tag someone who',
    'comment below',
    'this is insane',
    'going viral',
    'mind blown',
    'wait for it',
    'share if you agree',
    'double tap if',
    'retweet if',
    'save this post',
    'hits different'
  ];

  function normalizeTerm(term) {
    return String(term || '').trim().replace(/^[-]+/, '').replace(/^"|"$/g, '').toLowerCase();
  }

  /**
   * Dual output helper: keep full JSON object and attach human/LLM-readable markdown.
   * Agents that prefer JSON ignore .markdown; agents that prefer text use .markdown / asMarkdown().
   */
  function withDualFormat(payload, markdownBuilder) {
    const out = payload && typeof payload === 'object' ? payload : { value: payload };
    try {
      out.markdown =
        typeof markdownBuilder === 'function' ? String(markdownBuilder(out) || '') : out.markdown || '';
    } catch (e) {
      out.markdown = out.markdown || '';
      out.markdownError = e && e.message ? e.message : String(e);
    }
    out.format = out.format || 'json+markdown';
    out.asMarkdown = function asMarkdown() {
      return out.markdown || '';
    };
    out.asJson = function asJson(pretty) {
      const clone = {};
      Object.keys(out).forEach((k) => {
        if (typeof out[k] === 'function') return;
        clone[k] = out[k];
      });
      return pretty === false ? JSON.stringify(clone) : JSON.stringify(clone, null, 2);
    };
    return out;
  }

  function isGrokMode(opts) {
    const o = opts || {};
    if (o.grokMode === true || o.includeGrokBuild === true || o.mode === 'grok') return true;
    if (o.grokMode === false || o.mode === 'universal') return false;
    return false;
  }

  function resolveAgentMode(opts) {
    return isGrokMode(opts) ? 'grok' : DEFAULT_AGENT_MODE;
  }

  /** Export full noise catalog for transparency / agent editing. */
  function exportNoiseCatalog() {
    return {
      type: 'hyperxosist.noise_catalog.v1',
      version: VERSION,
      limits: { ...NOISE_TERM_LIMITS },
      rules: {
        low: noiseRules.low.slice(),
        medium: noiseRules.medium.slice(),
        high: noiseRules.high.slice()
      },
      repostBlacklistPriority: repostBlacklistPriority.slice(),
      repostBlacklistTerms: repostBlacklistTerms.slice(),
      inputOverrides: {
        'noise.enabled': 'boolean — turn auto excludes on/off',
        'noise.preset': 'low | medium | high',
        'noise.removed': 'string[] — terms to skip from auto list',
        'noise.extraTerms': 'string[] — always-added custom excludes (not capped with preset)',
        'noise.customRules': '{ low?, medium?, high? } — per-call rule overlay (does not mutate global)',
        'noise.maxTerms': 'number — raise/lower cap for this query'
      },
      mutateGlobal: {
        customizeNoiseRules: 'customizeNoiseRules({ low?, medium?, high?, mode: "merge"|"replace" })',
        resetNoiseRules: 'resetNoiseRules() — restore built-in defaults',
        importNoiseCatalog: 'importNoiseCatalog(exportNoiseCatalog() result or rules object)'
      },
      markdown: [
        '# HyperXosist Noise Catalog',
        '',
        `- low (${noiseRules.low.length}): ${noiseRules.low.slice(0, 8).join(', ')}…`,
        `- medium (${noiseRules.medium.length}): ${noiseRules.medium.slice(0, 8).join(', ')}…`,
        `- high (${noiseRules.high.length}): ${noiseRules.high.slice(0, 8).join(', ')}…`,
        `- caps: low=${NOISE_TERM_LIMITS.low}, medium=${NOISE_TERM_LIMITS.medium}, high=${NOISE_TERM_LIMITS.high}`,
        '',
        'Per-query: set `noise.extraTerms` or `noise.customRules` on input.',
        'Global: `customizeNoiseRules` / `importNoiseCatalog` / `resetNoiseRules`.'
      ].join('\n')
    };
  }

  function customizeNoiseRules(partial, options) {
    const opts = options || {};
    const mode = (partial && partial.mode) || opts.mode || 'merge';
    const src = partial || {};
    ['low', 'medium', 'high'].forEach((level) => {
      if (!Array.isArray(src[level])) return;
      const incoming = src[level].map(String).map((t) => t.trim()).filter(Boolean);
      if (mode === 'replace') {
        noiseRules[level] = uniqueTerms(incoming);
      } else {
        noiseRules[level] = uniqueTerms([...noiseRules[level], ...incoming]);
      }
    });
    return exportNoiseCatalog();
  }

  function resetNoiseRules() {
    noiseRules = {
      low: DEFAULT_NOISE_RULES.low.slice(),
      medium: DEFAULT_NOISE_RULES.medium.slice(),
      high: DEFAULT_NOISE_RULES.high.slice()
    };
    return exportNoiseCatalog();
  }

  function importNoiseCatalog(catalog) {
    const c = catalog || {};
    const rules = c.rules || c;
    if (!rules || typeof rules !== 'object') {
      throw new Error('importNoiseCatalog expects { rules: { low, medium, high } } or level maps');
    }
    return customizeNoiseRules(
      {
        low: rules.low,
        medium: rules.medium,
        high: rules.high,
        mode: 'replace'
      },
      { mode: 'replace' }
    );
  }

  function buildShareUrl(input, baseUrl) {
    const encoded = encodeState(input);
    const base = (baseUrl || PUBLIC_BASE).replace(/\/$/, '');
    return `${base}/#s=${encoded}`;
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

  function uniqueTerms(terms) {
    const merged = [];
    const seen = new Set();
    terms.forEach((term) => {
      const key = normalizeTerm(term);
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(term);
      }
    });
    return merged;
  }

  /**
   * Ordered noise terms (highest priority first), capped for practical X query length.
   * Agents can raise cap via noise.maxTerms.
   */
  function getPresetTerms(preset, options) {
    const opts = options || {};
    const level = preset || 'medium';
    const rules =
      opts.customRules && typeof opts.customRules === 'object'
        ? {
            low: Array.isArray(opts.customRules.low) ? opts.customRules.low : noiseRules.low,
            medium: Array.isArray(opts.customRules.medium) ? opts.customRules.medium : noiseRules.medium,
            high: Array.isArray(opts.customRules.high) ? opts.customRules.high : noiseRules.high
          }
        : noiseRules;
    let ordered;
    if (level === 'high') {
      // Keep the documented Low + Medium + High core rules inside the default cap.
      // Additional bait/repost terms follow them and remain available via maxTerms.
      ordered = [
        ...rules.low,
        ...rules.medium.slice(0, 11),
        ...rules.high.slice(0, 12),
        ...rules.medium.slice(11),
        ...rules.high.slice(12),
        ...repostBlacklistPriority,
        ...repostBlacklistTerms
      ];
    } else if (level === 'medium') {
      ordered = [...rules.low, ...rules.medium, ...repostBlacklistPriority, ...repostBlacklistTerms];
    } else {
      ordered = [...rules.low];
    }
    const unique = uniqueTerms(ordered);
    const defaultLimit = NOISE_TERM_LIMITS[level] || NOISE_TERM_LIMITS.medium;
    const limit =
      opts.maxTerms != null && Number.isFinite(Number(opts.maxTerms))
        ? Math.max(1, Math.floor(Number(opts.maxTerms)))
        : defaultLimit;
    return unique.slice(0, limit);
  }

  function mergeExcludeTerms(manualTerms, noise) {
    const n = noise || {};
    const removed = new Set((n.removed ? n.removed : []).map(normalizeTerm));
    const autoTerms =
      n.enabled
        ? getPresetTerms(n.preset || 'medium', {
            maxTerms: n.maxTerms,
            customRules: n.customRules
          }).filter((term) => !removed.has(normalizeTerm(term)))
        : [];

    // Manual excludes + extraTerms always win and are not preset-capped.
    const extras = parseExcludeInput(n.extraTerms);
    return uniqueTerms([...parseExcludeInput(manualTerms), ...extras, ...autoTerms]);
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

  // ---------------------------------------------------------------------------
  // Agent-first layer: scoring, missions, intent planning, handoffs, tools
  // ---------------------------------------------------------------------------

  const MISSIONS = {
    product_feedback_radar: {
      id: 'product_feedback_radar',
      label: 'Product feedback radar',
      whyAgentsUseIt:
        'Multi-angle complaints + feature requests + bugs in one deterministic campaign. Highest reuse rate for shipping loops.',
      recommendedNext: 'signal_to_fix',
      defaultBudgetUsd: 0.03,
      angles: [
        {
          id: 'complaints',
          templateId: 'product_feedback',
          rationale: 'Capture friction and complaints with engagement floor.',
          overrides: {
            anyOf: 'hate, annoying, broken, frustrating, 不便, 使えない, 最悪, complaint',
            minFaves: 3,
            mode: 'live'
          }
        },
        {
          id: 'feature_asks',
          templateId: 'product_feedback',
          rationale: 'Surface explicit feature / improvement asks.',
          overrides: {
            anyOf: 'please add, wish, should have, feature request, 欲しい, 追加して, 改善して',
            minFaves: 2,
            mode: 'live'
          }
        },
        {
          id: 'bugs',
          templateId: 'product_feedback',
          rationale: 'Isolate defect language for actionable issues.',
          overrides: {
            anyOf: 'bug, crash, error, broken, 不具合, バグ, 落ちる, エラー',
            minFaves: 1,
            minReplies: 0,
            mode: 'live'
          }
        }
      ]
    },
    competitive_intel: {
      id: 'competitive_intel',
      label: 'Competitive intelligence',
      whyAgentsUseIt: 'Compare subject vs alternatives with noise cut — good for weekly monitoring jobs.',
      recommendedNext: null,
      defaultBudgetUsd: 0.03,
      angles: [
        {
          id: 'direct_mentions',
          templateId: 'competitor_watch',
          rationale: 'Direct brand/product mentions with reply exclusion.',
          overrides: { excludeReplies: true, minFaves: 5, mode: 'live' }
        },
        {
          id: 'switching',
          templateId: 'competitor_watch',
          rationale: 'Switch / churn / comparison language.',
          overrides: {
            anyOf: 'switched from, switching to, alternative to, vs, 乗り換え, 比較',
            minFaves: 5,
            mode: 'live'
          }
        },
        {
          id: 'praise_risk',
          templateId: 'clean_original',
          rationale: 'High-signal praise or critique without bait.',
          overrides: { minFaves: 20, mode: 'top' }
        }
      ]
    },
    launch_pulse: {
      id: 'launch_pulse',
      label: 'Launch / news pulse',
      whyAgentsUseIt: 'Time-boxed discourse snapshot for launches and incidents.',
      recommendedNext: null,
      defaultBudgetUsd: 0.02,
      angles: [
        {
          id: 'breaking',
          templateId: 'news_pulse',
          rationale: 'High engagement recent chatter.',
          overrides: { minFaves: 50, mode: 'live', excludeReplies: true }
        },
        {
          id: 'media',
          templateId: 'media_only',
          rationale: 'Visual posts that often carry launch demos.',
          overrides: { hasMedia: true, minFaves: 30, mode: 'top' }
        }
      ]
    },
    signal_to_fix_pipeline: {
      id: 'signal_to_fix_pipeline',
      label: 'Signal-to-Fix pipeline',
      whyAgentsUseIt:
        'End-to-end: clean X candidates → handoff package → keep-only PR specs. The sticky agent habit loop.',
      recommendedNext: 'signal_to_fix',
      defaultBudgetUsd: 0.03,
      angles: [
        {
          id: 'keep_candidates',
          templateId: 'signal_to_fix',
          rationale: 'Primary feedback harvest for keep-only filtering.',
          overrides: { mode: 'live', minFaves: 3, minReplies: 1 }
        },
        {
          id: 'dev_pain',
          templateId: 'product_feedback',
          rationale: 'Developer / power-user pain language.',
          overrides: {
            anyOf: 'docs, API, rate limit, DX, ドキュメント, 分かりにくい, missing',
            minFaves: 2,
            mode: 'live'
          }
        },
        {
          id: 'jp_feedback',
          templateId: 'japanese_trend',
          rationale: 'Japanese-language feedback slice when product has JP users.',
          overrides: { lang: 'ja', minFaves: 5, mode: 'live' }
        }
      ]
    },
    osint_entity: {
      id: 'osint_entity',
      label: 'Entity / person OSINT',
      whyAgentsUseIt: 'Structured from/to/mention angles without engagement-bait noise.',
      recommendedNext: null,
      defaultBudgetUsd: 0.03,
      angles: [
        {
          id: 'from_user',
          templateId: 'clean_original',
          rationale: 'Posts authored by entity.',
          overrides: { excludeReplies: false, minFaves: 0, mode: 'live' },
          mapContext: { fromUser: 'entity' }
        },
        {
          id: 'mentions',
          templateId: 'clean_original',
          rationale: 'Mentions of entity by others.',
          overrides: { minFaves: 5, excludeReplies: true, mode: 'live' },
          mapContext: { mentionUser: 'entity' }
        },
        {
          id: 'replies_to',
          templateId: 'clean_original',
          rationale: 'Replies directed at entity.',
          overrides: { onlyReplies: true, minFaves: 0, mode: 'live' },
          mapContext: { toUser: 'entity' }
        }
      ]
    },
    weekly_monitor: {
      id: 'weekly_monitor',
      label: 'Weekly monitor (7d)',
      whyAgentsUseIt: 'Cron-friendly 7-day window with stable operators — ideal recurring agent jobs.',
      recommendedNext: 'signal_to_fix',
      defaultBudgetUsd: 0.02,
      angles: [
        {
          id: 'week_live',
          templateId: 'product_feedback',
          rationale: 'Last 7 days live feedback.',
          overrides: { mode: 'live', minFaves: 5 },
          datePreset: '7d'
        },
        {
          id: 'week_top',
          templateId: 'clean_original',
          rationale: 'Last 7 days top posts for themes.',
          overrides: { mode: 'top', minFaves: 25, excludeReplies: true },
          datePreset: '7d'
        }
      ]
    },
    grok_code_improvement_radar: {
      id: 'grok_code_improvement_radar',
      label: 'Grok Build code improvement radar',
      whyAgentsUseIt:
        'Harvest concrete bugs/feature asks → technical-depth Keep filter → Grok Build Prompt for one small code change.',
      recommendedNext: 'grok_build',
      defaultBudgetUsd: 0.03,
      angles: [
        {
          id: 'actionable_bugs',
          templateId: 'grok_code_improvement',
          rationale: 'Defect language Grok can map to a fix.',
          overrides: {
            anyOf: 'bug, crash, error, broken, regression, 不具合, バグ, 落ちる, エラー',
            minFaves: 1,
            mode: 'live'
          }
        },
        {
          id: 'small_feature_asks',
          templateId: 'grok_code_improvement',
          rationale: 'Scoped feature / improvement asks (one PR size).',
          overrides: {
            anyOf: 'please add, feature request, wish, should support, missing, 欲しい, 追加して, 改善して',
            minFaves: 2,
            mode: 'live'
          }
        },
        {
          id: 'dx_pain',
          templateId: 'product_feedback',
          rationale: 'Developer-facing friction for Grok Build DX patches.',
          overrides: {
            anyOf: 'docs, API, SDK, type error, rate limit, DX, CLI, ドキュメント, 型, 分かりにくい',
            minFaves: 2,
            noise: { enabled: true, preset: 'high', removed: [] },
            mode: 'live'
          }
        }
      ]
    },
    ui_ux_feedback_harvest: {
      id: 'ui_ux_feedback_harvest',
      label: 'UI/UX feedback harvest',
      whyAgentsUseIt: 'Frontend-oriented angles for Grok Build UI patches and layout fixes.',
      recommendedNext: 'grok_build',
      defaultBudgetUsd: 0.02,
      angles: [
        {
          id: 'layout_friction',
          templateId: 'ui_ux_feedback',
          rationale: 'Cluttered / confusing UI language.',
          overrides: {
            anyOf: 'cluttered, confusing, hard to find, UI, layout, 見づらい, わかりにくい, どこにある',
            minFaves: 3,
            mode: 'live'
          }
        },
        {
          id: 'interaction',
          templateId: 'ui_ux_feedback',
          rationale: 'Buttons, modals, navigation friction.',
          overrides: {
            anyOf: 'button, modal, nav, sidebar, click, tap, ボタン, モーダル, 押しづらい, 反応しない',
            minFaves: 2,
            mode: 'live'
          }
        }
      ]
    },
    performance_complaint_detector: {
      id: 'performance_complaint_detector',
      label: 'Performance complaint detector',
      whyAgentsUseIt: 'Latency/jank/memory complaints for Grok Build perf-focused micro-improvements.',
      recommendedNext: 'grok_build',
      defaultBudgetUsd: 0.02,
      angles: [
        {
          id: 'slowness',
          templateId: 'performance_complaint',
          rationale: 'Slow / lag language.',
          overrides: {
            anyOf: 'slow, lag, latency, jank, load time, 遅い, 重い, カクつく, 待たされる',
            minFaves: 2,
            mode: 'live'
          }
        },
        {
          id: 'resource',
          templateId: 'performance_complaint',
          rationale: 'Timeouts and resource issues.',
          overrides: {
            anyOf: 'timeout, memory leak, OOM, cpu, freeze, タイムアウト, フリーズ, メモリ',
            minFaves: 1,
            mode: 'live'
          }
        }
      ]
    }
  };

  const INTENT_PATTERNS = [
    {
      id: 'grok_build',
      re: /grok\s*build|grok\s*prompt|code\s*improvement|small\s*(fix|pr|patch)|1つだけ|小さな改善/i,
      missionId: 'grok_code_improvement_radar'
    },
    {
      id: 'ui_ux',
      re: /\bui\b|\bux\b|layout|accessibility|a11y|dark\s*mode|フロント|見づらい|押しづらい|デザイン/i,
      missionId: 'ui_ux_feedback_harvest'
    },
    {
      id: 'performance',
      re: /performance|latency|slow|jank|memory\s*leak|タイムアウト|遅い|重い|カクつく|パフォーマンス/i,
      missionId: 'performance_complaint_detector'
    },
    {
      id: 'feedback',
      re: /feedback|complaint|feature\s*request|bug|不具合|要望|改善|クレーム|pain/i,
      missionId: 'product_feedback_radar'
    },
    {
      id: 'competitor',
      re: /competitor|competitive|vs\.?|alternative|競合|比較|乗り換え/i,
      missionId: 'competitive_intel'
    },
    {
      id: 'launch',
      re: /launch|release|announce|breaking|incident|速報|リリース|障害/i,
      missionId: 'launch_pulse'
    },
    {
      id: 'pr_spec',
      re: /pr\s*spec|signal.?to.?fix|implementation|codex|keep-only|issue\s*cluster/i,
      missionId: 'signal_to_fix_pipeline'
    },
    {
      id: 'osint',
      re: /osint|from:|@\w+|person|account|entity|人物|アカウント/i,
      missionId: 'osint_entity'
    },
    {
      id: 'weekly',
      re: /weekly|every\s*week|monitor|cron|定期|監視|7\s*d/i,
      missionId: 'weekly_monitor'
    }
  ];

  function deepMerge(base, over) {
    const out = { ...(base || {}) };
    Object.keys(over || {}).forEach((k) => {
      if (
        over[k] &&
        typeof over[k] === 'object' &&
        !Array.isArray(over[k]) &&
        base &&
        base[k] &&
        typeof base[k] === 'object' &&
        !Array.isArray(base[k])
      ) {
        out[k] = deepMerge(base[k], over[k]);
      } else {
        out[k] = over[k];
      }
    });
    return out;
  }

  function scoreQuery(input) {
    const data = input || {};
    const validation = validateInput(data);
    const analysis = analyzeQuery(data);
    const reasons = [];
    let score = 40;

    const hasTopic = !!(
      data.keywords ||
      data.anyOf ||
      data.exactPhrase ||
      data.hashtags ||
      data.fromUser ||
      data.mentionUser
    );
    if (hasTopic) {
      score += 15;
      reasons.push({ code: 'has_topic', delta: 15, detail: 'Topic anchors present.' });
    } else {
      score -= 20;
      reasons.push({ code: 'no_topic', delta: -20, detail: 'No keywords/anyOf/phrase/hashtags/entity.' });
    }

    if (data.noise && data.noise.enabled) {
      const boost = data.noise.preset === 'high' ? 16 : data.noise.preset === 'medium' ? 14 : 8;
      score += boost;
      reasons.push({
        code: 'noise_on',
        delta: boost,
        detail: `Noise preset ${data.noise.preset || 'medium'} (capped for query length).`
      });
    } else {
      score -= 8;
      reasons.push({ code: 'noise_off', delta: -8, detail: 'Noise filter off — expect more spam.' });
    }

    if (positiveNumber(data.minFaves) !== null || positiveNumber(data.minRetweets) !== null) {
      score += 10;
      reasons.push({ code: 'engagement_floor', delta: 10, detail: 'Engagement floor reduces bait.' });
    }

    if (data.sinceDate || data.untilDate) {
      score += 8;
      reasons.push({ code: 'time_bound', delta: 8, detail: 'Date window improves relevance.' });
    }

    if (data.excludeReplies) {
      score += 5;
      reasons.push({ code: 'no_replies', delta: 5, detail: 'Excluding replies favors originals.' });
    }

    if (data.fromUser || data.toUser || data.mentionUser) {
      score += 6;
      reasons.push({ code: 'entity_scope', delta: 6, detail: 'Entity-scoped operators.' });
    }

    if (analysis.excludeCount > 45) {
      score -= 10;
      reasons.push({ code: 'exclude_heavy', delta: -10, detail: 'Heavy excludes; consider lower preset.' });
    } else if (analysis.excludeCount >= 8 && analysis.excludeCount <= 40) {
      score += 6;
      reasons.push({ code: 'exclude_balanced', delta: 6, detail: 'Healthy capped exclude set.' });
    }

    if (analysis.severity === 'warn') {
      score -= 6;
      reasons.push({ code: 'length_warn', delta: -6, detail: 'Query length warning.' });
    }
    if (analysis.severity === 'error' || !validation.valid) {
      score -= 20;
      reasons.push({ code: 'invalid', delta: -20, detail: 'Validation errors present.' });
    }
    if (analysis.severity === 'empty') {
      score = 0;
      reasons.push({ code: 'empty', delta: -40, detail: 'Empty query.' });
    }

    score = Math.max(0, Math.min(100, score));
    let band = 'poor';
    if (score >= 80) band = 'excellent';
    else if (score >= 65) band = 'good';
    else if (score >= 45) band = 'fair';

    // Fair+ and valid is enough to recommend a $0.01 paid call
    const recommendPay =
      validation.valid && score >= 45 && analysis.severity !== 'empty' && analysis.severity !== 'error';

    const result = {
      score,
      band,
      recommendPay,
      reasons,
      validation,
      analysis,
      query: analysis.query
    };

    return withDualFormat(result, (r) => {
      const lines = [
        `## Query score: ${r.score}/100 (${r.band})`,
        '',
        `- recommendPay: **${r.recommendPay}**`,
        `- query: \`${r.query || '(empty)'}\``,
        `- valid: ${r.validation.valid}`,
        '',
        '### Reasons'
      ];
      (r.reasons || []).forEach((x) => {
        lines.push(`- \`${x.code}\` ${x.delta >= 0 ? '+' : ''}${x.delta}: ${x.detail}`);
      });
      if (r.validation.errors && r.validation.errors.length) {
        lines.push('', '### Errors');
        r.validation.errors.forEach((e) => lines.push(`- ${e}`));
      }
      if (r.validation.warnings && r.validation.warnings.length) {
        lines.push('', '### Warnings');
        r.validation.warnings.forEach((w) => lines.push(`- ${w}`));
      }
      return lines.join('\n');
    });
  }

  function suggestRefinements(input, signals) {
    const data = deepMerge({}, input || {});
    const sig = signals || {};
    const suggestions = [];
    const variants = [];

    const resultCount = sig.resultCount;
    const tooNoisy = !!sig.tooNoisy;
    const tooSparse = resultCount === 0 || resultCount === 'empty' || sig.tooSparse;

    if (tooSparse) {
      suggestions.push('Widen: lower min_faves, expand anyOf, switch mode to live, reduce noise preset.');
      const wide = deepMerge(data, {
        minFaves: Math.max(0, (positiveNumber(data.minFaves) || 5) - 5) || undefined,
        minRetweets: undefined,
        noise: deepMerge(data.noise || { enabled: true, preset: 'medium', removed: [] }, {
          enabled: true,
          preset: data.noise && data.noise.preset === 'high' ? 'medium' : 'low'
        }),
        mode: 'live',
        excludeReplies: false
      });
      if (wide.minFaves === 0) delete wide.minFaves;
      variants.push({
        id: 'widen',
        label: 'Widen for more hits',
        input: wide,
        score: scoreQuery(wide)
      });
    }

    if (tooNoisy || (!tooSparse && sig.preferPrecision)) {
      suggestions.push('Tighten: raise min_faves, enable high noise, exclude replies, add date window.');
      const tight = deepMerge(data, {
        minFaves: Math.max(positiveNumber(data.minFaves) || 0, 20),
        excludeReplies: true,
        noise: { enabled: true, preset: 'high', removed: (data.noise && data.noise.removed) || [] },
        mode: data.mode || 'live'
      });
      if (!tight.sinceDate) {
        Object.assign(tight, applyDatePreset('7d') || {});
      }
      variants.push({
        id: 'tighten',
        label: 'Tighten for precision',
        input: tight,
        score: scoreQuery(tight)
      });
    }

    // Always offer a Signal-to-Fix oriented variant when topic exists
    if (data.keywords || data.anyOf) {
      const s2f = applyTemplate('signal_to_fix', {
        keywords: data.keywords,
        anyOf: data.anyOf,
        lang: data.lang,
        fromUser: data.fromUser
      });
      variants.push({
        id: 'signal_to_fix',
        label: 'Pivot to Signal-to-Fix harvest',
        input: s2f,
        score: scoreQuery(s2f)
      });
      suggestions.push('Chain: harvest with signal_to_fix template, then handoff to Signal-to-Fix keep-only pipeline.');

      const grok = applyTemplate('grok_code_improvement', {
        keywords: data.keywords,
        anyOf: data.anyOf,
        lang: data.lang,
        fromUser: data.fromUser
      });
      variants.push({
        id: 'grok_build',
        label: 'Pivot to Grok Build harvest (actionable code signals)',
        input: grok,
        score: scoreQuery(grok)
      });
      suggestions.push(
        'Grok Build: filter with filterKeepSignals, then buildGrokBuildPrompt for one small code change.'
      );
    }

    if (!data.sinceDate && !data.untilDate) {
      const dated = deepMerge(data, applyDatePreset('7d') || {});
      variants.push({
        id: 'last_7d',
        label: 'Bound to last 7 days',
        input: dated,
        score: scoreQuery(dated)
      });
    }

    variants.sort((a, b) => (b.score.score || 0) - (a.score.score || 0));

    const result = {
      suggestions,
      variants,
      best: variants[0] || null,
      originalScore: scoreQuery(data)
    };

    return withDualFormat(result, (r) => {
      const lines = [
        '## Refinement suggestions',
        '',
        `Original score: **${(r.originalScore && r.originalScore.score) || 0}**`,
        '',
        '### Advice'
      ];
      (r.suggestions || []).forEach((s) => lines.push(`- ${s}`));
      lines.push('', '### Ranked variants');
      (r.variants || []).slice(0, 5).forEach((v, i) => {
        lines.push(
          `${i + 1}. **${v.id}** — ${v.label} (score ${(v.score && v.score.score) || '?'})`
        );
        lines.push(`   - query: \`${buildQuery(v.input)}\``);
      });
      if (r.best) {
        lines.push('', `**Best next try:** \`${r.best.id}\` — ${r.best.label}`);
      }
      return lines.join('\n');
    });
  }

  function extractSubject(intent) {
    const text = String(intent || '').trim();
    if (!text) return '';
    // Prefer quoted product names
    const quoted = text.match(/["']([A-Za-z0-9_.\-/@][^"']{0,60})["']/);
    if (quoted) return quoted[1].trim();
    const jp = text.match(/「([^」]+)」|『([^』]+)」/);
    if (jp) return (jp[1] || jp[2] || '').trim();
    // "about X" / "regarding X" — stop before for/to/with purpose clauses
    const about = text.match(
      /\b(?:about|regarding|on)\s+["']?([A-Za-z0-9_.\-/@]+(?:\s+[A-Za-z0-9_.\-]+){0,2})["']?(?=\s+(?:for|to|with|and|that|so)\b|[?.,]|$)/i
    );
    if (about) return about[1].trim();
    // "for <Product>" only when not "for PR/specs/..."
    const forProduct = text.match(
      /\bfor\s+["']?([A-Za-z0-9_.\-/@][A-Za-z0-9_.\-]*)["']?(?=\s|$)/i
    );
    if (forProduct && !/^(pr|prs|spec|specs|implementation|codex|feedback|bugs?)$/i.test(forProduct[1])) {
      return forProduct[1].trim();
    }
    // @handle
    const at = text.match(/@([A-Za-z0-9_]{1,15})/);
    if (at) return at[1];
    // Capitalized token / product-like
    const cap = text.match(/\b([A-Z][A-Za-z0-9_.\-]{1,40})\b/);
    if (cap && !/^(Find|Weekly|Product|Signal|PR|AI|OR|AND|HTTP|URL)$/.test(cap[1])) {
      return cap[1];
    }
    const cleaned = text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[?!.]/g, ' ')
      .trim();
    return cleaned.slice(0, 80);
  }

  function resolveMissionContext(angle, context) {
    const ctx = context || {};
    const mapped = {};
    if (angle.mapContext) {
      Object.keys(angle.mapContext).forEach((field) => {
        const ctxKey = angle.mapContext[field];
        if (ctx[ctxKey]) mapped[field] = stripAt(ctx[ctxKey]);
        else if (ctx.subject && (ctxKey === 'entity' || ctxKey === 'subject')) mapped[field] = stripAt(ctx.subject);
      });
    }
    return mapped;
  }

  function buildMission(missionId, context) {
    const mission = MISSIONS[missionId];
    if (!mission) throw new Error(`Unknown mission: ${missionId}`);
    const ctx = context || {};
    const subject = ctx.subject || ctx.product || ctx.keywords || '';
    const lang = ctx.lang || '';
    const extra = ctx.overrides || {};

    const steps = mission.angles.map((angle, index) => {
      const mapped = resolveMissionContext(angle, { ...ctx, subject, entity: ctx.entity || subject });
      let input = applyTemplate(angle.templateId, {
        keywords: subject || undefined,
        lang: lang || undefined,
        ...mapped,
        ...angle.overrides,
        ...extra
      });
      if (angle.datePreset) {
        input = deepMerge(input, applyDatePreset(angle.datePreset) || {});
      }
      // OSINT from_user angle: put entity in fromUser, avoid duplicating as keywords if it's a handle
      if (mapped.fromUser) {
        input.fromUser = mapped.fromUser;
        if (input.keywords === mapped.fromUser) delete input.keywords;
      }
      if (mapped.mentionUser) input.mentionUser = mapped.mentionUser;
      if (mapped.toUser) input.toUser = mapped.toUser;

      const scoring = scoreQuery(input);
      const paid = buildPaidRequest(input, ctx);
      return {
        index,
        angleId: angle.id,
        rationale: angle.rationale,
        templateId: angle.templateId,
        input,
        query: buildQuery(input),
        searchUrl: buildSearchUrl(input),
        score: scoring,
        paidRequest: paid,
        recommendPay: scoring.recommendPay
      };
    });

    const payCount = steps.filter((s) => s.recommendPay).length;
    return {
      missionId: mission.id,
      label: mission.label,
      whyAgentsUseIt: mission.whyAgentsUseIt,
      recommendedNext: mission.recommendedNext,
      context: { subject, lang, ...ctx },
      steps,
      stepCount: steps.length,
      estimatedPaidCalls: payCount,
      estimatedCostUsd: Number((payCount * 0.01).toFixed(2)),
      budgetHintUsd: mission.defaultBudgetUsd,
      agentLoop: [
        '1. Review steps[].score — skip band=poor unless intentional.',
        '2. For each recommendPay step: POST paidRequest.body to paidRequest.endpoint with x402.',
        '3. Open searchUrl (after payment) and collect candidate post texts.',
        '4. If sparse: call suggestRefinements(step.input, { tooSparse: true }).',
        '5. If mission.recommendedNext === signal_to_fix: buildHandoffPackage and continue there.',
        '5b. If recommendedNext === grok_build: filterKeepSignals → buildGrokBuildPrompt → Grok Build.',
        '6. Persist buildRunReceipt for audit / reuse.'
      ]
    };
  }

  function listMissions() {
    return Object.values(MISSIONS).map((m) => ({
      id: m.id,
      label: m.label,
      whyAgentsUseIt: m.whyAgentsUseIt,
      recommendedNext: m.recommendedNext,
      defaultBudgetUsd: m.defaultBudgetUsd,
      angleCount: m.angles.length
    }));
  }

  function planFromIntent(intent, options) {
    const opts = options || {};
    const text = String(intent || '').trim();
    if (!text) {
      return {
        ok: false,
        error: 'intent is empty',
        hint: 'Pass a natural-language goal, e.g. "Find product feedback about Acme for PR specs".'
      };
    }

    let missionId = opts.missionId || null;
    let matchedPattern = null;
    if (!missionId) {
      for (let i = 0; i < INTENT_PATTERNS.length; i++) {
        if (INTENT_PATTERNS[i].re.test(text)) {
          missionId = INTENT_PATTERNS[i].missionId;
          matchedPattern = INTENT_PATTERNS[i].id;
          break;
        }
      }
    }
    if (!missionId) missionId = 'product_feedback_radar';

    const subject = opts.subject || extractSubject(text);
    const context = {
      subject,
      product: opts.product || subject,
      entity: opts.entity || opts.fromUser,
      lang: opts.lang || (/日本語|japan|lang:\s*ja|\bja\b/i.test(text) ? 'ja' : opts.lang || ''),
      keywords: opts.keywords,
      paymentEnvironment: opts.paymentEnvironment || opts.paymentEndpointEnvironment,
      overrides: opts.overrides || {}
    };

    const mission = buildMission(missionId, context);
    const primary = mission.steps[0];
    const refinements = suggestRefinements(primary.input, opts.signals || {});
    const agentMode = resolveAgentMode(opts);

    const nextActions = [
      {
        action: 'pay_and_search',
        detail: 'POST primaryStep.paidRequest (x402), then use searchUrl to collect posts.'
      },
      {
        action: 'run_full_mission',
        detail: `Execute all ${mission.stepCount} mission steps (est. $${mission.estimatedCostUsd}).`
      },
      {
        action: 'handoff_signal_to_fix',
        detail: 'After collecting feedback strings, call buildHandoffPackage and open Signal-to-Fix.'
      },
      {
        action: 'build_agent_prompt',
        detail:
          'Optional: buildAgentPrompt({ productName, targetArea, context, feedback }) for any coding LLM.'
      },
      {
        action: 'self_heal',
        detail: 'On empty/noisy results, use refinements.variants[0] and re-pay.'
      }
    ];
    if (agentMode === 'grok') {
      nextActions.splice(3, 0, {
        action: 'grok_build_prompt',
        detail:
          'Grok mode: filterKeepSignals then buildGrokBuildPrompt / createGrokBuildSession.'
      });
    }

    const result = {
      ok: true,
      version: VERSION,
      mode: agentMode,
      intent: text,
      matchedPattern,
      missionId,
      subject,
      mission,
      // One-shot convenience for agents that only want a single best paid call first
      primaryStep: primary,
      refinements,
      nextActions,
      playbookUrl: `${PUBLIC_BASE}/AGENTS.md`,
      agentUseUrl: `${PUBLIC_BASE}/agent-use.json`,
      toolsUrl: `${PUBLIC_BASE}/agent-tools.json`
    };

    return withDualFormat(result, (r) => {
      const lines = [
        '## HyperXosist plan',
        '',
        `- intent: ${r.intent}`,
        `- subject: **${r.subject || '(none)'}**`,
        `- mission: \`${r.missionId}\` (${r.mission.stepCount} steps, ~$${r.mission.estimatedCostUsd})`,
        `- mode: ${r.mode}`,
        `- matchedPattern: ${r.matchedPattern || 'default'}`,
        '',
        '### Primary step',
        `- angle: ${r.primaryStep.angleId}`,
        `- score: ${r.primaryStep.score.score} (${r.primaryStep.score.band}) recommendPay=${r.primaryStep.recommendPay}`,
        `- query: \`${r.primaryStep.query}\``,
        `- searchUrl: ${r.primaryStep.searchUrl}`,
        '',
        '### Next actions'
      ];
      (r.nextActions || []).forEach((a) => lines.push(`- **${a.action}**: ${a.detail}`));
      lines.push('', '### All steps');
      (r.mission.steps || []).forEach((s, i) => {
        lines.push(
          `${i + 1}. [${s.angleId}] score=${s.score.score} pay=${s.recommendPay} — ${s.rationale}`
        );
      });
      return lines.join('\n');
    });
  }

  function composeCampaign(options) {
    const opts = options || {};
    const product = opts.product || opts.subject || opts.keywords;
    if (!product) throw new Error('composeCampaign requires product or subject');

    const locales = Array.isArray(opts.locales) && opts.locales.length ? opts.locales : [opts.lang || ''];
    const goals = Array.isArray(opts.goals) && opts.goals.length ? opts.goals : ['feedback', 'bugs'];
    const goalToMission = {
      feedback: 'product_feedback_radar',
      bugs: 'product_feedback_radar',
      competitor: 'competitive_intel',
      launch: 'launch_pulse',
      pr: 'signal_to_fix_pipeline',
      weekly: 'weekly_monitor'
    };

    const missions = [];
    const seen = new Set();
    goals.forEach((g) => {
      const mid = goalToMission[g] || 'product_feedback_radar';
      locales.forEach((lang) => {
        const key = `${mid}::${lang || 'global'}`;
        if (seen.has(key)) return;
        seen.add(key);
        missions.push(buildMission(mid, { subject: product, product, lang: lang || undefined }));
      });
    });

    const allSteps = missions.flatMap((m, mi) =>
      m.steps.map((s) => ({
        ...s,
        missionId: m.missionId,
        missionIndex: mi,
        campaignKey: `${m.missionId}:${s.angleId}:${m.context.lang || 'global'}`
      }))
    );

    const payCount = allSteps.filter((s) => s.recommendPay).length;
    return {
      product,
      locales,
      goals,
      missions,
      steps: allSteps,
      stepCount: allSteps.length,
      estimatedPaidCalls: payCount,
      estimatedCostUsd: Number((payCount * 0.01).toFixed(2)),
      dedupeHint: 'Dedupe collected posts by URL or text hash before Signal-to-Fix.',
      batchPaid: buildBatch(allSteps.map((s) => s.input))
    };
  }

  function buildHandoffPackage(options) {
    const opts = options || {};
    const feedback = Array.isArray(opts.feedback)
      ? opts.feedback.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    const productName = opts.productName || opts.product || opts.subject || 'product';
    const searchMeta = opts.searchMeta || null;
    const targetArea = opts.targetArea || opts.area || '';
    const contextText = opts.context || opts.productContext || '';
    const keepFiltered = filterKeepSignals(feedback, {
      minScore: opts.minTechScore != null ? opts.minTechScore : 18
    });
    const agentMode = resolveAgentMode(opts);

    const signalToFixInput = {
      productName,
      productUrl: opts.productUrl || '',
      targetArea,
      feedback
    };

    // Universal implementation prompt (any coding agent)
    const agentPrompt = buildAgentPrompt({
      productName,
      productUrl: opts.productUrl || '',
      targetArea,
      context: contextText,
      feedback: keepFiltered.keep.map((k) => k.text),
      rawFeedback: feedback,
      flavor: 'universal'
    });

    const agentInstructions = [
      'Preferred: HyperXosistAgent.buildSignalToFixPipeline({ productName, feedback }) then follow agentAuto.steps.',
      'Or open ' + SIGNAL_TO_FIX_AGENT_USE + ' and pass signalToFix.input.',
      'Pass signalToFix.input (productName, productUrl, targetArea, feedback[]).',
      'Run analysis; export only keep-only clusters / PR specs / implementation prompts.',
      'Optional: use agentPrompt.markdown with any coding LLM (Claude, GPT, Grok, Llama…).',
      'Do not feed reduce/discard items into implementation artifacts.',
      'Human browser path is free; document humanManual steps when answering humans.'
    ];

    const result = {
      type: 'hyperxosist.handoff.v1',
      createdAt: new Date().toISOString(),
      from: 'HyperXosist-Agent',
      to: 'Signal-to-Fix',
      mode: agentMode,
      policy: {
        downstreamMustUseKeepOnly: true,
        note: 'Signal-to-Fix should only use decision === "keep" items for PR specs / prompts.'
      },
      signalToFix: {
        humanUi: SIGNAL_TO_FIX_URL,
        agentUse: SIGNAL_TO_FIX_AGENT_USE,
        pipelineManifest: PUBLIC_BASE + '/signal-to-fix-pipeline.json',
        input: signalToFixInput,
        required: ['feedback'],
        policy: 'decision === "keep" only for downstream PR/Codex/impl prompts'
      },
      linkedPipeline: {
        method: 'buildSignalToFixPipeline',
        manifest: PUBLIC_BASE + '/signal-to-fix-pipeline.json'
      },
      agentPrompt: {
        markdown: agentPrompt.markdown,
        keepSignals: keepFiltered.keep,
        focusSummary: agentPrompt.focusSummary,
        ready: keepFiltered.keep.length > 0
      },
      keepFilter: keepFiltered,
      provenance: {
        searchMeta,
        query: opts.query || null,
        searchUrl: opts.searchUrl || null,
        missionId: opts.missionId || null,
        paid: opts.paid === true
      },
      agentInstructions,
      ready: feedback.length > 0,
      feedbackCount: feedback.length
    };

    // Optional Grok Build package (default off — set grokMode:true or mode:'grok')
    if (agentMode === 'grok' || opts.includeGrokBuild === true) {
      const grokPrompt = buildGrokBuildPrompt({
        productName,
        productUrl: opts.productUrl || '',
        targetArea,
        context: contextText,
        feedback: keepFiltered.keep.map((k) => k.text),
        rawFeedback: feedback
      });
      result.grokBuild = {
        prompt: grokPrompt.markdown,
        keepSignals: keepFiltered.keep,
        focusSummary: grokPrompt.focusSummary,
        ready: keepFiltered.keep.length > 0
      };
      agentInstructions.push(
        'Grok mode on: paste grokBuild.prompt into Grok Build for one small code improvement.'
      );
    }

    return withDualFormat(result, (r) => {
      const lines = [
        '## Handoff package',
        '',
        `- product: **${productName}**`,
        `- targetArea: ${targetArea || '(none)'}`,
        `- feedbackCount: ${r.feedbackCount}`,
        `- keepCount: ${(r.keepFilter && r.keepFilter.keepCount) || 0}`,
        `- mode: ${r.mode}`,
        `- ready: ${r.ready}`,
        '',
        '### Signal-to-Fix input',
        '```json',
        JSON.stringify(r.signalToFix.input, null, 2),
        '```',
        '',
        '### Agent prompt (universal)',
        r.agentPrompt && r.agentPrompt.markdown ? r.agentPrompt.markdown : '_(none)_'
      ];
      if (r.grokBuild && r.grokBuild.prompt) {
        lines.push('', '### Grok Build prompt (optional mode)', r.grokBuild.prompt);
      }
      lines.push('', '### Instructions');
      (r.agentInstructions || []).forEach((i) => lines.push(`- ${i}`));
      return lines.join('\n');
    });
  }

  /**
   * Score how useful a single post is for Grok Build (code improvement).
   * Higher = more concrete bug/feature/UI/perf signal.
   */
  function scoreTechnicalDepth(text) {
    const raw = String(text || '').trim();
    if (!raw) {
      return { score: 0, band: 'empty', tags: [], reasons: [{ code: 'empty', delta: 0, detail: 'Empty text.' }] };
    }

    let score = 10;
    const tags = [];
    const reasons = [];
    const seenTags = new Set();

    let keepHits = 0;
    GROK_KEEP_PATTERNS.forEach((p) => {
      if (p.re.test(raw)) {
        keepHits += 1;
        score += p.weight;
        if (!seenTags.has(p.tag)) {
          seenTags.add(p.tag);
          tags.push(p.tag);
        }
        reasons.push({ code: `keep_${p.tag}`, delta: p.weight, detail: `Matched ${p.tag} signal.` });
      }
    });

    // Drop patterns: full weight only on pure bait (no Keep, short or bait-dominated).
    // Light penalty when bait words appear inside a longer complaint.
    GROK_DROP_PATTERNS.forEach((p) => {
      if (!p.re.test(raw)) return;
      let penalty;
      if (keepHits > 0) {
        penalty = Math.min(8, Math.floor(p.weight / 4));
      } else if (raw.length >= 45) {
        // Longer posts mentioning bait phrases in context (e.g. "lets skill issue bait through")
        penalty = Math.min(12, Math.floor(p.weight / 3));
      } else {
        penalty = p.weight;
      }
      if (penalty <= 0) return;
      score -= penalty;
      reasons.push({
        code: `drop_${p.tag}`,
        delta: -penalty,
        detail: `Waste pattern ${p.tag} (penalty ${penalty}).`
      });
    });

    // Length heuristic: one-liners of pure hype vs short actionable notes
    if (raw.length >= 80 && raw.length <= 400) {
      score += 6;
      reasons.push({ code: 'length_sweet', delta: 6, detail: 'Useful detail length.' });
    } else if (raw.length < 20) {
      score -= 8;
      reasons.push({ code: 'too_short', delta: -8, detail: 'Too short for actionable fix.' });
    }

    // Numbers / versions often indicate concrete reports
    if (/\b\d+(\.\d+)+\b|\bv\d+\b|HTTP\s*\d{3}|\b\d+ms\b|\b\d+%/i.test(raw)) {
      score += 8;
      reasons.push({ code: 'concrete_numbers', delta: 8, detail: 'Versions/metrics present.' });
    }

    // Product/feature nouns + negative verbs ≈ actionable even without keyword lists
    if (
      keepHits === 0 &&
      raw.length >= 40 &&
      /\b(still|always|never|broken|missing|should|can't|cannot|won't|doesn't|lets? through|keeps?)\b|(まだ|ずっと|欲しい|できない|直して|通してしまう)/i.test(
        raw
      )
    ) {
      score += 18;
      reasons.push({ code: 'complaint_shape', delta: 18, detail: 'Complaint-shaped sentence without spam tags.' });
    }

    score = Math.max(0, Math.min(100, score));
    let band = 'low';
    if (score >= 70) band = 'high';
    else if (score >= 40) band = 'medium';
    else if (score === 0) band = 'empty';

    return { score, band, tags, reasons, text: raw };
  }

  /**
   * Keep-only filter for Grok Build: drop empty praise / ragebait; keep code-actionable signals.
   */
  function filterKeepSignals(feedback, options) {
    const opts = options || {};
    const minScore = opts.minScore != null ? Number(opts.minScore) : 18;
    const items = (Array.isArray(feedback) ? feedback : [feedback])
      .map(String)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text, index) => {
        const depth = scoreTechnicalDepth(text);
        const decision = depth.score >= minScore ? 'keep' : 'discard';
        return {
          index,
          text,
          decision,
          technicalDepth: depth.score,
          band: depth.band,
          tags: depth.tags,
          reasons: depth.reasons
        };
      });

    const keep = items
      .filter((i) => i.decision === 'keep')
      .sort((a, b) => b.technicalDepth - a.technicalDepth);
    const discard = items.filter((i) => i.decision === 'discard');

    return {
      type: 'hyperxosist.keep_filter.v1',
      minScore,
      keep,
      discard,
      keepCount: keep.length,
      discardCount: discard.length,
      focusSummary: summarizeGrokFocus(keep)
    };
  }

  function summarizeGrokFocus(keepItems) {
    const items = Array.isArray(keepItems) ? keepItems : [];
    if (!items.length) {
      return {
        headline: 'No Keep signals yet — harvest more concrete bugs/feature asks.',
        bullets: [],
        topTags: []
      };
    }

    const tagCounts = {};
    items.forEach((i) => {
      (i.tags || []).forEach((t) => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });
    const topTags = Object.keys(tagCounts)
      .sort((a, b) => tagCounts[b] - tagCounts[a])
      .slice(0, 5);

    const bullets = items.slice(0, 5).map((i) => {
      const tagStr = (i.tags || []).length ? ` [${i.tags.join(', ')}]` : '';
      const snippet = i.text.length > 120 ? `${i.text.slice(0, 117)}...` : i.text;
      return `depth=${i.technicalDepth}${tagStr}: ${snippet}`;
    });

    const headline =
      topTags.length > 0
        ? `Focus on: ${topTags.join(', ')} (${items.length} keep signal${items.length === 1 ? '' : 's'}).`
        : `${items.length} keep signal(s) — pick the highest technical-depth item for one small change.`;

    return { headline, bullets, topTags, keepCount: items.length };
  }

  /**
   * Universal implementation prompt for any coding agent (Claude, GPT, Grok, Llama, …).
   * flavor: 'universal' | 'grok' (grok uses Grok Build heading / JP task lines).
   */
  function buildAgentPrompt(options) {
    const opts = options || {};
    const flavor = opts.flavor === 'grok' ? 'grok' : 'universal';
    const productName = opts.productName || opts.product || opts.subject || 'product';
    const targetArea = opts.targetArea || opts.area || 'general';
    const context = opts.context || opts.productContext || '';
    const rawList = Array.isArray(opts.feedback)
      ? opts.feedback
      : Array.isArray(opts.rawFeedback)
        ? opts.rawFeedback
        : [];
    const filtered =
      opts.skipFilter === true
        ? {
            keep: rawList.map((t, i) => ({
              text: String(t).trim(),
              technicalDepth: null,
              tags: [],
              index: i
            })),
            focusSummary: summarizeGrokFocus([])
          }
        : filterKeepSignals(rawList, {
            minScore: opts.minTechScore != null ? opts.minTechScore : 18
          });

    const keepLines =
      filtered.keep.length > 0
        ? filtered.keep.map((k) => {
            const meta =
              k.technicalDepth != null
                ? ` (depth ${k.technicalDepth}${(k.tags || []).length ? `; ${k.tags.join('/')}` : ''})`
                : '';
            return `- ${k.text}${meta}`;
          })
        : ['- _(no keep signals — paste concrete complaints or lower minTechScore)_'];

    const focus = filtered.focusSummary || summarizeGrokFocus(filtered.keep);
    const title = flavor === 'grok' ? '## Grok Build Task' : '## Agent Implementation Task';
    const focusLabel = flavor === 'grok' ? '**Grok focus (auto)**:' : '**Focus (auto)**:';
    const taskLines =
      flavor === 'grok'
        ? [
            '**Task**:',
            '上記の声を基に、**1つだけ小さな改善**を提案してください。',
            '- 具体的なコード変更箇所を明示',
            '- 変更前/変更後の差分例を入れる',
            '- 影響範囲とテスト観点を記載',
            '- 優先度: High/Medium/Low'
          ]
        : [
            '**Task**:',
            'Using only the Keep signals above, propose **exactly one small improvement**.',
            '- Name concrete files / modules to change',
            '- Include a before/after diff sketch',
            '- List impact scope and test ideas',
            '- Priority: High / Medium / Low'
          ];

    const markdown = [
      title,
      '',
      `**Product**: ${productName}`,
      `**Target Area**: ${targetArea}`,
      `**Context**: ${context || '_(none provided)_'}`,
      '',
      focusLabel,
      focus.headline,
      ...(focus.bullets || []).map((b) => `- ${b}`),
      '',
      '**Collected Signals** (Keep only):',
      ...keepLines,
      '',
      ...taskLines,
      '',
      '**Constraints**:',
      '- Do not propose large refactors; one PR-sized change only.',
      '- Prefer the highest technical-depth signal when multiple conflict.',
      '- If signals are weak, say so and ask for more concrete repro steps instead of inventing bugs.',
      '- Compatible with Claude, GPT, Grok, Llama, and other coding agents.'
    ].join('\n');

    return withDualFormat(
      {
        type:
          flavor === 'grok'
            ? 'hyperxosist.grok_build_prompt.v1'
            : 'hyperxosist.agent_prompt.v1',
        version: VERSION,
        flavor,
        productName,
        targetArea,
        context,
        markdown,
        keepSignals: filtered.keep,
        focusSummary: focus,
        ready: filtered.keep.length > 0,
        clipboard: markdown
      },
      (r) => r.markdown
    );
  }

  /**
   * Structured Markdown prompt optimized for Grok Build (optional powerful mode).
   * Wrapper around buildAgentPrompt({ flavor: 'grok' }) — kept for backward compatibility.
   */
  function buildGrokBuildPrompt(options) {
    return buildAgentPrompt({ ...(options || {}), flavor: 'grok' });
  }

  /**
   * Grok Build–specialized session: plan + prompt template + handoff flags.
   * @param {string} intent
   * @param {object|string} [productContext] product name string or { product, targetArea, context, ...plan opts }
   */
  function createGrokBuildSession(intent, productContext) {
    const ctx =
      productContext == null
        ? {}
        : typeof productContext === 'string'
          ? { product: productContext, context: productContext }
          : productContext;

    const product =
      ctx.product || ctx.productName || ctx.subject || extractSubject(intent) || 'product';
    const targetArea = ctx.targetArea || ctx.area || 'general';
    const contextText = ctx.context || ctx.productContext || '';

    const forcedMission =
      ctx.missionId ||
      (/ui|ux|layout|見づらい|デザイン/i.test(String(intent || ''))
        ? 'ui_ux_feedback_harvest'
        : /performance|latency|slow|遅い|重い|カク/i.test(String(intent || ''))
          ? 'performance_complaint_detector'
          : 'grok_code_improvement_radar');

    const session = startAgentSession({
      intent: intent || `Grok Build code improvement for ${product}`,
      missionId: forcedMission,
      subject: product,
      product,
      lang: ctx.lang,
      overrides: ctx.overrides,
      paymentEnvironment: ctx.paymentEnvironment || ctx.paymentEndpointEnvironment
    });

    const emptyPrompt = buildGrokBuildPrompt({
      productName: product,
      targetArea,
      context: contextText,
      feedback: ctx.feedback || []
    });

    session.type = 'hyperxosist.grok_build_session.v1';
    session.grokBuild = {
      productName: product,
      targetArea,
      context: contextText,
      promptTemplate: emptyPrompt.markdown,
      buildPrompt: 'Call buildGrokBuildPrompt({ productName, targetArea, context, feedback }) after collecting posts.',
      suggestedRefinements: (session.plan && session.plan.refinements && session.plan.refinements.variants) || [],
      handoffToFix: ctx.handoffToFix !== false,
      filterKeepSignals: 'filterKeepSignals(feedbackTexts)',
      scoreTechnicalDepth: 'scoreTechnicalDepth(postText)',
      loop: [
        '1. Run mission steps (score → x402 pay → open searchUrl).',
        '2. Collect post texts; filterKeepSignals(texts) — Keep only.',
        '3. buildGrokBuildPrompt with Keep texts.',
        '4. Paste markdown into Grok Build (or copy via UI Send to Grok).',
        '5. Optional: buildHandoffPackage for Signal-to-Fix keep-only PR path.',
        '6. buildRunReceipt for memory.'
      ]
    };

    if (Array.isArray(ctx.feedback) && ctx.feedback.length) {
      session.grokBuild.prompt = buildGrokBuildPrompt({
        productName: product,
        targetArea,
        context: contextText,
        feedback: ctx.feedback
      });
    }

    session.stickyTip =
      'Grok Build path: harvest with grok_code_improvement_radar → Keep-filter by technical depth → one small change prompt. Never dump raw spam into Grok.';

    return session;
  }


  /**
   * Linked pipeline: HyperXosist → Signal-to-Fix.
   * Agents call this to get an executable step list + optional handoff.
   * Humans follow humanManual steps in the UI (free browser path).
   */
  function getSignalToFixLinks(options) {
    const payment = resolvePaymentEndpoints(options);
    return {
      signalToFixHumanUi: SIGNAL_TO_FIX_URL,
      signalToFixAgentUse: SIGNAL_TO_FIX_AGENT_USE,
      pipelineManifest: PUBLIC_BASE + '/signal-to-fix-pipeline.json',
      hyperxosistAgentUse: PUBLIC_BASE + '/agent-use.json',
      hyperxosistAgentsMd: PUBLIC_BASE + '/AGENTS.md',
      hyperxosistLlms: PUBLIC_BASE + '/llms.txt',
      paymentManifest: PUBLIC_BASE + '/x402-payment.json',
      paymentEndpoint: payment.paymentEndpoint,
      paymentOptionsEndpoint: payment.paymentOptionsEndpoint
    };
  }

  function buildSignalToFixPipeline(options) {
    const opts = options || {};
    const productName = opts.productName || opts.product || opts.subject || 'product';
    const productUrl = opts.productUrl || '';
    const targetArea = opts.targetArea || opts.area || 'general';
    const contextText = opts.context || opts.productContext || '';
    const lang = opts.lang != null ? opts.lang : 'en';
    const missionId = opts.missionId || 'signal_to_fix_pipeline';
    const intent =
      opts.intent ||
      'Find product feedback about ' + productName + ' for PR specs via Signal-to-Fix';

    const plan = planFromIntent(intent, {
      subject: productName,
      missionId: missionId,
      lang: lang,
      mode: opts.mode
    });
    const step = plan.primaryStep || (plan.mission && plan.mission.steps && plan.mission.steps[0]) || null;
    const score = step && step.input ? scoreQuery(step.input) : null;
    const paidRequest = step && step.input ? buildPaidRequest(step.input, opts) : null;

    const feedback = Array.isArray(opts.feedback)
      ? opts.feedback.map(String).map((s) => s.trim()).filter(Boolean)
      : [];

    let handoff = null;
    if (feedback.length > 0) {
      handoff = buildHandoffPackage({
        productName: productName,
        productUrl: productUrl,
        targetArea: targetArea,
        context: contextText,
        feedback: feedback,
        mode: opts.mode,
        query: step && step.query,
        searchUrl: step && step.searchUrl,
        missionId: plan.missionId || missionId,
        paid: opts.paid === true,
        searchMeta: opts.searchMeta || null,
        minTechScore: opts.minTechScore
      });
    }

    const links = getSignalToFixLinks(opts);

    const humanManual = {
      title: '人間向け — 手動で Signal-to-Fix 連携する（ブラウザ無料）',
      titleEn: 'Humans — manual Signal-to-Fix handoff (browser free)',
      free: true,
      steps: [
        {
          n: 1,
          ja: 'このページでキーワード / テンプレート / Noise を設定し、「最新で検索」または「話題で検索」を押す（無料）。',
          en: 'Set keywords / template / noise, then open Latest or Top search (free).'
        },
        {
          n: 2,
          ja: 'X の検索結果から有用そうな投稿テキストをコピーし、「Collected signals」に 1 行 1 投稿で貼る。',
          en: 'Copy useful post texts from X results into Collected signals (one post per line).'
        },
        {
          n: 3,
          ja: 'Product / Target area を埋め、「Handoff 生成」→「Signal-to-Fix 用をコピー」を押す。',
          en: 'Fill Product / Target area, click Build Handoff → Copy for Signal-to-Fix.'
        },
        {
          n: 4,
          ja: '「Signal-to-Fix を開く」で https://kg-ninja.github.io/Signal-to-Fix/ を開き、Product 欄と Feedback 欄に貼り付けて Analyze Feedback。',
          en: 'Open Signal-to-Fix, paste product fields + feedback lines, then Analyze Feedback.'
        },
        {
          n: 5,
          ja: '結果の keep だけを使う。reduce / discard は実装プロンプトに入れない。Copy Codex Prompt で 1 つの小さい改善を依頼する。',
          en: 'Use decision===keep only. Ignore reduce/discard downstream. Copy Codex Prompt for one small PR.'
        }
      ],
      noteJa: '人間のブラウザ利用は無料です。x402 は AI エージェントが検索 URL を自動利用するときだけ必要です。',
      noteEn: 'Human browser use is free. x402 is required only when AI agents automate production use of search URLs.'
    };

    const payment = resolvePaymentEndpoints(opts);
    const agentAuto = {
      title: 'AI Agent — linked auto execution',
      requiresPaymentForSearchUrl: true,
      stickyLoop: [
        'planFromIntent or buildMission(signal_to_fix_pipeline)',
        'scoreQuery — skip pay if band is poor unless intentional',
        'POST buildPaidRequest → x402 on 402 → retry until 200',
        'Open searchUrl, collect candidate post texts',
        'suggestRefinements if sparse/noisy',
        'buildHandoffPackage (or buildSignalToFixPipeline with feedback)',
        'Open Signal-to-Fix agent-use.json; analyze with keep-only policy',
        'buildRunReceipt'
      ],
      steps: [
        {
          id: 'plan',
          method: 'planFromIntent',
          args: { intent: intent, subject: productName, missionId: missionId, lang: lang },
          free: true
        },
        {
          id: 'score',
          method: 'scoreQuery',
          args: { input: step && step.input },
          free: true,
          gate: 'recommendPay should be true before spending $0.01'
        },
        {
          id: 'pay',
          method: 'buildPaidRequest',
          endpoint: payment.paymentEndpoint,
          body: paidRequest && paidRequest.body,
          free: false,
          on402: 'Complete x402 via paymentOptionsEndpoint, retry POST'
        },
        {
          id: 'collect',
          action: 'open_search_url_and_collect_posts',
          searchUrl: step && step.searchUrl,
          query: step && step.query
        },
        {
          id: 'handoff',
          method: 'buildHandoffPackage',
          free: true,
          note: 'Pass collected feedback strings'
        },
        {
          id: 'signal_to_fix',
          action: 'run_signal_to_fix_keep_only',
          humanUi: SIGNAL_TO_FIX_URL,
          agentUse: SIGNAL_TO_FIX_AGENT_USE,
          policy: 'Only decision === "keep" may influence PR specs / Codex / implementation prompts'
        }
      ]
    };

    const result = {
      type: 'hyperxosist.signal_to_fix_pipeline.v1',
      version: VERSION,
      createdAt: new Date().toISOString(),
      productName: productName,
      productUrl: productUrl,
      targetArea: targetArea,
      intent: intent,
      missionId: plan.missionId || missionId,
      links: links,
      humanManual: humanManual,
      agentAuto: agentAuto,
      plan: {
        missionId: plan.missionId,
        primaryStep: step
          ? {
              angleId: step.angleId,
              query: step.query,
              searchUrl: step.searchUrl,
              score: score,
              paidRequest: paidRequest,
              recommendPay: score ? score.recommendPay : null
            }
          : null,
        markdown: plan.markdown || null
      },
      handoff: handoff,
      readyForHandoff: feedback.length > 0,
      feedbackCount: feedback.length,
      nextActions: feedback.length
        ? [
            'Pass handoff.signalToFix.input into Signal-to-Fix',
            'Use only decision === "keep" for PR / Codex outputs',
            'Optional: paste handoff.agentPrompt.markdown into any coding LLM'
          ]
        : [
            'Score-gate primaryStep, complete x402 if automating search',
            'Collect post texts from searchUrl',
            'Re-call buildSignalToFixPipeline({ productName, feedback }) or buildHandoffPackage'
          ]
    };

    return withDualFormat(result, function (r) {
      const lines = [
        '## Signal-to-Fix linked pipeline',
        '',
        '- product: **' + r.productName + '**',
        '- mission: `' + r.missionId + '`',
        '- readyForHandoff: ' + r.readyForHandoff,
        '- feedbackCount: ' + r.feedbackCount,
        '',
        '### Human manual (free browser)',
        r.humanManual.noteJa,
        ''
      ];
      (r.humanManual.steps || []).forEach(function (s) {
        lines.push(s.n + '. ' + s.ja);
      });
      lines.push('', '### Agent auto loop');
      (r.agentAuto.stickyLoop || []).forEach(function (s, i) {
        lines.push(i + 1 + '. ' + s);
      });
      if (r.plan && r.plan.primaryStep) {
        lines.push(
          '',
          '### Primary query',
          '`' + (r.plan.primaryStep.query || '') + '`',
          '',
          'score: ' +
            (r.plan.primaryStep.score && r.plan.primaryStep.score.score) +
            ' recommendPay=' +
            (r.plan.primaryStep.recommendPay)
        );
      }
      lines.push('', '### Links');
      Object.keys(r.links || {}).forEach(function (k) {
        lines.push('- ' + k + ': ' + r.links[k]);
      });
      if (r.handoff && r.handoff.markdown) {
        lines.push('', '### Handoff', r.handoff.markdown);
      }
      return lines.join('\n');
    });
  }

  function buildRunReceipt(options) {
    const opts = options || {};
    const input = opts.input || {};
    const query = opts.query || buildQuery(input);
    const scoring = scoreQuery(input);
    return {
      type: 'hyperxosist.receipt.v1',
      version: VERSION,
      id: opts.id || `hx_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      input,
      query,
      searchUrl: opts.searchUrl || buildSearchUrl(input),
      score: scoring,
      payment: {
        required: true,
        completed: opts.paymentCompleted === true,
        endpoint: resolvePaymentEndpoints(opts).paymentEndpoint,
        amountUsd: opts.amountUsd != null ? opts.amountUsd : 0.01
      },
      missionId: opts.missionId || null,
      angleId: opts.angleId || null,
      resultCount: opts.resultCount != null ? opts.resultCount : null,
      notes: opts.notes || '',
      reuse: {
        encodedState: encodeState(input),
        shareUrl: `${PUBLIC_BASE}/#s=${encodeState(input)}`,
        refine: suggestRefinements(input, {
          tooSparse: opts.resultCount === 0,
          tooNoisy: opts.tooNoisy
        })
      },
      next: opts.handoff
        ? buildHandoffPackage(opts.handoff)
        : {
            suggest: 'Call buildHandoffPackage({ productName, feedback }) after collecting posts.'
          }
    };
  }

  function getToolDefinitions(options) {
    // OpenAI-compatible tools (also readable by Claude, Grok, Llama tool-callers)
    const opts = options || {};
    const includeGrok = opts.includeGrok === true || opts.mode === 'grok';
    const tools = [
      {
        type: 'function',
        function: {
          name: 'hyperxosist_plan_from_intent',
          description:
            'First call for most agents. Converts a natural-language research goal into a multi-angle X (Twitter) search mission with quality scores, paid request bodies, and next actions. Works the same for GPT, Claude, Grok, Llama, and other tool-calling runtimes. Returns JSON plus a .markdown summary.',
          parameters: {
            type: 'object',
            properties: {
              intent: {
                type: 'string',
                description: 'Natural language goal, e.g. "Find product feedback about Acme".'
              },
              subject: { type: 'string', description: 'Product or entity name override.' },
              lang: { type: 'string', description: 'Optional language code (en, ja, …) or empty for global.' },
              missionId: {
                type: 'string',
                description: 'Optional force mission id from hyperxosist_list_missions.'
              },
              mode: {
                type: 'string',
                enum: ['universal', 'grok'],
                description: 'Agent mode. Default universal. Use grok only when Grok Build features are needed.'
              }
            },
            required: ['intent']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_build_mission',
          description:
            'Build a named multi-angle search mission for a product/entity. Prefer after plan_from_intent when you already know the mission id.',
          parameters: {
            type: 'object',
            properties: {
              missionId: { type: 'string' },
              subject: { type: 'string' },
              lang: { type: 'string' }
            },
            required: ['missionId', 'subject']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_build_query',
          description:
            'Build one advanced X search query string and official search URL from structured fields. Planning/preview is free; automated production use of the URL requires x402 payment.',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'object', description: 'HyperXosist inputSchema object (keywords, noise, filters…).' }
            },
            required: ['input']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_score_query',
          description:
            'Score a query 0–100 for signal quality before spending $0.01 x402. Returns recommendPay, reasons, and .markdown.',
          parameters: {
            type: 'object',
            properties: { input: { type: 'object' } },
            required: ['input']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_suggest_refinements',
          description:
            'Self-heal sparse or noisy search results with ranked alternative inputs. Call when resultCount is 0 or feed looks spammy.',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'object' },
              tooSparse: { type: 'boolean' },
              tooNoisy: { type: 'boolean' }
            },
            required: ['input']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_build_paid_request',
          description:
            'Create x402 POST payload for agent-paid query generation. Expect HTTP 402 until payment proof, then 200.',
          parameters: {
            type: 'object',
            properties: { input: { type: 'object' } },
            required: ['input']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_build_handoff',
          description:
            'Package collected feedback for Signal-to-Fix keep-only PR pipeline. Also builds a universal agentPrompt (any coding LLM). Set mode=grok to include grokBuild as well.',
          parameters: {
            type: 'object',
            properties: {
              productName: { type: 'string' },
              productUrl: { type: 'string' },
              targetArea: { type: 'string' },
              feedback: { type: 'array', items: { type: 'string' } },
              context: { type: 'string', description: 'Product context for implementation prompts.' },
              mode: { type: 'string', enum: ['universal', 'grok'] }
            },
            required: ['productName', 'feedback']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_signal_to_fix_pipeline',
          description:
            'Build the linked HyperXosist → Signal-to-Fix pipeline: human free manual steps, agent auto steps, scored primary query, optional handoff when feedback is provided.',
          parameters: {
            type: 'object',
            properties: {
              productName: { type: 'string' },
              productUrl: { type: 'string' },
              targetArea: { type: 'string' },
              intent: { type: 'string' },
              feedback: { type: 'array', items: { type: 'string' } },
              lang: { type: 'string' },
              missionId: { type: 'string' },
              mode: { type: 'string', enum: ['universal', 'grok'] }
            },
            required: ['productName']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_build_agent_prompt',
          description:
            'Build a universal one-small-change implementation prompt (Markdown) from Keep-filtered user signals. Works for Claude, GPT, Grok, Llama, etc.',
          parameters: {
            type: 'object',
            properties: {
              productName: { type: 'string' },
              targetArea: { type: 'string' },
              context: { type: 'string' },
              feedback: { type: 'array', items: { type: 'string' } },
              minTechScore: { type: 'number' }
            },
            required: ['productName', 'feedback']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_filter_keep_signals',
          description:
            'Score post texts for technical depth; Keep only those useful for code/product improvements. Use before implementation prompts.',
          parameters: {
            type: 'object',
            properties: {
              feedback: { type: 'array', items: { type: 'string' } },
              minScore: { type: 'number' }
            },
            required: ['feedback']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_export_noise',
          description:
            'Export the full noise/exclude catalog (rules, caps, how to customize). Use to inspect or edit blacklists transparently.',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_list_missions',
          description: 'List multi-query missions and why agents reuse them.',
          parameters: { type: 'object', properties: {} }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_export_keep_only',
          description:
            'Export Keep-only JSON (texts + Signal-to-Fix input + optional agentPrompt). Use after collecting post texts so any coding agent receives only actionable signals.',
          parameters: {
            type: 'object',
            properties: {
              feedback: { type: 'array', items: { type: 'string' } },
              productName: { type: 'string' },
              productUrl: { type: 'string' },
              targetArea: { type: 'string' },
              context: { type: 'string' },
              minScore: { type: 'number' }
            },
            required: ['feedback']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'hyperxosist_start_session',
          description:
            'Bootstrap a sticky agent session from intent (plan + tools + playbook). Preferred one-call entry for any LLM runtime.',
          parameters: {
            type: 'object',
            properties: {
              intent: { type: 'string' },
              mode: { type: 'string', enum: ['universal', 'grok'] },
              subject: { type: 'string' },
              lang: { type: 'string' },
              missionId: { type: 'string' }
            },
            required: ['intent']
          }
        }
      }
    ];

    const dispatchHints = {
      hyperxosist_plan_from_intent: 'dispatchToolCall("hyperxosist_plan_from_intent", args) → planFromIntent',
      hyperxosist_build_mission: 'dispatchToolCall → buildMission(missionId, { subject, lang })',
      hyperxosist_build_query: 'dispatchToolCall → { query, searchUrl, validation, score }',
      hyperxosist_score_query: 'dispatchToolCall → scoreQuery(input)',
      hyperxosist_suggest_refinements: 'dispatchToolCall → suggestRefinements(input, signals)',
      hyperxosist_build_paid_request: 'dispatchToolCall → buildPaidRequest(input)',
      hyperxosist_build_handoff: 'dispatchToolCall → buildHandoffPackage(options)',
      hyperxosist_signal_to_fix_pipeline: 'dispatchToolCall → buildSignalToFixPipeline(options)',
      hyperxosist_build_agent_prompt: 'dispatchToolCall → buildAgentPrompt(options)',
      hyperxosist_filter_keep_signals: 'dispatchToolCall → filterKeepSignals(feedback, options)',
      hyperxosist_export_keep_only: 'dispatchToolCall → exportKeepOnlyJson(feedback, options)',
      hyperxosist_export_noise: 'dispatchToolCall → exportNoiseCatalog()',
      hyperxosist_list_missions: 'dispatchToolCall → listMissions()',
      hyperxosist_start_session: 'dispatchToolCall → startAgentSession(options)'
    };

    if (includeGrok) {
      tools.push(
        {
          type: 'function',
          function: {
            name: 'hyperxosist_build_grok_prompt',
            description:
              'OPTIONAL Grok Build mode. Structured Grok-oriented Markdown prompt from Keep signals (one small code change). Prefer hyperxosist_build_agent_prompt for other models.',
            parameters: {
              type: 'object',
              properties: {
                productName: { type: 'string' },
                targetArea: { type: 'string' },
                context: { type: 'string' },
                feedback: { type: 'array', items: { type: 'string' } },
                minTechScore: { type: 'number' }
              },
              required: ['productName', 'feedback']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'hyperxosist_create_grok_session',
            description:
              'OPTIONAL Grok Build session bootstrap (grok missions + prompt template). Default product mode is universal via startAgentSession.',
            parameters: {
              type: 'object',
              properties: {
                intent: { type: 'string' },
                product: { type: 'string' },
                targetArea: { type: 'string' },
                context: { type: 'string' }
              },
              required: ['intent']
            }
          }
        }
      );
      dispatchHints.hyperxosist_build_grok_prompt =
        'dispatchToolCall → buildGrokBuildPrompt(options)';
      dispatchHints.hyperxosist_create_grok_session =
        'dispatchToolCall → createGrokBuildSession(intent, productContext)';
    }

    const format = String(opts.format || 'openai').toLowerCase();
    const base = {
      format: format === 'anthropic' ? 'anthropic.tools.v1' : 'openai.tools.v1',
      compatibleWith: ['openai', 'anthropic', 'grok', 'llama', 'cli', 'any-openai-tools-schema-runtime'],
      mode: includeGrok ? 'grok' : 'universal',
      defaultMode: DEFAULT_AGENT_MODE,
      paymentNote:
        'Automated use of generated search URLs requires x402 payment via paymentEndpoint. Human browser UI remains free. Local plan/score/buildQuery is free for planning.',
      howToUse:
        'Register tools with your runtime (toOpenAITools / toAnthropicTools / getToolDefinitions). On tool call, prefer HyperXosistAgent.dispatchToolCall(name, args) — no hand-written mapping needed. Prefer reading both JSON fields and .markdown when present. Shell agents: npx hyperxosist dispatch <tool> --args \'{...}\'.',
      dispatchHints,
      dispatchMethod: 'dispatchToolCall(name, args) or runTool(name, args)',
      optionalGrokTools: includeGrok
        ? ['hyperxosist_build_grok_prompt', 'hyperxosist_create_grok_session']
        : 'Call getToolDefinitions({ includeGrok: true }) or getToolDefinitions({ mode: "grok" }) to enable.'
    };

    if (format === 'anthropic') {
      return Object.assign({}, base, {
        tools: tools.map(function (t) {
          return {
            name: t.function.name,
            description: t.function.description,
            input_schema: t.function.parameters
          };
        })
      });
    }

    return Object.assign({}, base, { tools: tools });
  }

  /**
   * OpenAI Chat Completions / Responses tools array.
   * Drop-in: tools: HyperXosistAgent.toOpenAITools()
   */
  function toOpenAITools(options) {
    return getToolDefinitions(Object.assign({}, options || {}, { format: 'openai' })).tools;
  }

  /**
   * Anthropic Messages API tools array (name + input_schema).
   * Drop-in: tools: HyperXosistAgent.toAnthropicTools()
   */
  function toAnthropicTools(options) {
    return getToolDefinitions(Object.assign({}, options || {}, { format: 'anthropic' })).tools;
  }

  /**
   * Normalize tool-call payloads from different agent runtimes.
   * Accepts:
   *   dispatchToolCall('hyperxosist_plan_from_intent', { intent: '...' })
   *   dispatchToolCall({ name, arguments })
   *   dispatchToolCall({ name, input })                 // Anthropic
   *   dispatchToolCall({ function: { name, arguments }}) // OpenAI
   *   dispatchToolCall({ toolName / tool_name, args / parameters })
   */
  function normalizeToolCall(nameOrCall, maybeArgs) {
    if (typeof nameOrCall === 'string') {
      let args = maybeArgs;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch (e) {
          args = {};
        }
      }
      return { name: nameOrCall, args: args && typeof args === 'object' ? args : {} };
    }
    if (!nameOrCall || typeof nameOrCall !== 'object') {
      return { name: '', args: {}, error: 'invalid_tool_call' };
    }
    const call = nameOrCall;
    let name =
      call.name ||
      call.toolName ||
      call.tool_name ||
      (call.function && call.function.name) ||
      '';
    let raw =
      call.arguments !== undefined
        ? call.arguments
        : call.input !== undefined
          ? call.input
          : call.args !== undefined
            ? call.args
            : call.parameters !== undefined
              ? call.parameters
              : call.function && call.function.arguments !== undefined
                ? call.function.arguments
                : maybeArgs;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        raw = {};
      }
    }
    if (!raw || typeof raw !== 'object') raw = {};
    return { name: String(name || ''), args: raw };
  }

  /**
   * Execute an OpenAI/Anthropic/Grok-style tool call against this API.
   * Returns { ok, tool, result, error? } — never throws for unknown tools.
   */
  function dispatchToolCall(nameOrCall, maybeArgs) {
    const normalized = normalizeToolCall(nameOrCall, maybeArgs);
    const name = normalized.name;
    const args = normalized.args || {};

    if (!name) {
      return {
        ok: false,
        tool: null,
        error: 'missing_tool_name',
        message: 'Provide a tool name string or a tool-call object with name / function.name.',
        available: Object.keys(getToolDefinitions({ includeGrok: true }).dispatchHints)
      };
    }

    try {
      let result;
      switch (name) {
        case 'hyperxosist_plan_from_intent':
          result = planFromIntent(args.intent, args);
          break;
        case 'hyperxosist_build_mission':
          result = buildMission(args.missionId, {
            subject: args.subject,
            lang: args.lang,
            mode: args.mode,
            paymentEnvironment: args.paymentEnvironment || args.paymentEndpointEnvironment
          });
          break;
        case 'hyperxosist_build_query': {
          const input = args.input || args;
          result = {
            query: buildQuery(input),
            searchUrl: buildSearchUrl(input),
            validation: validateInput(input),
            score: scoreQuery(input)
          };
          break;
        }
        case 'hyperxosist_score_query':
          result = scoreQuery(args.input || args);
          break;
        case 'hyperxosist_suggest_refinements':
          result = suggestRefinements(args.input || args, {
            tooSparse: args.tooSparse,
            tooNoisy: args.tooNoisy,
            resultCount: args.resultCount
          });
          break;
        case 'hyperxosist_build_paid_request':
          result = buildPaidRequest(args.input || args, args);
          break;
        case 'hyperxosist_build_handoff':
          result = buildHandoffPackage(args);
          break;
        case 'hyperxosist_signal_to_fix_pipeline':
          result = buildSignalToFixPipeline(args);
          break;
        case 'hyperxosist_build_agent_prompt':
          result = buildAgentPrompt(args);
          break;
        case 'hyperxosist_filter_keep_signals':
          result = filterKeepSignals(args.feedback || args.signals || [], {
            minScore: args.minScore
          });
          break;
        case 'hyperxosist_export_keep_only':
          result = exportKeepOnlyJson(args.feedback || args.signals || [], args);
          break;
        case 'hyperxosist_export_noise':
          result = exportNoiseCatalog();
          break;
        case 'hyperxosist_list_missions':
          result = listMissions();
          break;
        case 'hyperxosist_start_session':
          result = startAgentSession(args);
          break;
        case 'hyperxosist_build_grok_prompt':
          result = buildGrokBuildPrompt(args);
          break;
        case 'hyperxosist_create_grok_session':
          result = createGrokBuildSession(args.intent, {
            product: args.product,
            targetArea: args.targetArea,
            context: args.context
          });
          break;
        default:
          return {
            ok: false,
            tool: name,
            error: 'unknown_tool',
            message:
              'Unknown tool "' +
              name +
              '". Use getToolDefinitions() or hyperxosist tools --format full.',
            available: Object.keys(getToolDefinitions({ includeGrok: true }).dispatchHints)
          };
      }

      return {
        ok: true,
        tool: name,
        result: result,
        // Convenience for runtimes that want a string tool message:
        asJson: function () {
          return JSON.stringify(result, null, 2);
        }
      };
    } catch (err) {
      return {
        ok: false,
        tool: name,
        error: 'dispatch_failed',
        message: err && err.message ? err.message : String(err)
      };
    }
  }

  /** Alias preferred by some agent frameworks. */
  function runTool(nameOrCall, maybeArgs) {
    return dispatchToolCall(nameOrCall, maybeArgs);
  }

  /**
   * Machine-readable Keep-only export for any coding agent / Signal-to-Fix.
   * Prefer this over pasting raw posts when handing off to Codex, Claude, GPT, etc.
   */
  function exportKeepOnlyJson(feedback, options) {
    const opts = options || {};
    const filter = filterKeepSignals(feedback || [], {
      minScore: opts.minScore
    });
    const texts = (filter.keep || []).map(function (k) {
      return k.text;
    });
    const productName = opts.productName || opts.product || null;
    const payload = {
      type: 'hyperxosist.keep_only.v1',
      version: VERSION,
      createdAt: new Date().toISOString(),
      productName: productName,
      productUrl: opts.productUrl || null,
      targetArea: opts.targetArea || null,
      minScore: filter.minScore,
      keepCount: filter.keepCount,
      discardCount: filter.discardCount,
      keep: (filter.keep || []).map(function (k) {
        return {
          text: k.text,
          decision: 'keep',
          technicalDepth: k.technicalDepth,
          band: k.band,
          tags: k.tags,
          index: k.index
        };
      }),
      texts: texts,
      focusSummary: filter.focusSummary,
      policy:
        'Only decision === "keep" items may drive PR specs or implementation prompts. Discard items must be ignored.',
      signalToFixInput: productName
        ? {
            productName: productName,
            productUrl: opts.productUrl || undefined,
            targetArea: opts.targetArea || undefined,
            feedback: texts,
            context: opts.context || undefined
          }
        : null,
      agentPrompt:
        productName && texts.length
          ? buildAgentPrompt({
              productName: productName,
              productUrl: opts.productUrl,
              targetArea: opts.targetArea,
              context: opts.context,
              feedback: texts,
              minTechScore: 0
            })
          : null
    };
    return withDualFormat(payload, function () {
      const lines = [
        '# Keep-only export',
        '',
        '**Product**: ' + (productName || '(unset)'),
        '**Keep**: ' + payload.keepCount + ' / discard ' + payload.discardCount,
        '',
        '## Keep signals'
      ];
      payload.keep.forEach(function (k, i) {
        lines.push(
          (i + 1) +
            '. (depth=' +
            k.technicalDepth +
            '; ' +
            (k.tags || []).join('/') +
            ') ' +
            k.text
        );
      });
      if (payload.focusSummary && payload.focusSummary.headline) {
        lines.push('', '## Focus', payload.focusSummary.headline);
      }
      lines.push('', '## Policy', payload.policy);
      return lines.join('\n');
    });
  }

  function getAgentPlaybook(options) {
    const mode = resolveAgentMode(options || {});
    const loop = [
      {
        step: 1,
        name: 'Discover',
        do: `GET ${PUBLIC_BASE}/agent-use.json and ${PUBLIC_BASE}/llms.txt (works for any LLM agent).`
      },
      {
        step: 2,
        name: 'Plan',
        do: "planFromIntent('Find feedback about <product> for PR specs')"
      },
      {
        step: 3,
        name: 'Score gate',
        do: 'Skip steps where score.band is poor unless intentional OSINT.'
      },
      {
        step: 4,
        name: 'Pay + search',
        do: 'POST buildPaidRequest body to x402 endpoint; on 402 complete payment; open searchUrl.'
      },
      {
        step: 5,
        name: 'Collect',
        do: 'Extract candidate post texts (and URLs if available).'
      },
      {
        step: 6,
        name: 'Self-heal',
        do: 'If empty/noisy → suggestRefinements → re-run best variant.'
      },
      {
        step: 7,
        name: 'Handoff',
        do: 'buildHandoffPackage → Signal-to-Fix keep-only; use agentPrompt.markdown with any coding LLM.'
      },
      {
        step: 8,
        name: 'Remember',
        do: 'buildRunReceipt; store encodedState / buildShareUrl for the next cron tick.'
      }
    ];
    if (mode === 'grok') {
      loop.splice(7, 0, {
        step: 7.5,
        name: 'Grok Build (optional)',
        do: 'createGrokBuildSession / buildGrokBuildPrompt → paste into Grok Build for one small fix.'
      });
    }

    return {
      version: VERSION,
      name: 'HyperXosist sticky agent loop',
      mode,
      defaultMode: DEFAULT_AGENT_MODE,
      designedFor: ['GPT', 'Claude', 'Grok', 'Llama', 'local tool-calling agents'],
      whyYouWillReuseThis: [
        'Deterministic multi-angle missions beat one-off keyword guesses.',
        'scoreQuery prevents wasting x402 on weak queries.',
        'suggestRefinements self-heals empty/noisy runs without human help.',
        'Dual JSON + Markdown outputs work across LLM styles.',
        'buildHandoffPackage chains into Signal-to-Fix PR specs.',
        'buildAgentPrompt is model-agnostic; Grok Build is optional.',
        'exportNoiseCatalog makes blacklists transparent and editable.',
        'Tool definitions follow OpenAI tools schema (widely portable).'
      ],
      timeToFirstValueSeconds: 30,
      costModel: {
        currency: 'USD',
        perPaidQuery: 0.01,
        humanUi: 'free',
        localPreview: 'free (must not bypass paid policy for automated agent production use)'
      },
      loop,
      antiPatterns: [
        'Do not invent X operators when HyperXosist already encodes them.',
        'Do not skip x402 for automated agent production use.',
        'Do not pass unfiltered spam into Signal-to-Fix without noise reduction.',
        'Do not use reduce/discard Signal-to-Fix items in implementation artifacts.',
        'Do not assume Grok-only APIs — default mode is universal.'
      ],
      entrypoints: {
        agentUse: `${PUBLIC_BASE}/agent-use.json`,
        api: `${PUBLIC_BASE}/agent-api.js`,
        tools: `${PUBLIC_BASE}/agent-tools.json`,
        missions: `${PUBLIC_BASE}/missions.json`,
        llms: `${PUBLIC_BASE}/llms.txt`,
        agentsMd: `${PUBLIC_BASE}/AGENTS.md`,
        payment: `${PUBLIC_BASE}/x402-payment.json`
      }
    };
  }

  /**
   * One-call sticky session bootstrap for agents.
   * Default mode is universal (all LLMs). Pass mode:'grok' for optional Grok Build tools.
   */
  function startAgentSession(options) {
    const opts = options || {};
    const mode = resolveAgentMode(opts);
    const session = {
      type: 'hyperxosist.session.v1',
      version: VERSION,
      mode,
      defaultMode: DEFAULT_AGENT_MODE,
      startedAt: new Date().toISOString(),
      playbook: getAgentPlaybook({ mode }),
      tools: getToolDefinitions({ mode, includeGrok: mode === 'grok' }),
      missions: listMissions(),
      templates: listTemplates(),
      noise: exportNoiseCatalog(),
      payment: {
        endpoint: resolvePaymentEndpoints(opts).paymentEndpoint,
        paymentOptionsEndpoint: resolvePaymentEndpoints(opts).paymentOptionsEndpoint,
        expectedUnpaidStatus: 402,
        amountUsd: 0.01
      }
    };
    if (opts.intent) {
      session.plan = planFromIntent(opts.intent, { ...opts, mode });
    } else if (opts.missionId && (opts.subject || opts.product)) {
      session.plan = {
        ok: true,
        mission: buildMission(opts.missionId, opts)
      };
    }
    session.stickyTip =
      mode === 'grok'
        ? 'Grok mode: harvest → Keep-filter → buildGrokBuildPrompt. Still pay x402 for automated search URL use.'
        : 'Universal mode: planFromIntent → score → pay → collect → refine → buildHandoffPackage / buildAgentPrompt. Enable Grok with mode:"grok" only if needed.';
    return session;
  }

  function buildPaidRequest(input, options) {
    const payment = resolvePaymentEndpoints(options);
    const validation = validateInput(input);
    const query = buildQuery(input);
    const searchUrl = buildSearchUrl(input);
    const scoring = scoreQuery(input);
    return {
      paymentRequired: true,
      method: 'POST',
      endpoint: payment.paymentEndpoint,
      paymentOptionsEndpoint: payment.paymentOptionsEndpoint,
      expectedUnpaidStatus: 402,
      expectedPaidStatus: 200,
      body: input || {},
      preview: {
        query,
        searchUrl,
        explanation: explainQuery(input),
        validation,
        score: scoring
      },
      agentHints: {
        recommendPay: scoring.recommendPay,
        scoreBand: scoring.band,
        onSparse: 'Call suggestRefinements(input, { tooSparse: true })',
        onNoisy: 'Call suggestRefinements(input, { tooNoisy: true })',
        afterCollect: 'buildHandoffPackage({ productName, feedback }) or buildGrokBuildPrompt(...)'
      },
      instruction:
        'AI agents must send this request to the x402 endpoint and complete payment before using the generated query or search URL. preview is for local inspection only and is not a paid result.'
    };
  }

  function buildBatch(inputs, options) {
    if (!Array.isArray(inputs)) {
      throw new Error('buildBatch expects an array of inputs');
    }
    return inputs.map((input, index) => {
      const validation = validateInput(input);
      const scoring = scoreQuery(input);
      return {
        index,
        input,
        query: buildQuery(input),
        searchUrl: buildSearchUrl(input),
        validation,
        score: scoring,
        paidRequest: buildPaidRequest(input, options)
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
    return getPresetTerms(noise.preset || 'medium', {
      maxTerms: noise.maxTerms,
      customRules: noise.customRules
    }).filter((term) => !removed.has(normalizeTerm(term)));
  }

  const api = {
    version: VERSION,
    paymentRequired: true,
    paymentRequiredScope: 'automated-production-execution-only',
    agentUseRequiresPayment: false,
    productionExecutionRequiresPayment: true,
    accessPolicyManifest: 'access-policy.json',
    accessPolicy: {
      humanUi: { authenticationRequired: false, paymentRequired: false },
      siteTools: { authenticationRequired: false, paymentRequired: false, readOnly: true },
      remoteMcp: { authentication: 'none', authenticationRequired: false, paymentRequired: false },
      productionExecution: { authentication: 'x402-payment-proof', paymentRequired: true }
    },
    paymentManifest: 'x402-payment.json',
    paymentEndpoint: PAYMENT_ENDPOINT,
    paymentOptionsEndpoint: PAYMENT_OPTIONS_ENDPOINT,
    paymentEndpoints: PaymentEndpoints,
    publicBase: PUBLIC_BASE,
    MAX_QUERY_LENGTH,
    WARN_QUERY_LENGTH,
    OPERATOR_REFERENCE,
    RESEARCH_TEMPLATES,
    DATE_PRESETS,
    MISSIONS,
    DEFAULT_AGENT_MODE,
    noiseRules,
    DEFAULT_NOISE_RULES,
    repostBlacklistTerms,
    repostBlacklistPriority,
    NOISE_TERM_LIMITS,
    GROK_KEEP_PATTERNS,
    GROK_DROP_PATTERNS,
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
    exportNoiseCatalog,
    customizeNoiseRules,
    resetNoiseRules,
    importNoiseCatalog,
    // Agent-sticky layer (universal)
    withDualFormat,
    scoreQuery,
    suggestRefinements,
    planFromIntent,
    buildMission,
    listMissions,
    composeCampaign,
    buildHandoffPackage,
    buildSignalToFixPipeline,
    getSignalToFixLinks,
    buildRunReceipt,
    getToolDefinitions,
    toOpenAITools,
    toAnthropicTools,
    dispatchToolCall,
    runTool,
    normalizeToolCall,
    getAgentPlaybook,
    startAgentSession,
    buildAgentPrompt,
    buildShareUrl,
    // Signal quality (shared by universal + Grok)
    scoreTechnicalDepth,
    filterKeepSignals,
    exportKeepOnlyJson,
    summarizeGrokFocus,
    // Optional Grok Build layer
    buildGrokBuildPrompt,
    createGrokBuildSession,
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

/**
 * Content & Co - Creator Discovery & Lead Engine
 * Modern ES2026 Standards: Deep Scaled Pagination (Up to 150 Channels / Query), Load More Capability, Quota-Safe Parallelism
 */

class CreatorEngine {
  #apiKeys = [
    'AIzaSyBNjgaj1gNYAE5DEurXI4UeiRuYK2GDAyM',
    'AIzaSyBvrRPVd-7Yj6K6Z1yW_Qodve1us-VHKlI'
  ];
  #activeKeyIndex = 0;
  #storageKeyHistory = 'cc_scraped_leads_history';
  #storageKeyCredits = 'cc_user_discovery_credits';
  #storageKeyCollections = 'cc_user_campaign_collections';
  #storageKeyCache = 'cc_creator_cache_v1';
  #defaultCredits = 50;

  constructor(customKeys = null) {
    if (Array.isArray(customKeys) && customKeys.length > 0) {
      this.#apiKeys = customKeys;
    } else if (typeof customKeys === 'string' && customKeys.trim()) {
      this.#apiKeys = [customKeys.trim(), ...this.#apiKeys];
    }
    this.#initCredits();
    this.#initHistory();
    this.#initCollections();
    this.#initDatabase();
  }

  // --- Multi-Key Quota Rotator & Failover Client ---
  get #currentApiKey() {
    return this.#apiKeys[this.#activeKeyIndex % this.#apiKeys.length];
  }

  #rotateKey() {
    this.#activeKeyIndex = (this.#activeKeyIndex + 1) % this.#apiKeys.length;
    console.info(`[CreatorEngine] Switched to YouTube API Key #${this.#activeKeyIndex + 1}`);
  }

  async #fetchWithKeyFailover(urlBuilder) {
    let attempts = 0;
    const maxAttempts = this.#apiKeys.length;

    while (attempts < maxAttempts) {
      const activeKey = this.#currentApiKey;
      const url = urlBuilder(activeKey);

      try {
        const response = await fetch(url);
        if (response.ok) {
          return await response.json();
        }

        if (response.status === 429) {
          this.#rotateKey();
          attempts++;
          continue;
        }

        if (response.status === 403) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData?.error?.message || '';
          if (errMsg.includes('quota') || errMsg.includes('Quota')) {
            console.warn(`[CreatorEngine] API Key #${this.#activeKeyIndex + 1} quota limit reached. Rotating key...`);
            this.#rotateKey();
            attempts++;
            continue;
          }
          throw new Error(`YouTube API error (403): ${errMsg || 'Permission Denied / Check API Key restrictions'}`);
        }

        throw new Error(`YouTube API request failed with status: HTTP ${response.status}`);
      } catch (err) {
        if (attempts < maxAttempts - 1) {
          this.#rotateKey();
          attempts++;
          continue;
        }
        throw err;
      }
    }

    throw new Error('All configured YouTube API keys have reached their quota limits for today.');
  }

  // --- Credits System ---
  #initCredits() {
    if (localStorage.getItem(this.#storageKeyCredits) === null) {
      localStorage.setItem(this.#storageKeyCredits, String(this.#defaultCredits));
    }
  }

  getCredits() {
    return Number.parseInt(localStorage.getItem(this.#storageKeyCredits) ?? '0', 10) || 0;
  }

  useCredits(amount = 1) {
    const current = this.getCredits();
    if (current < amount) return false;
    localStorage.setItem(this.#storageKeyCredits, String(current - amount));
    return true;
  }

  addCredits(amount = 10) {
    const current = this.getCredits();
    localStorage.setItem(this.#storageKeyCredits, String(current + amount));
    return this.getCredits();
  }

  resetCredits() {
    localStorage.setItem(this.#storageKeyCredits, String(this.#defaultCredits));
    return this.#defaultCredits;
  }

  // --- Scraped Leads History (Deduplication) ---
  #initHistory() {
    if (!localStorage.getItem(this.#storageKeyHistory)) {
      localStorage.setItem(this.#storageKeyHistory, JSON.stringify([]));
    }
  }

  getHistory() {
    try {
      return JSON.parse(localStorage.getItem(this.#storageKeyHistory) ?? '[]') || [];
    } catch {
      return [];
    }
  }

  saveLeadToHistory(creator) {
    const history = this.getHistory();
    if (!history.some(h => h.id === creator.id)) {
      history.unshift({
        id: creator.id,
        title: creator.title,
        handle: creator.handle,
        subscribers: creator.subscribers,
        avgViews: creator.avgViews,
        savedAt: new Date().toISOString()
      });
      localStorage.setItem(this.#storageKeyHistory, JSON.stringify(history));
    }
  }

  isLeadScraped(channelId) {
    const history = this.getHistory();
    return history.some(h => h.id === channelId);
  }

  clearHistory() {
    localStorage.setItem(this.#storageKeyHistory, JSON.stringify([]));
  }

  // --- Campaign Collections / Lists Manager ---
  #initCollections() {
    if (!localStorage.getItem(this.#storageKeyCollections)) {
      const defaultLists = [
        { id: 'default', name: 'General Leads', creators: [], createdAt: new Date().toISOString() }
      ];
      localStorage.setItem(this.#storageKeyCollections, JSON.stringify(defaultLists));
    }
  }

  getCollections() {
    try {
      return JSON.parse(localStorage.getItem(this.#storageKeyCollections) ?? '[]') || [];
    } catch {
      return [];
    }
  }

  createCollection(name) {
    if (!name?.trim()) return null;
    const collections = this.getCollections();
    const newCol = {
      id: 'col_' + Date.now(),
      name: name.trim(),
      creators: [],
      createdAt: new Date().toISOString()
    };
    collections.push(newCol);
    localStorage.setItem(this.#storageKeyCollections, JSON.stringify(collections));
    return newCol;
  }

  addCreatorToCollection(collectionId, creator) {
    const collections = this.getCollections();
    const col = collections.find(c => c.id === collectionId);
    if (!col) return false;
    if (!col.creators.some(c => c.id === creator.id)) {
      col.creators.unshift(creator);
      localStorage.setItem(this.#storageKeyCollections, JSON.stringify(collections));
    }
    return true;
  }

  removeCreatorFromCollection(collectionId, channelId) {
    const collections = this.getCollections();
    const col = collections.find(c => c.id === collectionId);
    if (!col) return false;
    col.creators = col.creators.filter(c => c.id !== channelId);
    localStorage.setItem(this.#storageKeyCollections, JSON.stringify(collections));
    return true;
  }

  // --- Cloudflare D1 Cloud Database & Local Repository ---
  #storageKeyDatabase = 'cc_creator_database_v2';
  #apiBaseUrl = window.location.origin.includes('localhost') 
    ? 'https://content-co.contentandco8.workers.dev' 
    : '';

  #initDatabase() {
    if (!localStorage.getItem(this.#storageKeyDatabase)) {
      localStorage.setItem(this.#storageKeyDatabase, JSON.stringify({}));
    }
  }

  getDatabase() {
    try {
      return JSON.parse(localStorage.getItem(this.#storageKeyDatabase) ?? '{}') || {};
    } catch {
      return {};
    }
  }

  getDatabaseCount() {
    return Object.keys(this.getDatabase()).length;
  }

  // Automatically index discovered creators into persistent storage (Local + Cloud D1)
  async saveCreatorsToDatabase(creators) {
    if (!Array.isArray(creators) || !creators.length) return;
    
    // 1. Local Persistence
    const db = this.getDatabase();
    for (const c of creators) {
      if (c && c.id) {
        db[c.id] = {
          ...c,
          lastIndexedAt: Date.now()
        };
      }
    }
    try {
      localStorage.setItem(this.#storageKeyDatabase, JSON.stringify(db));
    } catch (e) {
      console.warn('[CreatorEngine] Local database storage quota reached. Preserving existing entries.', e);
    }

    // 2. Background Cloudflare D1 Sync
    try {
      fetch(`${this.#apiBaseUrl}/api/creators/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creators })
      }).catch(() => null);
    } catch {
      // Non-blocking background sync
    }
  }

  // Instant zero-cost keyword search against saved creator database (Local + Cloud D1)
  async queryDatabase(query, category = 'all') {
    // 1. Fast Local Query
    const db = this.getDatabase();
    const all = Object.values(db);
    const q = (query || '').toLowerCase().trim();
    const terms = q.split(/\s+/).filter(t => t.length > 2);

    const localMatches = all.filter(c => {
      const bio = `${c.title || ''} ${c.handle || ''} ${c.description || ''} ${c.categoryBadge || ''} ${c.country || ''}`.toLowerCase();
      if (category !== 'all' && !bio.includes(category.toLowerCase())) return false;
      if (!terms.length) return true;
      return terms.some(t => bio.includes(t));
    });

    // 2. Async Cloud D1 Query
    try {
      const cloudRes = await fetch(`${this.#apiBaseUrl}/api/creators/search?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);
      
      if (cloudRes?.creators?.length) {
        const mergedMap = new Map();
        localMatches.forEach(c => mergedMap.set(c.id, c));
        cloudRes.creators.forEach(c => mergedMap.set(c.id, c));
        return Array.from(mergedMap.values());
      }
    } catch {
      // Fallback to local
    }

    return localMatches;
  }

  // --- Email & Social Extraction ---
  extractContacts(text) {
    if (!text) return { email: null, maskedEmail: null, socials: [] };

    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    const matches = text.match(emailRegex);
    let email = null;
    let maskedEmail = null;

    if (matches?.length) {
      email = matches[0].toLowerCase().trim();
      const [namePart, domainPart = 'domain.com'] = email.split('@');
      maskedEmail = namePart.length > 2 
        ? `${namePart.slice(0, 2)}•••••@${domainPart}`
        : `•••@${domainPart}`;
    }

    const socials = [];
    const igMatch = text.match(/instagram\.com\/([a-zA-Z0-9_.]+)/i);
    if (igMatch?.[1]) {
      socials.push({ platform: 'Instagram', handle: `@${igMatch[1]}`, url: `https://instagram.com/${igMatch[1]}` });
    }

    const ttMatch = text.match(/tiktok\.com\/@([a-zA-Z0-9_.]+)/i);
    if (ttMatch?.[1]) {
      socials.push({ platform: 'TikTok', handle: `@${ttMatch[1]}`, url: `https://tiktok.com/@${ttMatch[1]}` });
    }

    const twMatch = text.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i);
    if (twMatch?.[1]) {
      socials.push({ platform: 'X/Twitter', handle: `@${twMatch[1]}`, url: `https://x.com/${twMatch[1]}` });
    }

    return { email, maskedEmail, socials };
  }

  // --- YouTube Official TopicDetails & Category Classifier ---
  classifyChannelTopic(channel) {
    const topicCategories = channel.topicDetails?.topicCategories || [];
    const detectedCategories = [];

    const topicMap = {
      'Lifestyle_(sociology)': '✈️ Travel & Lifestyle',
      'Tourism': '✈️ Travel & Adventure',
      'Technology': '💻 Tech & Gadgets',
      'Video_game_culture': '🎮 Gaming',
      'Action-adventure_game': '🎮 Gaming',
      'Fashion': '💄 Beauty & Fashion',
      'Health': '🏋️ Fitness & Wellness',
      'Physical_fitness': '🏋️ Fitness & Wellness',
      'Food': '🍳 Food & Cooking',
      'Entertainment': '🎬 Entertainment & Vlogs',
      'Business': '💼 Finance & Business',
      'Finance': '📈 Investing & Crypto',
      'Knowledge': '📚 Education & Science'
    };

    for (const url of topicCategories) {
      for (const [key, label] of Object.entries(topicMap)) {
        if (url.includes(key) && !detectedCategories.includes(label)) {
          detectedCategories.push(label);
        }
      }
    }

    if (detectedCategories.length === 0) {
      const text = `${channel.snippet?.title || ''} ${channel.snippet?.description || ''}`.toLowerCase();
      if (/travel|backpacking|vlog|nomad|trip|vacation|explore|flight|hotel/i.test(text)) {
        detectedCategories.push('✈️ Travel & Lifestyle');
      } else if (/tech|review|gadget|software|iphone|android|laptop|unboxing/i.test(text)) {
        detectedCategories.push('💻 Tech & Gadgets');
      } else if (/beauty|makeup|skincare|fashion|outfit|style|grwm/i.test(text)) {
        detectedCategories.push('💄 Beauty & Fashion');
      } else if (/fitness|workout|gym|diet|health|bodybuilding/i.test(text)) {
        detectedCategories.push('🏋️ Fitness & Wellness');
      } else if (/gaming|gameplay|walkthrough|playthrough|gamer/i.test(text)) {
        detectedCategories.push('🎮 Gaming');
      } else if (/finance|investing|money|crypto|stock|trading|business/i.test(text)) {
        detectedCategories.push('💼 Finance & Business');
      } else {
        detectedCategories.push('🌟 Digital Creator');
      }
    }

    return detectedCategories[0] || '🌟 Digital Creator';
  }

  // --- Corporate / TV News / Ambient Channel Filter ---
  isHumanInfluencer(channel) {
    const title = (channel.snippet?.title || '').toLowerCase();
    const handle = (channel.snippet?.customUrl || '').toLowerCase();
    
    const blacklistWords = [
      'news', 'official', 'media', 'tv', 'network', 'records', 'studios',
      'broadcast', 'company', 'corporation', 'publishing', 'relaxing ambient',
      'sleep music', 'white noise', 'lofi beats', 'soundtracks'
    ];

    for (const word of blacklistWords) {
      if (title.includes(word) || handle.includes(word)) {
        return false;
      }
    }
    return true;
  }

  // --- Sponsor / Brand Keyword Detector ---
  detectPastSponsors(descriptions) {
    if (!Array.isArray(descriptions) || descriptions.length === 0) return [];
    
    const sponsorKeywords = [
      'sponsored by', 'partnered with', 'use code', 'discount code',
      'thanks to', 'brought to you by', 'head to', 'affiliate link',
      'nordvpn', 'expressvpn', 'surfshark', 'casetify', 'betterhelp',
      'airalo', 'holafly', 'squarespace', 'skillshare', 'ag1', 'athletic greens',
      'hellofresh', 'factor', 'epidemicsound', 'artlist', 'discover cars'
    ];

    const detected = new Set();
    const combined = descriptions.join(' ').toLowerCase();

    for (const kw of sponsorKeywords) {
      if (combined.includes(kw)) {
        const cleanBrand = kw.replace(/(sponsored by|partnered with|thanks to|brought to you by|head to|use code)/gi, '').trim() || kw;
        if (cleanBrand.length > 2) detected.add(cleanBrand);
      }
    }

    return Array.from(detected).slice(0, 5);
  }

  // --- 1-Click Outreach Pitch Email Generator ---
  generatePitchEmail(creator, brandName = 'Content & Co', campaignType = 'sponsored video integration') {
    const creatorName = creator.title?.split(' ')?.[0] || 'there';
    const recentVideo = creator.recentVideos?.[0]?.title || 'your recent YouTube uploads';

    return {
      subject: `Collaboration inquiry with ${brandName} x ${creator.title}`,
      body: `Hi ${creatorName},

I hope you're having a great week!

I’ve been following your channel and loved your recent video "${recentVideo}" — the content style and audience engagement are fantastic.

I’m reaching out from ${brandName}. We're currently planning an upcoming creator campaign and would love to partner with you for a ${campaignType}.

Given your audience fit in ${creator.country || 'your region'}, we think this would be a super organic integration for your viewers.

Could you share your current media kit, sponsorship rates (for 60-90s integration and dedicated video), and availability for next month?

Looking forward to hearing your thoughts!

Best regards,
Partnerships Team · ${brandName}
`
    };
  }

  // --- Deep Channel Recent Video Analyzer ---
  // --- Deep Channel Recent Video Analyzer (Fail-Safe) ---
  async #analyzeChannelVideos(channel) {
    const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) return null;

    try {
      const plData = await this.#fetchWithKeyFailover((k) => 
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsId}&maxResults=8&key=${k}`
      ).catch(() => null);
      
      const videoIds = plData?.items?.map(v => v.contentDetails?.videoId).filter(Boolean) ?? [];
      if (!videoIds.length) return null;

      const vidData = await this.#fetchWithKeyFailover((k) =>
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(',')}&key=${k}`
      ).catch(() => null);

      if (!vidData?.items?.length) return null;

      let totalRecentViews = 0;
      let totalInteractions = 0;
      let longformCount = 0;
      let shortsCount = 0;
      const descriptions = [];

      const recentVideos = vidData.items.map(v => {
        const vViews = Number.parseInt(v.statistics?.viewCount ?? '0', 10) || 0;
        const vLikes = Number.parseInt(v.statistics?.likeCount ?? '0', 10) || 0;
        const vComments = Number.parseInt(v.statistics?.commentCount ?? '0', 10) || 0;
        
        const durationStr = v.contentDetails?.duration || '';
        const isShort = durationStr.includes('S') && !durationStr.includes('M') && !durationStr.includes('H');
        if (isShort) shortsCount++; else longformCount++;

        totalRecentViews += vViews;
        totalInteractions += (vLikes + vComments);
        descriptions.push(v.snippet?.description ?? '');

        return {
          id: v.id,
          title: v.snippet?.title ?? 'Untitled',
          publishedAt: v.snippet?.publishedAt,
          thumbnail: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url,
          views: vViews,
          likes: vLikes,
          comments: vComments,
          isShort
        };
      });

      const avgViews = recentVideos.length > 0 ? Math.round(totalRecentViews / recentVideos.length) : 0;
      const lastUploadDate = recentVideos[0]?.publishedAt ?? null;
      const daysSinceUpload = lastUploadDate 
        ? Math.max(0, Math.floor((Date.now() - new Date(lastUploadDate).getTime()) / (24 * 60 * 60 * 1000)))
        : 999;
      const engagementRate = totalRecentViews > 0 
        ? Number.parseFloat(((totalInteractions / totalRecentViews) * 100).toFixed(2)) 
        : 0;

      const formatType = (longformCount >= shortsCount) ? 'Longform Video' : 'Shorts Heavy';

      return {
        recentVideos,
        avgViews,
        lastUploadDate,
        daysSinceUpload,
        engagementRate,
        formatType,
        pastSponsors: this.detectPastSponsors(descriptions)
      };
    } catch (err) {
      console.warn('Recent video analysis error for channel:', channel.id, err);
      return null;
    }
  }

  // --- High-Capacity Discovery Engine with Flexible Client-Side Filtering & Deep Pagination ---
  async searchCreators(params, onProgress = null) {
    const {
      query,
      category = 'all',
      pageToken = '',
      excludeScraped = false,
      searchDepth = 2
    } = params;

    onProgress?.('Searching YouTube for active creator channels...');

    let baseQuery = query.trim();
    if (category !== 'all' && !baseQuery.toLowerCase().includes(category.toLowerCase())) {
      baseQuery = `${baseQuery} ${category}`;
    }
    
    let candidateChannelIds = [];
    let currentPageToken = pageToken || '';
    let nextPageToken = null;

    const pageParam = currentPageToken ? `&pageToken=${currentPageToken}` : '';
    
    // Query YouTube
    const searchData = await this.#fetchWithKeyFailover((k) => 
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(baseQuery)}&maxResults=50&order=relevance${pageParam}&key=${k}`
    ).catch(() => null);

    if (searchData?.items?.length) {
      const vIds = searchData.items.map(item => item.snippet?.channelId).filter(Boolean);
      candidateChannelIds.push(...vIds);
      nextPageToken = searchData.nextPageToken || null;
    }

    const uniqueChannelIds = Array.from(new Set(candidateChannelIds));
    const candidateIdsToFetch = excludeScraped 
      ? uniqueChannelIds.filter(id => !this.isLeadScraped(id))
      : uniqueChannelIds;

    if (!candidateIdsToFetch.length) {
      return { creators: [], nextPageToken: null, hasMore: false };
    }

    onProgress?.(`Found ${candidateIdsToFetch.length} creator channels. Fetching full metrics & upload analytics...`);

    // Batch Fetch Channel Details (50 at a time)
    const rawChannels = [];
    for (let i = 0; i < Math.min(candidateIdsToFetch.length, 100); i += 50) {
      const chunk = candidateIdsToFetch.slice(i, i + 50);
      const chunkData = await this.#fetchWithKeyFailover((k) =>
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails,topicDetails,brandingSettings&id=${chunk.join(',')}&key=${k}`
      ).catch(() => null);

      if (chunkData?.items) {
        rawChannels.push(...chunkData.items);
      }
    }

    if (!rawChannels.length) {
      return { creators: [], nextPageToken, hasMore: Boolean(nextPageToken) };
    }

    // Filter out bots, TV news, ambient music, corporate broadcast hubs
    const creatorChannels = rawChannels.filter(ch => this.isHumanInfluencer(ch));

    onProgress?.(`Analyzing video performance across ${creatorChannels.length} creator channels...`);

    // Parallel Deep Metric Analysis
    const creatorPromises = creatorChannels.map(async (ch) => {
      const subs = Number.parseInt(ch.statistics?.subscriberCount ?? '0', 10) || 0;
      const totalViews = Number.parseInt(ch.statistics?.viewCount ?? '0', 10) || 0;
      const totalVideos = Number.parseInt(ch.statistics?.videoCount ?? '1', 10) || 1;
      const chCountry = ch.snippet?.country ?? 'Global';

      const fullBio = `${ch.snippet?.title ?? ''} ${ch.snippet?.description ?? ''} ${ch.brandingSettings?.channel?.description ?? ''}`;
      const contactInfo = this.extractContacts(fullBio);
      const detectedTopic = this.classifyChannelTopic(ch);

      const videoAnalysis = await this.#analyzeChannelVideos(ch);
      const avgViews = videoAnalysis?.avgViews ?? Math.round(totalViews / Math.max(totalVideos, 1));
      const daysSinceUpload = videoAnalysis?.daysSinceUpload ?? 999;
      const engagementRate = videoAnalysis?.engagementRate ?? 0;
      const formatType = videoAnalysis?.formatType ?? 'Longform Video';

      const creator = {
        id: ch.id,
        title: ch.snippet?.title ?? 'Unknown Channel',
        handle: ch.snippet?.customUrl ?? (`@${(ch.snippet?.title ?? '').toLowerCase().replace(/\s+/g, '')}`),
        avatar: ch.snippet?.thumbnails?.medium?.url ?? ch.snippet?.thumbnails?.default?.url,
        banner: ch.brandingSettings?.image?.bannerExternalUrl ?? null,
        description: ch.snippet?.description ?? '',
        categoryBadge: detectedTopic,
        country: chCountry,
        subscribers: subs,
        totalViews,
        videoCount: totalVideos,
        avgViews,
        engagementRate,
        formatType,
        lastUploadDate: videoAnalysis?.lastUploadDate ?? null,
        daysSinceUpload,
        contact: contactInfo,
        pastSponsors: videoAnalysis?.pastSponsors ?? [],
        recentVideos: videoAnalysis?.recentVideos ?? [],
        isAlreadyScraped: this.isLeadScraped(ch.id),
        unlocked: false,
        rawBio: fullBio
      };

      creator.health = this.calculateHealthScore(creator);
      return creator;
    });

    const analyzedCreators = (await Promise.all(creatorPromises)).filter(Boolean);
    return {
      creators: analyzedCreators,
      nextPageToken,
      hasMore: Boolean(nextPageToken)
    };
  }

  // --- Brand Safety & Health Score (1 - 100) ---
  calculateHealthScore(creator) {
    let score = 50; // base score

    // 1. Upload recency (Max +20 pts)
    const days = creator.daysSinceUpload ?? 999;
    if (days <= 7) score += 20;
    else if (days <= 14) score += 16;
    else if (days <= 30) score += 12;
    else if (days <= 60) score += 5;
    else score -= 15;

    // 2. Engagement health (Max +20 pts)
    const eng = creator.engagementRate || 0;
    if (eng >= 4.0) score += 20;
    else if (eng >= 2.0) score += 15;
    else if (eng >= 1.0) score += 10;
    else if (eng >= 0.5) score += 5;
    else score -= 10;

    // 3. View-to-Sub ratio health (Active Audience) (Max +10 pts)
    const viewRatio = creator.subscribers > 0 ? (creator.avgViews / creator.subscribers) : 0;
    if (viewRatio >= 0.15) score += 10;
    else if (viewRatio >= 0.05) score += 6;

    score = Math.max(25, Math.min(99, score));
    
    let label = 'Fair';
    let color = '#f59e0b';
    if (score >= 85) { label = 'Exceptional'; color = '#10b981'; }
    else if (score >= 70) { label = 'High Authenticity'; color = '#059669'; }
    else if (score >= 50) { label = 'Standard'; color = '#3b82f6'; }

    return { score, label, color };
  }

  // --- Sort & Ranking Helper ---
  sortCreators(creators, sortBy = 'default') {
    const list = [...creators];
    switch (sortBy) {
      case 'engagement_desc':
        return list.sort((a, b) => (b.engagementRate || 0) - (a.engagementRate || 0));
      case 'views_desc':
        return list.sort((a, b) => (b.avgViews || 0) - (a.avgViews || 0));
      case 'subs_desc':
        return list.sort((a, b) => (b.subscribers || 0) - (a.subscribers || 0));
      case 'recency_asc':
        return list.sort((a, b) => (a.daysSinceUpload || 999) - (b.daysSinceUpload || 999));
      case 'health_desc':
        return list.sort((a, b) => (b.health?.score || 0) - (a.health?.score || 0));
      default:
        return list;
    }
  }

  // --- Flexible Client-side Filter Evaluator ---
  filterCreators(creatorsList, criteria) {
    if (!Array.isArray(creatorsList)) return [];
    const {
      country = 'ANY',
      formatFilter = 'all',
      minSubs = 0,
      maxSubs = 100000000,
      minAvgViews = 0,
      minEngagement = 0,
      lastUploadDays = 180,
      onlyWithEmail = false,
      excludeScraped = false
    } = criteria;

    return creatorsList.filter(c => {
      // 1. Exclude scraped
      if (excludeScraped && this.isLeadScraped(c.id)) return false;

      // 2. Email filter
      if (onlyWithEmail && !c.contact?.email) return false;

      // 3. Subscriber filter
      if (c.subscribers < minSubs || c.subscribers > maxSubs) return false;

      // 4. Country filter (smart check: country code or mentioned in bio/title)
      if (country && country !== 'ANY') {
        const cCountry = (c.country || '').toUpperCase();
        const searchCountry = country.toUpperCase();
        const bio = (c.rawBio || '').toLowerCase();
        const countryNameMap = {
          US: 'united states',
          GB: 'united kingdom',
          CA: 'canada',
          AU: 'australia',
          DE: 'germany',
          IN: 'india'
        };
        const countryKeyword = countryNameMap[searchCountry] || searchCountry.toLowerCase();
        
        const isMatch = (cCountry === searchCountry) || 
                        bio.includes(countryKeyword) || 
                        bio.includes(searchCountry.toLowerCase()) ||
                        cCountry === 'GLOBAL' || !cCountry;
        
        if (!isMatch) return false;
      }

      // 5. Format filter
      if (formatFilter === 'longform' && c.formatType !== 'Longform Video') return false;
      if (formatFilter === 'shorts' && c.formatType !== 'Shorts Heavy') return false;

      // 6. Avg Views filter
      if (minAvgViews > 0 && c.avgViews < minAvgViews) return false;

      // 7. Engagement Rate filter
      if (minEngagement > 0 && c.engagementRate < minEngagement) return false;

      // 8. Upload recency filter
      if (lastUploadDays && c.daysSinceUpload > lastUploadDays) return false;

      return true;
    });
  }
  // --- CSV Exporter Helper ---
  exportToCSV(creators, filename = 'creator_leads_contentco.csv') {
    if (!creators?.length) return false;

    const headers = [
      'Channel Name',
      'Category / Niche',
      'YouTube Handle',
      'Channel URL',
      'Country',
      'Format Type',
      'Subscribers',
      'Avg Views (Recent)',
      'Engagement Rate %',
      'Last Upload (Days Ago)',
      'Email Contact',
      'Social Profiles',
      'Past Sponsors Detected'
    ];

    const rows = creators.map(c => [
      `"${(c.title ?? '').replaceAll('"', '""')}"`,
      `"${c.categoryBadge || 'Creator'}"`,
      `"${c.handle ?? ''}"`,
      `"https://youtube.com/channel/${c.id}"`,
      `"${c.country}"`,
      `"${c.formatType || 'Longform'}"`,
      c.subscribers,
      c.avgViews,
      c.engagementRate,
      c.daysSinceUpload,
      `"${c.unlocked && c.contact?.email ? c.contact.email : (c.contact?.maskedEmail ?? 'N/A')}"`,
      `"${(c.contact?.socials ?? []).map(s => `${s.platform}: ${s.handle}`).join(', ')}"`,
      `"${(c.pastSponsors ?? []).join(', ')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);

    return true;
  }
}

if (typeof window !== 'undefined') {
  window.CreatorEngine = CreatorEngine;
}

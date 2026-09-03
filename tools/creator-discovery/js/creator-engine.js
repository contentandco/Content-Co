/**
 * Content & Co - Creator Discovery & Lead Engine
 * Modern ES2026 Standards: Multi-Key API Rotation & Quota Failover, Parallelism, Collections Manager, Lookalike Engine, Pitch Generator
 */

class CreatorEngine {
  #apiKeys = [
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

        // Quota Exceeded (403) or Rate Limited (429) -> Switch to next key
        if (response.status === 403 || response.status === 429) {
          console.warn(`[CreatorEngine] API Key #${this.#activeKeyIndex + 1} quota limit reached. Rotating key...`);
          this.#rotateKey();
          attempts++;
          continue;
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

    throw new Error('All configured YouTube API keys have reached their quota limits for today. (20,000 unit daily pool exhausted)');
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

  // --- Local Cache ---
  getCache() {
    try {
      return JSON.parse(localStorage.getItem(this.#storageKeyCache) ?? '{}') || {};
    } catch {
      return {};
    }
  }

  setCacheItem(channelId, data) {
    const cache = this.getCache();
    cache[channelId] = { data, timestamp: Date.now() };
    try {
      localStorage.setItem(this.#storageKeyCache, JSON.stringify(cache));
    } catch {
      localStorage.removeItem(this.#storageKeyCache);
    }
  }

  // --- Email & Social Extraction ---
  extractContacts(text) {
    if (!text) return { email: null, maskedEmail: null, socials: [] };

    // Standard RFC-compliant email matching
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

    // Social Links / Handles Matching
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
  async #analyzeChannelVideos(channel) {
    const uploadsId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) return null;

    try {
      const plData = await this.#fetchWithKeyFailover((k) => 
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsId}&maxResults=8&key=${k}`
      );
      
      const videoIds = plData.items?.map(v => v.contentDetails?.videoId).filter(Boolean) ?? [];
      if (!videoIds.length) return null;

      const vidData = await this.#fetchWithKeyFailover((k) =>
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(',')}&key=${k}`
      );

      if (!vidData.items?.length) return null;

      let totalRecentViews = 0;
      let totalInteractions = 0;
      let longformCount = 0;
      let shortsCount = 0;
      const descriptions = [];

      const recentVideos = vidData.items.map(v => {
        const vViews = Number.parseInt(v.statistics?.viewCount ?? '0', 10) || 0;
        const vLikes = Number.parseInt(v.statistics?.likeCount ?? '0', 10) || 0;
        const vComments = Number.parseInt(v.statistics?.commentCount ?? '0', 10) || 0;
        
        // Duration parser (PT1M30S etc)
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

  // --- Quota-Safe Batch Discovery Engine with Multi-Key Failover ---
  async searchCreators(params, onProgress = null) {
    const {
      query,
      country,
      formatFilter = 'all',
      minSubs = 0,
      maxSubs = 10000000,
      minAvgViews = 0,
      minEngagement = 0,
      lastUploadDays = 90,
      onlyWithEmail = false,
      excludeScraped = false,
      maxResults = 20
    } = params;

    onProgress?.('Searching YouTube with multi-key pool failover...');

    // 1. Search Channels via YouTube API with Auto Failover
    const searchQuery = country && country !== 'ANY' ? `${query} ${country}` : query;
    const searchData = await this.#fetchWithKeyFailover((k) =>
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(searchQuery)}&maxResults=40&order=relevance&key=${k}`
    );

    if (!searchData.items?.length) return [];

    // Extract unique channel IDs
    const uniqueChannelIds = Array.from(new Set(searchData.items.map(item => item.snippet?.channelId).filter(Boolean)));

    // Filter out already scraped leads if requested
    const candidateChannelIds = excludeScraped 
      ? uniqueChannelIds.filter(id => !this.isLeadScraped(id))
      : uniqueChannelIds;

    if (!candidateChannelIds.length) return [];

    onProgress?.(`Batch fetching metrics for ${candidateChannelIds.length} channels...`);

    // 2. Batch Fetch Channel Details (Up to 50 channels = 1 Quota unit!)
    const channelsData = await this.#fetchWithKeyFailover((k) =>
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails,brandingSettings&id=${candidateChannelIds.slice(0, 50).join(',')}&key=${k}`
    );

    if (!channelsData.items?.length) return [];

    // 3. Pre-filter channels by subscriber tier & country
    const qualifiedChannels = channelsData.items.filter(ch => {
      const subs = Number.parseInt(ch.statistics?.subscriberCount ?? '0', 10) || 0;
      const chCountry = ch.snippet?.country ?? 'Global';

      if (subs < minSubs || subs > maxSubs) return false;
      if (country && country !== 'ANY' && chCountry.toUpperCase() !== country.toUpperCase()) return false;

      const fullBio = `${ch.snippet?.description ?? ''} ${ch.brandingSettings?.channel?.description ?? ''}`;
      const contactInfo = this.extractContacts(fullBio);
      if (onlyWithEmail && !contactInfo.email) return false;

      return true;
    });

    onProgress?.(`Analyzing video performance across ${qualifiedChannels.length} qualified creators in parallel...`);

    // 4. Parallel Analysis using Promise.allSettled
    const analysisPromises = qualifiedChannels.map(async (ch) => {
      const subs = Number.parseInt(ch.statistics?.subscriberCount ?? '0', 10) || 0;
      const totalViews = Number.parseInt(ch.statistics?.viewCount ?? '0', 10) || 0;
      const totalVideos = Number.parseInt(ch.statistics?.videoCount ?? '1', 10) || 1;
      const chCountry = ch.snippet?.country ?? 'Global';

      const fullBio = `${ch.snippet?.description ?? ''} ${ch.brandingSettings?.channel?.description ?? ''}`;
      const contactInfo = this.extractContacts(fullBio);

      const videoAnalysis = await this.#analyzeChannelVideos(ch);
      const avgViews = videoAnalysis?.avgViews ?? Math.round(totalViews / Math.max(totalVideos, 1));
      const daysSinceUpload = videoAnalysis?.daysSinceUpload ?? 999;
      const engagementRate = videoAnalysis?.engagementRate ?? 0;
      const formatType = videoAnalysis?.formatType ?? 'Longform Video';

      // Format Filter check
      if (formatFilter === 'longform' && formatType !== 'Longform Video') return null;
      if (formatFilter === 'shorts' && formatType !== 'Shorts Heavy') return null;

      // Filter verification
      if (daysSinceUpload > lastUploadDays) return null;
      if (avgViews < minAvgViews) return null;
      if (engagementRate < minEngagement) return null;

      const creator = {
        id: ch.id,
        title: ch.snippet?.title ?? 'Unknown Channel',
        handle: ch.snippet?.customUrl ?? (`@${(ch.snippet?.title ?? '').toLowerCase().replace(/\s+/g, '')}`),
        avatar: ch.snippet?.thumbnails?.medium?.url ?? ch.snippet?.thumbnails?.default?.url,
        banner: ch.brandingSettings?.image?.bannerExternalUrl ?? null,
        description: ch.snippet?.description ?? '',
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
        unlocked: false
      };

      this.setCacheItem(ch.id, creator);
      return creator;
    });

    const results = await Promise.allSettled(analysisPromises);
    const creators = results
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
      .slice(0, maxResults);

    return creators;
  }

  // --- CSV Exporter Helper ---
  exportToCSV(creators, filename = 'creator_leads_contentco.csv') {
    if (!creators?.length) return false;

    const headers = [
      'Channel Name',
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

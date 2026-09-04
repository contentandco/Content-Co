/**
 * Content & Co - Cloudflare Worker API & Static Router
 * Connects Cloudflare D1 Database (`env.DB`) with the Creator Discovery Engine
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // --- CORS Headers ---
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. API: Search Creators from Cloudflare D1 Database
    if (url.pathname === '/api/creators/search' && request.method === 'GET') {
      if (!env.DB) {
        return new Response(JSON.stringify({ creators: [], error: 'D1 binding not detected' }), { headers: corsHeaders });
      }

      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const category = (url.searchParams.get('category') || 'all').trim().toLowerCase();

      try {
        let query = 'SELECT * FROM creators';
        const params = [];

        if (q && category !== 'all') {
          query += ' WHERE (LOWER(title) LIKE ? OR LOWER(handle) LIKE ? OR LOWER(description) LIKE ?) AND LOWER(category) LIKE ? ORDER BY subscribers DESC LIMIT 100';
          params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${category}%`);
        } else if (q) {
          query += ' WHERE LOWER(title) LIKE ? OR LOWER(handle) LIKE ? OR LOWER(description) LIKE ? OR LOWER(category) LIKE ? ORDER BY subscribers DESC LIMIT 100';
          params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
        } else {
          query += ' ORDER BY subscribers DESC LIMIT 100';
        }

        const stmt = env.DB.prepare(query);
        const { results } = await (params.length ? stmt.bind(...params).all() : stmt.all());

        // Parse JSON fields
        const creators = (results || []).map(r => ({
          id: r.id,
          title: r.title,
          handle: r.handle,
          avatar: r.avatar,
          banner: r.banner,
          description: r.description,
          categoryBadge: r.category,
          country: r.country,
          subscribers: r.subscribers,
          avgViews: r.avg_views,
          engagementRate: r.engagement_rate,
          formatType: r.format_type,
          contact: {
            email: r.email || null,
            maskedEmail: r.masked_email || null,
            socials: []
          },
          pastSponsors: r.past_sponsors ? JSON.parse(r.past_sponsors) : [],
          recentVideos: r.recent_videos ? JSON.parse(r.recent_videos) : [],
          health: { score: r.health_score || 85, label: 'Verified Lead', color: '#10b981' },
          daysSinceUpload: r.days_since_upload || 0,
          unlocked: false
        }));

        return new Response(JSON.stringify({ creators, count: creators.length }), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ creators: [], error: err.message }), { headers: corsHeaders });
      }
    }

    // 2. API: Batch Save Discovered Creators to Cloudflare D1
    if (url.pathname === '/api/creators/save' && request.method === 'POST') {
      if (!env.DB) {
        return new Response(JSON.stringify({ success: false, error: 'D1 binding not detected' }), { headers: corsHeaders });
      }

      try {
        const body = await request.json();
        const creators = body.creators || [];

        if (!Array.isArray(creators) || !creators.length) {
          return new Response(JSON.stringify({ success: true, count: 0 }), { headers: corsHeaders });
        }

        const insertSql = `
          INSERT INTO creators (
            id, title, handle, avatar, banner, description, category,
            country, subscribers, avg_views, engagement_rate, format_type,
            email, masked_email, past_sponsors, recent_videos, health_score, days_since_upload
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title=excluded.title,
            avatar=excluded.avatar,
            subscribers=excluded.subscribers,
            avg_views=excluded.avg_views,
            engagement_rate=excluded.engagement_rate,
            email=COALESCE(excluded.email, creators.email),
            past_sponsors=excluded.past_sponsors,
            recent_videos=excluded.recent_videos,
            health_score=excluded.health_score,
            days_since_upload=excluded.days_since_upload,
            updated_at=CURRENT_TIMESTAMP;
        `;

        const batch = creators.slice(0, 100).map(c => {
          return env.DB.prepare(insertSql).bind(
            c.id,
            c.title || '',
            c.handle || '',
            c.avatar || '',
            c.banner || '',
            c.description || '',
            c.categoryBadge || 'Creator',
            c.country || 'Global',
            c.subscribers || 0,
            c.avgViews || 0,
            c.engagementRate || 0,
            c.formatType || 'Longform Video',
            c.contact?.email || null,
            c.contact?.maskedEmail || null,
            JSON.stringify(c.pastSponsors || []),
            JSON.stringify(c.recentVideos || []),
            c.health?.score || 80,
            c.daysSinceUpload || 0
          );
        });

        await env.DB.batch(batch);

        return new Response(JSON.stringify({ success: true, count: batch.length }), { headers: corsHeaders });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: err.message }), { headers: corsHeaders });
      }
    }

    // 3. Fallback: Serve Static Assets (HTML, CSS, JS) via Cloudflare Assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};

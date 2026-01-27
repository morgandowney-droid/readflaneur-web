import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Check authentication and admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // Get all paid orders with related data
    const { data: orders, error: ordersError } = await supabase
      .from('ad_orders')
      .select(`
        *,
        ad:ads(headline, neighborhood_id, is_global, neighborhood:neighborhoods(name, city)),
        advertiser:profiles!ad_orders_advertiser_id_fkey(email, full_name)
      `)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false });

    if (ordersError) {
      console.error('Orders error:', ordersError);
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Calculate time period boundaries
    const periods = {
      thisMonth: startOfMonth,
      last3Months: new Date(now.getFullYear(), now.getMonth() - 3, 1),
      last6Months: new Date(now.getFullYear(), now.getMonth() - 6, 1),
      last9Months: new Date(now.getFullYear(), now.getMonth() - 9, 1),
      last12Months: new Date(now.getFullYear(), now.getMonth() - 12, 1),
      last24Months: new Date(now.getFullYear(), now.getMonth() - 24, 1),
    };

    // Calculate revenue by time period
    const revenueByPeriod = {
      thisMonth: 0,
      last3Months: 0,
      last6Months: 0,
      last9Months: 0,
      last12Months: 0,
      last24Months: 0,
      allTime: 0,
    };

    // Revenue by advertiser
    const revenueByAdvertiser: Record<string, { email: string; name: string | null; total: number; orderCount: number }> = {};

    // Revenue by neighborhood
    const revenueByNeighborhood: Record<string, { name: string; city: string; total: number; orderCount: number }> = {};
    let globalRevenue = 0;
    let globalOrderCount = 0;

    // Process orders
    (orders || []).forEach((order: any) => {
      const paidAt = order.paid_at ? new Date(order.paid_at) : null;
      const amount = order.amount_cents || 0;

      // All time
      revenueByPeriod.allTime += amount;

      // Time periods
      if (paidAt) {
        if (paidAt >= periods.thisMonth) revenueByPeriod.thisMonth += amount;
        if (paidAt >= periods.last3Months) revenueByPeriod.last3Months += amount;
        if (paidAt >= periods.last6Months) revenueByPeriod.last6Months += amount;
        if (paidAt >= periods.last9Months) revenueByPeriod.last9Months += amount;
        if (paidAt >= periods.last12Months) revenueByPeriod.last12Months += amount;
        if (paidAt >= periods.last24Months) revenueByPeriod.last24Months += amount;
      }

      // By advertiser
      const advertiserId = order.advertiser_id;
      const advertiserEmail = order.advertiser?.email || 'Unknown';
      const advertiserName = order.advertiser?.full_name || null;

      if (!revenueByAdvertiser[advertiserId]) {
        revenueByAdvertiser[advertiserId] = {
          email: advertiserEmail,
          name: advertiserName,
          total: 0,
          orderCount: 0,
        };
      }
      revenueByAdvertiser[advertiserId].total += amount;
      revenueByAdvertiser[advertiserId].orderCount += 1;

      // By neighborhood
      if (order.ad?.is_global) {
        globalRevenue += amount;
        globalOrderCount += 1;
      } else if (order.ad?.neighborhood_id) {
        const neighborhoodId = order.ad.neighborhood_id;
        const neighborhoodName = order.ad.neighborhood?.name || 'Unknown';
        const neighborhoodCity = order.ad.neighborhood?.city || '';

        if (!revenueByNeighborhood[neighborhoodId]) {
          revenueByNeighborhood[neighborhoodId] = {
            name: neighborhoodName,
            city: neighborhoodCity,
            total: 0,
            orderCount: 0,
          };
        }
        revenueByNeighborhood[neighborhoodId].total += amount;
        revenueByNeighborhood[neighborhoodId].orderCount += 1;
      }
    });

    // Sort advertisers by revenue
    const topAdvertisers = Object.entries(revenueByAdvertiser)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.total - a.total);

    // Sort neighborhoods by revenue
    const topNeighborhoods = Object.entries(revenueByNeighborhood)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.total - a.total);

    // Add global to neighborhoods
    if (globalRevenue > 0) {
      topNeighborhoods.unshift({
        id: 'global',
        name: 'Global (All Neighborhoods)',
        city: '',
        total: globalRevenue,
        orderCount: globalOrderCount,
      });
    }

    // Recent orders for display
    const recentOrders = (orders || []).slice(0, 10).map((order: any) => ({
      id: order.id,
      amount: order.amount_cents,
      paidAt: order.paid_at,
      advertiser: order.advertiser?.email || 'Unknown',
      adHeadline: order.ad?.headline || 'Unknown',
      neighborhood: order.ad?.is_global
        ? 'Global'
        : order.ad?.neighborhood
          ? `${order.ad.neighborhood.name}, ${order.ad.neighborhood.city}`
          : 'Unknown',
    }));

    // Fetch article analytics
    const { data: articles } = await supabase
      .from('articles')
      .select(`
        *,
        neighborhood:neighborhoods(name, city),
        author:profiles(email, full_name)
      `)
      .eq('status', 'published')
      .order('views', { ascending: false })
      .limit(50);

    // Top articles by views
    const topArticles = (articles || []).map((article: any) => ({
      id: article.id,
      headline: article.headline,
      views: article.views || 0,
      neighborhood: article.neighborhood
        ? `${article.neighborhood.name}, ${article.neighborhood.city}`
        : 'Unknown',
      author: article.author?.full_name || article.author?.email || 'Unknown',
      publishedAt: article.published_at || article.created_at,
    }));

    // Views by neighborhood
    const viewsByNeighborhood: Record<string, { name: string; city: string; views: number; articleCount: number }> = {};
    (articles || []).forEach((article: any) => {
      if (article.neighborhood_id && article.neighborhood) {
        if (!viewsByNeighborhood[article.neighborhood_id]) {
          viewsByNeighborhood[article.neighborhood_id] = {
            name: article.neighborhood.name,
            city: article.neighborhood.city,
            views: 0,
            articleCount: 0,
          };
        }
        viewsByNeighborhood[article.neighborhood_id].views += article.views || 0;
        viewsByNeighborhood[article.neighborhood_id].articleCount += 1;
      }
    });

    const neighborhoodViews = Object.entries(viewsByNeighborhood)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.views - a.views);

    // Views by author/journalist
    const viewsByAuthor: Record<string, { name: string; email: string; views: number; articleCount: number }> = {};
    (articles || []).forEach((article: any) => {
      if (article.author_id) {
        if (!viewsByAuthor[article.author_id]) {
          viewsByAuthor[article.author_id] = {
            name: article.author?.full_name || 'Unknown',
            email: article.author?.email || 'Unknown',
            views: 0,
            articleCount: 0,
          };
        }
        viewsByAuthor[article.author_id].views += article.views || 0;
        viewsByAuthor[article.author_id].articleCount += 1;
      }
    });

    const authorViews = Object.entries(viewsByAuthor)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.views - a.views);

    return NextResponse.json({
      // Revenue metrics
      revenueByPeriod,
      topAdvertisers,
      topNeighborhoods,
      recentOrders,
      totalOrders: orders?.length || 0,
      // Article metrics
      topArticles,
      neighborhoodViews,
      authorViews,
    });
  } catch (err) {
    console.error('Analytics API error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

import { supabase } from './supabase';
import {
  Advertiser,
  AdCampaign,
  AdBanner,
  AdPlacement,
  AdCampaignTargeting,
  AdCampaignPlacement,
  AdImpression,
  AdClick,
  CampaignAnalytics,
  DeviceType,
  PageType,
} from '../types/advertising';

// Advertiser Management
export const advertisingStorage = {
  // Advertisers
  async getAdvertisers(): Promise<Advertiser[]> {
    const { data, error } = await supabase
      .from('advertisers')
      .select('*')
      .order('name');

    if (error) throw error;
    return data || [];
  },

  async getAdvertiser(id: string): Promise<Advertiser | null> {
    const { data, error } = await supabase
      .from('advertisers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async createAdvertiser(advertiser: Omit<Advertiser, 'id' | 'created_at' | 'updated_at'>): Promise<Advertiser> {
    const { data, error } = await supabase
      .from('advertisers')
      .insert(advertiser)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateAdvertiser(id: string, updates: Partial<Advertiser>): Promise<Advertiser> {
    const { data, error } = await supabase
      .from('advertisers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteAdvertiser(id: string): Promise<void> {
    const { error } = await supabase
      .from('advertisers')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Campaigns
  async getCampaigns(advertiserId?: string): Promise<AdCampaign[]> {
    let query = supabase
      .from('ad_campaigns')
      .select('*, advertiser:advertisers(*)')
      .order('created_at', { ascending: false });

    if (advertiserId) {
      query = query.eq('advertiser_id', advertiserId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getCampaign(id: string): Promise<AdCampaign | null> {
    const { data, error } = await supabase
      .from('ad_campaigns')
      .select('*, advertiser:advertisers(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async createCampaign(campaign: Omit<AdCampaign, 'id' | 'created_at' | 'updated_at' | 'current_impressions' | 'current_clicks'>): Promise<AdCampaign> {
    const { data, error } = await supabase
      .from('ad_campaigns')
      .insert(campaign)
      .select('*, advertiser:advertisers(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async updateCampaign(id: string, updates: Partial<AdCampaign>): Promise<AdCampaign> {
    const { data, error } = await supabase
      .from('ad_campaigns')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, advertiser:advertisers(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async deleteCampaign(id: string): Promise<void> {
    const { error } = await supabase
      .from('ad_campaigns')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Banners
  async getBanners(campaignId?: string): Promise<AdBanner[]> {
    let query = supabase
      .from('ad_banners')
      .select('*, campaign:ad_campaigns(*, advertiser:advertisers(*))')
      .order('created_at', { ascending: false });

    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async getBanner(id: string): Promise<AdBanner | null> {
    const { data, error } = await supabase
      .from('ad_banners')
      .select('*, campaign:ad_campaigns(*, advertiser:advertisers(*))')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async createBanner(banner: Omit<AdBanner, 'id' | 'created_at' | 'updated_at'>): Promise<AdBanner> {
    const { data, error } = await supabase
      .from('ad_banners')
      .insert(banner)
      .select('*, campaign:ad_campaigns(*, advertiser:advertisers(*))')
      .single();

    if (error) throw error;
    return data;
  },

  async updateBanner(id: string, updates: Partial<AdBanner>): Promise<AdBanner> {
    const { data, error } = await supabase
      .from('ad_banners')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, campaign:ad_campaigns(*, advertiser:advertisers(*))')
      .single();

    if (error) throw error;
    return data;
  },

  async deleteBanner(id: string): Promise<void> {
    const { error } = await supabase
      .from('ad_banners')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Placements
  async getPlacements(): Promise<AdPlacement[]> {
    const { data, error } = await supabase
      .from('ad_placements')
      .select('*')
      .order('page_type');

    if (error) throw error;
    return data || [];
  },

  async getPlacement(id: string): Promise<AdPlacement | null> {
    const { data, error } = await supabase
      .from('ad_placements')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async createPlacement(placement: Omit<AdPlacement, 'id' | 'created_at'>): Promise<AdPlacement> {
    const { data, error } = await supabase
      .from('ad_placements')
      .insert(placement)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updatePlacement(id: string, updates: Partial<AdPlacement>): Promise<AdPlacement> {
    const { data, error } = await supabase
      .from('ad_placements')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deletePlacement(id: string): Promise<void> {
    const { error } = await supabase
      .from('ad_placements')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Campaign Targeting
  async getCampaignTargeting(campaignId: string): Promise<AdCampaignTargeting[]> {
    const { data, error } = await supabase
      .from('ad_campaign_targeting')
      .select('*')
      .eq('campaign_id', campaignId);

    if (error) throw error;
    return data || [];
  },

  async addCampaignTargeting(targeting: Omit<AdCampaignTargeting, 'id' | 'created_at'>): Promise<AdCampaignTargeting> {
    const { data, error } = await supabase
      .from('ad_campaign_targeting')
      .insert(targeting)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async removeCampaignTargeting(id: string): Promise<void> {
    const { error } = await supabase
      .from('ad_campaign_targeting')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Campaign Placements
  async getCampaignPlacements(campaignId: string): Promise<AdCampaignPlacement[]> {
    const { data, error } = await supabase
      .from('ad_campaign_placements')
      .select('*, placement:ad_placements(*)')
      .eq('campaign_id', campaignId);

    if (error) throw error;
    return data || [];
  },

  async addCampaignPlacement(
    campaignId: string,
    placementId: string,
    weight: number = 1
  ): Promise<AdCampaignPlacement> {
    const { data, error } = await supabase
      .from('ad_campaign_placements')
      .insert({ campaign_id: campaignId, placement_id: placementId, weight })
      .select('*, placement:ad_placements(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async updateCampaignPlacementWeight(id: string, weight: number): Promise<AdCampaignPlacement> {
    const { data, error } = await supabase
      .from('ad_campaign_placements')
      .update({ weight })
      .eq('id', id)
      .select('*, placement:ad_placements(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async removeCampaignPlacement(id: string): Promise<void> {
    const { error } = await supabase
      .from('ad_campaign_placements')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Get placement by position and page type
  async getPlacementByPosition(
    pageType: PageType,
    position: string
  ): Promise<AdPlacement | null> {
    const { data, error } = await supabase
      .from('ad_placements')
      .select('*')
      .eq('page_type', pageType)
      .eq('position', position)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching placement by position:', error);
      return null;
    }

    return data;
  },

  // Get ads for display (with targeting)
  async getAdsForPlacement(
    placementId: string,
    context: {
      pageType: PageType;
      state?: string;
      clubId?: string;
      deviceType?: DeviceType;
      userId?: string;
    }
  ): Promise<AdBanner[]> {
    // Get placement details
    const { data: placement } = await supabase
      .from('ad_placements')
      .select('*')
      .eq('id', placementId)
      .eq('is_active', true)
      .single();

    if (!placement) return [];

    // Get campaigns for this placement
    const { data: campaignPlacements } = await supabase
      .from('ad_campaign_placements')
      .select(`
        *,
        campaign:ad_campaigns(
          *,
          banners:ad_banners(*),
          targeting:ad_campaign_targeting(*)
        )
      `)
      .eq('placement_id', placementId);

    if (!campaignPlacements || campaignPlacements.length === 0) return [];

    // Filter campaigns by targeting and active status
    const eligibleCampaigns = campaignPlacements.filter((cp: any) => {
      const campaign = cp.campaign;

      // Check if campaign is active and within date range
      if (!campaign.is_active) return false;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Compare dates only (not time) for start/end date checks
      if (campaign.start_date) {
        const startDate = new Date(campaign.start_date);
        const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        if (startDateOnly > today) return false;
      }

      if (campaign.end_date) {
        const endDate = new Date(campaign.end_date);
        const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        if (endDateOnly < today) return false;
      }

      // Check budget limits
      if (campaign.budget_impressions && campaign.current_impressions >= campaign.budget_impressions) return false;
      if (campaign.budget_clicks && campaign.current_clicks >= campaign.budget_clicks) return false;

      // Check targeting
      const targeting = campaign.targeting || [];
      if (targeting.length === 0) return true; // No targeting = show to everyone

      return targeting.some((t: AdCampaignTargeting) => {
        switch (t.target_type) {
          case 'state':
            return context.state === t.target_value;
          case 'club':
            return context.clubId === t.target_value;
          case 'device':
            return context.deviceType === t.target_value;
          case 'page_type':
            return context.pageType === t.target_value;
          default:
            return true;
        }
      });
    });

    // Get all banners from eligible campaigns
    const allBanners: AdBanner[] = [];
    eligibleCampaigns.forEach((cp: any) => {
      const campaign = cp.campaign;
      const banners = campaign.banners || [];
      banners.forEach((banner: AdBanner) => {
        if (banner.is_active) {
          // Check size matches placement
          if (
            (banner.size_width === placement.size_width || !banner.size_width) &&
            (banner.size_height === placement.size_height || !banner.size_height)
          ) {
            allBanners.push(banner);
          }
        }
      });
    });

    // Sort by campaign priority and randomize within same priority
    return allBanners.sort((a: any, b: any) => {
      const priorityA = eligibleCampaigns.find((cp: any) => cp.campaign.id === a.campaign_id)?.campaign.priority || 5;
      const priorityB = eligibleCampaigns.find((cp: any) => cp.campaign.id === b.campaign_id)?.campaign.priority || 5;

      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Higher priority first
      }
      return Math.random() - 0.5; // Random within same priority
    });
  },

  // Track impression
  async trackImpression(
    bannerId: string,
    campaignId: string,
    placementId: string,
    context: {
      userId?: string;
      clubId?: string;
      state?: string;
      deviceType?: DeviceType;
      pageUrl?: string;
      userAgent?: string;
      ipAddress?: string;
      sessionId?: string;
    }
  ): Promise<AdImpression> {
    const { data, error } = await supabase
      .from('ad_impressions')
      .insert({
        banner_id: bannerId,
        campaign_id: campaignId,
        placement_id: placementId,
        user_id: context.userId,
        club_id: context.clubId,
        state: context.state,
        device_type: context.deviceType,
        page_url: context.pageUrl,
        user_agent: context.userAgent,
        ip_address: context.ipAddress,
        session_id: context.sessionId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Track click
  async trackClick(
    bannerId: string,
    campaignId: string,
    placementId: string,
    context: {
      impressionId?: string;
      userId?: string;
      clubId?: string;
      state?: string;
      deviceType?: DeviceType;
      pageUrl?: string;
    }
  ): Promise<AdClick> {
    const { data, error } = await supabase
      .from('ad_clicks')
      .insert({
        banner_id: bannerId,
        campaign_id: campaignId,
        placement_id: placementId,
        impression_id: context.impressionId,
        user_id: context.userId,
        club_id: context.clubId,
        state: context.state,
        device_type: context.deviceType,
        page_url: context.pageUrl,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Analytics
  async getCampaignAnalytics(
    campaignId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CampaignAnalytics | null> {
    // Get campaign details
    const { data: campaign } = await supabase
      .from('ad_campaigns')
      .select('*, advertiser:advertisers(*)')
      .eq('id', campaignId)
      .single();

    if (!campaign) return null;

    // Build date filter
    let impressionsQuery = supabase
      .from('ad_impressions')
      .select('*')
      .eq('campaign_id', campaignId);

    let clicksQuery = supabase
      .from('ad_clicks')
      .select('*')
      .eq('campaign_id', campaignId);

    if (startDate) {
      impressionsQuery = impressionsQuery.gte('viewed_at', startDate);
      clicksQuery = clicksQuery.gte('clicked_at', startDate);
    }

    if (endDate) {
      impressionsQuery = impressionsQuery.lte('viewed_at', endDate);
      clicksQuery = clicksQuery.lte('clicked_at', endDate);
    }

    const [{ data: impressions }, { data: clicks }] = await Promise.all([
      impressionsQuery,
      clicksQuery,
    ]);

    const totalImpressions = impressions?.length || 0;
    const totalClicks = clicks?.length || 0;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    // Calculate cost
    let totalCost = 0;
    if (campaign.pricing_model === 'flat_rate') {
      totalCost = campaign.flat_rate_amount || 0;
    } else if (campaign.pricing_model === 'cpm') {
      totalCost = (totalImpressions / 1000) * (campaign.cpm_rate || 0);
    }

    const avgCpm = totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0;

    // Group impressions by date
    const impressionsByDate = (impressions || []).reduce((acc: any[], imp) => {
      const date = new Date(imp.viewed_at).toISOString().split('T')[0];
      const existing = acc.find((item) => item.date === date);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ date, count: 1 });
      }
      return acc;
    }, []);

    // Group clicks by date
    const clicksByDate = (clicks || []).reduce((acc: any[], click) => {
      const date = new Date(click.clicked_at).toISOString().split('T')[0];
      const existing = acc.find((item) => item.date === date);
      if (existing) {
        existing.count++;
      } else {
        acc.push({ date, count: 1 });
      }
      return acc;
    }, []);

    // Group by state
    const impressionsByState = (impressions || [])
      .filter((imp) => imp.state)
      .reduce((acc: any[], imp) => {
        const existing = acc.find((item) => item.state === imp.state);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ state: imp.state, count: 1 });
        }
        return acc;
      }, [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Group by device
    const impressionsByDevice = (impressions || [])
      .filter((imp) => imp.device_type)
      .reduce((acc: any[], imp) => {
        const existing = acc.find((item) => item.device === imp.device_type);
        if (existing) {
          existing.count++;
        } else {
          acc.push({ device: imp.device_type, count: 1 });
        }
        return acc;
      }, []);

    // Top placements
    const { data: placements } = await supabase.from('ad_placements').select('*');

    const topPlacements = (impressions || [])
      .filter((imp) => imp.placement_id)
      .reduce((acc: any[], imp) => {
        const existing = acc.find((item) => item.placement_id === imp.placement_id);
        if (existing) {
          existing.impressions++;
        } else {
          const placement = placements?.find((p) => p.id === imp.placement_id);
          acc.push({
            placement_id: imp.placement_id,
            placement_name: placement?.name || 'Unknown',
            impressions: 1,
            clicks: 0,
          });
        }
        return acc;
      }, []);

    // Add clicks to placements
    (clicks || []).forEach((click) => {
      const placement = topPlacements.find((p) => p.placement_id === click.placement_id);
      if (placement) {
        placement.clicks++;
      }
    });

    topPlacements.sort((a, b) => b.impressions - a.impressions);

    return {
      campaign_id: campaignId,
      campaign_name: campaign.name,
      advertiser_name: campaign.advertiser?.name || 'Unknown',
      total_impressions: totalImpressions,
      total_clicks: totalClicks,
      ctr,
      total_cost: totalCost,
      avg_cpm: avgCpm,
      impressions_by_date: impressionsByDate,
      clicks_by_date: clicksByDate,
      impressions_by_state: impressionsByState,
      impressions_by_device: impressionsByDevice,
      top_placements: topPlacements.slice(0, 10),
    };
  },

  async uploadBannerImage(file: File): Promise<string> {
    const { compressImage } = await import('./imageCompression');
    const compressed = await compressImage(file, 'banner');

    const fileExt = compressed.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('ad-banners')
      .upload(filePath, compressed);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from('ad-banners').getPublicUrl(filePath);

    return data.publicUrl;
  },

  // Delete banner image
  async deleteBannerImage(url: string): Promise<void> {
    const path = url.split('/ad-banners/').pop();
    if (!path) return;

    const { error } = await supabase.storage.from('ad-banners').remove([path]);

    if (error) throw error;
  },

  // Get active banners for a placement
  async getActiveBannersForPlacement(
    position: string,
    pageType: PageType
  ): Promise<AdBanner[]> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const { data, error } = await supabase
      .from('ad_banners')
      .select(`
        *,
        campaign:ad_campaigns!inner(
          id,
          name,
          is_active,
          start_date,
          end_date,
          position,
          placements:ad_campaign_placements!inner(
            placement:ad_placements!inner(
              id,
              position,
              page_type
            )
          )
        )
      `)
      .eq('is_active', true)
      .eq('campaign.is_active', true)
      .eq('campaign.placements.placement.position', position)
      .eq('campaign.placements.placement.page_type', pageType)
      .lte('campaign.start_date', today.toISOString())
      .or(`end_date.is.null,end_date.gte.${today.toISOString()}`, { foreignTable: 'campaign' });

    if (error) {
      console.error('Error fetching active banners for placement:', error);
      return [];
    }

    return data || [];
  },

  // Get placements for a banner
  async getPlacementsForBanner(bannerId: string): Promise<AdPlacement[]> {
    const { data: banner, error: bannerError } = await supabase
      .from('ad_banners')
      .select('campaign_id')
      .eq('id', bannerId)
      .single();

    if (bannerError || !banner) return [];

    const { data, error } = await supabase
      .from('ad_placements')
      .select(`
        *,
        campaign_placements:ad_campaign_placements!inner(
          campaign_id
        )
      `)
      .eq('campaign_placements.campaign_id', banner.campaign_id)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching placements for banner:', error);
      return [];
    }

    return data || [];
  },
};

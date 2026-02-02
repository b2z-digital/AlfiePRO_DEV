export interface Advertiser {
  id: string;
  name: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  website_url?: string;
  logo_url?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdCampaign {
  id: string;
  advertiser_id: string;
  name: string;
  description?: string;
  pricing_model: 'flat_rate' | 'cpm';
  flat_rate_amount?: number;
  cpm_rate?: number;
  budget_impressions?: number;
  budget_clicks?: number;
  current_impressions: number;
  current_clicks: number;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
  advertiser?: Advertiser;
}

export type AdType = 'image' | 'html5' | 'adsense' | 'text';

export interface AdBanner {
  id: string;
  campaign_id: string;
  name: string;
  ad_type: AdType;
  image_url?: string;
  html_content?: string;
  adsense_code?: string;
  text_content?: {
    headline: string;
    body: string;
    cta: string;
  };
  link_url?: string;
  size_width?: number;
  size_height?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  campaign?: AdCampaign;
}

export type PageType =
  | 'event_calendar'
  | 'media'
  | 'yacht_classes'
  | 'alfie_tv'
  | 'my_garage'
  | 'weather'
  | 'news'
  | 'results'
  | 'all';

export type AdPosition = 'header' | 'sidebar' | 'inline' | 'footer' | 'hero';

export interface AdPlacement {
  id: string;
  name: string;
  description?: string;
  page_type: PageType;
  position: AdPosition;
  size_width: number;
  size_height: number;
  is_active: boolean;
  created_at: string;
}

export type TargetType = 'state' | 'club' | 'membership_tier' | 'device' | 'page_type';

export interface AdCampaignTargeting {
  id: string;
  campaign_id: string;
  target_type: TargetType;
  target_value: string;
  created_at: string;
}

export interface AdCampaignPlacement {
  id: string;
  campaign_id: string;
  placement_id: string;
  weight: number;
  created_at: string;
  placement?: AdPlacement;
}

export type DeviceType = 'desktop' | 'mobile' | 'tablet';

export interface AdImpression {
  id: string;
  banner_id: string;
  campaign_id: string;
  placement_id?: string;
  user_id?: string;
  club_id?: string;
  state?: string;
  device_type?: DeviceType;
  page_url?: string;
  user_agent?: string;
  ip_address?: string;
  session_id?: string;
  viewed_at: string;
}

export interface AdClick {
  id: string;
  banner_id: string;
  campaign_id: string;
  placement_id?: string;
  impression_id?: string;
  user_id?: string;
  club_id?: string;
  state?: string;
  device_type?: DeviceType;
  page_url?: string;
  clicked_at: string;
}

export interface CampaignAnalytics {
  campaign_id: string;
  campaign_name: string;
  advertiser_name: string;
  total_impressions: number;
  total_clicks: number;
  ctr: number;
  total_cost: number;
  avg_cpm: number;
  impressions_by_date: { date: string; count: number }[];
  clicks_by_date: { date: string; count: number }[];
  impressions_by_state: { state: string; count: number }[];
  impressions_by_device: { device: string; count: number }[];
  top_placements: { placement_name: string; impressions: number; clicks: number }[];
}

export interface AdPlacementWithCampaigns extends AdPlacement {
  campaigns?: (AdCampaignPlacement & { campaign: AdCampaign })[];
}

export interface CampaignFormData {
  advertiser_id: string;
  name: string;
  description?: string;
  pricing_model: 'flat_rate' | 'cpm';
  flat_rate_amount?: number;
  cpm_rate?: number;
  budget_impressions?: number;
  budget_clicks?: number;
  start_date?: string;
  end_date?: string;
  priority: number;
  targeting: AdCampaignTargeting[];
  placements: string[];
}

export interface BannerFormData {
  campaign_id: string;
  name: string;
  ad_type: AdType;
  image_url?: string;
  html_content?: string;
  adsense_code?: string;
  text_content?: {
    headline: string;
    body: string;
    cta: string;
  };
  link_url?: string;
  size_width?: number;
  size_height?: number;
}

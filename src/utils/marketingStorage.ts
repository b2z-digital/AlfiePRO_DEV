import { supabase } from './supabase';
import type {
  MarketingCampaign,
  MarketingCampaignContent,
  MarketingEmailTemplate,
  MarketingSubscriberList,
  MarketingListMember,
  MarketingAutomationFlow,
  MarketingFlowStep,
  MarketingFlowConnection,
  MarketingTemplateCategory,
  MarketingRecipient,
  MarketingEvent,
  CampaignAnalytics,
  FlowAnalytics,
  MarketingOverviewStats
} from '../types/marketing';

// =====================================================
// CAMPAIGNS
// =====================================================

export async function getMarketingCampaigns(clubId: string): Promise<MarketingCampaign[]> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getMarketingCampaign(id: string): Promise<MarketingCampaign | null> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createMarketingCampaign(campaign: Partial<MarketingCampaign>): Promise<MarketingCampaign> {
  const { data: user } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert({
      ...campaign,
      created_by: user.user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMarketingCampaign(id: string, updates: Partial<MarketingCampaign>): Promise<MarketingCampaign> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMarketingCampaign(id: string): Promise<void> {
  const { error } = await supabase
    .from('marketing_campaigns')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// =====================================================
// CAMPAIGN CONTENT
// =====================================================

export async function getCampaignContent(campaignId: string): Promise<MarketingCampaignContent | null> {
  const { data, error } = await supabase
    .from('marketing_campaign_content')
    .select('*')
    .eq('campaign_id', campaignId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveCampaignContent(content: Partial<MarketingCampaignContent>): Promise<MarketingCampaignContent> {
  const { data, error } = await supabase
    .from('marketing_campaign_content')
    .upsert(content, {
      onConflict: 'campaign_id'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// =====================================================
// TEMPLATES
// =====================================================

export async function getMarketingTemplateCategories(): Promise<MarketingTemplateCategory[]> {
  const { data, error } = await supabase
    .from('marketing_template_categories')
    .select('*')
    .order('display_order');

  if (error) throw error;
  return data || [];
}

export async function getMarketingEmailTemplates(clubId?: string): Promise<MarketingEmailTemplate[]> {
  let query = supabase
    .from('marketing_email_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (clubId) {
    query = query.or(`club_id.eq.${clubId},is_public.eq.true,is_official.eq.true`);
  } else {
    query = query.or('is_public.eq.true,is_official.eq.true');
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function getMarketingEmailTemplate(id: string): Promise<MarketingEmailTemplate | null> {
  const { data, error } = await supabase
    .from('marketing_email_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createMarketingEmailTemplate(template: Partial<MarketingEmailTemplate>): Promise<MarketingEmailTemplate> {
  const { data: user } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('marketing_email_templates')
    .insert({
      ...template,
      created_by: user.user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMarketingEmailTemplate(id: string, updates: Partial<MarketingEmailTemplate>): Promise<MarketingEmailTemplate> {
  const { data, error } = await supabase
    .from('marketing_email_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMarketingEmailTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('marketing_email_templates')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// =====================================================
// SUBSCRIBER LISTS
// =====================================================

export async function ensureClubMembersList(clubId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('marketing_subscriber_lists')
    .select('id')
    .eq('club_id', clubId)
    .eq('list_type', 'all_members')
    .maybeSingle();

  if (!existing) {
    const { error: rpcError } = await supabase.rpc('ensure_all_members_list', { p_club_id: clubId });
    if (rpcError) {
      console.error('Error ensuring Club Members list via RPC:', rpcError);
    }
  }
}

export async function getMarketingSubscriberLists(clubId: string): Promise<MarketingSubscriberList[]> {
  const { data, error } = await supabase
    .from('marketing_subscriber_lists')
    .select('*')
    .eq('club_id', clubId)
    .order('name');

  if (error) throw error;
  return data || [];
}

export async function getMarketingSubscriberList(id: string): Promise<MarketingSubscriberList | null> {
  const { data, error } = await supabase
    .from('marketing_subscriber_lists')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createMarketingSubscriberList(list: Partial<MarketingSubscriberList>): Promise<MarketingSubscriberList> {
  const { data: user } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('marketing_subscriber_lists')
    .insert({
      ...list,
      created_by: user.user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMarketingSubscriberList(id: string, updates: Partial<MarketingSubscriberList>): Promise<MarketingSubscriberList> {
  const { data, error } = await supabase
    .from('marketing_subscriber_lists')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMarketingSubscriberList(id: string): Promise<void> {
  const { error } = await supabase
    .from('marketing_subscriber_lists')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// =====================================================
// LIST MEMBERS
// =====================================================

export async function getListMembers(listId: string): Promise<MarketingListMember[]> {
  const { data, error } = await supabase
    .from('marketing_list_members')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addListMember(member: Partial<MarketingListMember>): Promise<MarketingListMember> {
  const { data, error } = await supabase
    .from('marketing_list_members')
    .insert(member)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addListMembers(members: Partial<MarketingListMember>[]): Promise<MarketingListMember[]> {
  const { data, error } = await supabase
    .from('marketing_list_members')
    .insert(members)
    .select();

  if (error) throw error;
  return data || [];
}

export async function removeListMember(id: string): Promise<void> {
  const { error } = await supabase
    .from('marketing_list_members')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// =====================================================
// AUTOMATION FLOWS
// =====================================================

export async function getMarketingAutomationFlows(clubId: string): Promise<MarketingAutomationFlow[]> {
  const { data, error } = await supabase
    .from('marketing_automation_flows')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getMarketingAutomationFlow(id: string): Promise<MarketingAutomationFlow | null> {
  const { data, error } = await supabase
    .from('marketing_automation_flows')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createMarketingAutomationFlow(flow: Partial<MarketingAutomationFlow>): Promise<MarketingAutomationFlow> {
  const { data: user } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('marketing_automation_flows')
    .insert({
      ...flow,
      created_by: user.user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateMarketingAutomationFlow(id: string, updates: Partial<MarketingAutomationFlow>): Promise<MarketingAutomationFlow> {
  const { data, error } = await supabase
    .from('marketing_automation_flows')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMarketingAutomationFlow(id: string): Promise<void> {
  const { error } = await supabase
    .from('marketing_automation_flows')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// =====================================================
// FLOW STEPS
// =====================================================

export async function getFlowSteps(flowId: string): Promise<MarketingFlowStep[]> {
  const { data, error } = await supabase
    .from('marketing_flow_steps')
    .select('*')
    .eq('flow_id', flowId)
    .order('created_at');

  if (error) throw error;
  return data || [];
}

export async function createFlowStep(step: Partial<MarketingFlowStep>): Promise<MarketingFlowStep> {
  const { data, error } = await supabase
    .from('marketing_flow_steps')
    .insert(step)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateFlowStep(id: string, updates: Partial<MarketingFlowStep>): Promise<MarketingFlowStep> {
  const { data, error } = await supabase
    .from('marketing_flow_steps')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFlowStep(id: string): Promise<void> {
  const { error } = await supabase
    .from('marketing_flow_steps')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// =====================================================
// FLOW CONNECTIONS
// =====================================================

export async function getFlowConnections(flowId: string): Promise<MarketingFlowConnection[]> {
  const { data, error } = await supabase
    .from('marketing_flow_connections')
    .select('*')
    .eq('flow_id', flowId);

  if (error) throw error;
  return data || [];
}

export async function createFlowConnection(connection: Partial<MarketingFlowConnection>): Promise<MarketingFlowConnection> {
  const { data, error } = await supabase
    .from('marketing_flow_connections')
    .insert(connection)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteFlowConnection(id: string): Promise<void> {
  const { error } = await supabase
    .from('marketing_flow_connections')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// =====================================================
// ANALYTICS
// =====================================================

export async function getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  const campaign = await getMarketingCampaign(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const open_rate = campaign.total_delivered > 0
    ? (campaign.total_opened / campaign.total_delivered) * 100
    : 0;

  const click_rate = campaign.total_delivered > 0
    ? (campaign.total_clicked / campaign.total_delivered) * 100
    : 0;

  const bounce_rate = campaign.total_sent > 0
    ? (campaign.total_bounced / campaign.total_sent) * 100
    : 0;

  const unsubscribe_rate = campaign.total_delivered > 0
    ? (campaign.total_unsubscribed / campaign.total_delivered) * 100
    : 0;

  const click_to_open_rate = campaign.total_opened > 0
    ? (campaign.total_clicked / campaign.total_opened) * 100
    : 0;

  return {
    campaign_id: campaignId,
    sent: campaign.total_sent,
    delivered: campaign.total_delivered,
    opened: campaign.total_opened,
    clicked: campaign.total_clicked,
    bounced: campaign.total_bounced,
    unsubscribed: campaign.total_unsubscribed,
    open_rate,
    click_rate,
    bounce_rate,
    unsubscribe_rate,
    click_to_open_rate
  };
}

export async function getMarketingOverviewStats(clubId: string): Promise<MarketingOverviewStats> {
  const [campaigns, flows, lists] = await Promise.all([
    getMarketingCampaigns(clubId),
    getMarketingAutomationFlows(clubId),
    getMarketingSubscriberLists(clubId)
  ]);

  const recentCampaigns = campaigns.slice(0, 5);
  const activeFlows = flows.filter(f => f.status === 'active');
  const recentFlows = flows.slice(0, 5);

  const totalSubscribers = lists.reduce((sum, list) => sum + list.subscriber_count, 0);

  // Calculate period stats from recent campaigns (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentSentCampaigns = campaigns.filter(c =>
    c.sent_at && new Date(c.sent_at) >= thirtyDaysAgo
  );

  const period_stats = {
    sent: recentSentCampaigns.reduce((sum, c) => sum + c.total_sent, 0),
    delivered: recentSentCampaigns.reduce((sum, c) => sum + c.total_delivered, 0),
    opened: recentSentCampaigns.reduce((sum, c) => sum + c.total_opened, 0),
    clicked: recentSentCampaigns.reduce((sum, c) => sum + c.total_clicked, 0),
    avg_open_rate: 0,
    avg_click_rate: 0
  };

  if (period_stats.delivered > 0) {
    period_stats.avg_open_rate = (period_stats.opened / period_stats.delivered) * 100;
    period_stats.avg_click_rate = (period_stats.clicked / period_stats.delivered) * 100;
  }

  return {
    total_campaigns: campaigns.length,
    active_flows: activeFlows.length,
    total_subscribers: totalSubscribers,
    recent_campaigns: recentCampaigns,
    recent_flows: recentFlows,
    period_stats
  };
}

// =====================================================
// RECIPIENTS & EVENTS
// =====================================================

export async function getCampaignRecipients(campaignId: string, limit = 100): Promise<MarketingRecipient[]> {
  const { data, error } = await supabase
    .from('marketing_recipients')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getCampaignEvents(campaignId: string, limit = 100): Promise<MarketingEvent[]> {
  const { data, error} = await supabase
    .from('marketing_events')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// =====================================================
// MARKETING PREFERENCES
// =====================================================

export async function getMemberMarketingPreference(email: string): Promise<any> {
  const { data, error } = await supabase
    .from('marketing_preferences')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateMemberMarketingPreference(
  email: string,
  unsubscribedMarketing: boolean
): Promise<any> {
  // Use the security definer function to bypass RLS restrictions
  const { data, error } = await supabase.rpc('upsert_marketing_preference', {
    p_email: email,
    p_unsubscribed_marketing: unsubscribedMarketing
  });

  if (error) throw error;
  return data || { email, unsubscribed_marketing: unsubscribedMarketing };
}

export async function getBulkMemberMarketingPreferences(emails: string[]): Promise<Record<string, boolean>> {
  if (emails.length === 0) return {};

  // Use the security definer function to bypass RLS restrictions
  const { data, error } = await supabase.rpc('get_bulk_marketing_preferences', {
    p_emails: emails
  });

  if (error) throw error;

  const preferences: Record<string, boolean> = {};
  if (data) {
    data.forEach((pref: { email: string; unsubscribed_marketing: boolean }) => {
      preferences[pref.email] = pref.unsubscribed_marketing || false;
    });
  }
  return preferences;
}

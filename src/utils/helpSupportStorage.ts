import { supabase } from './supabase';
import type {
  SupportFaqCategory,
  SupportFaq,
  SupportTutorialGroup,
  SupportTutorial,
  SupportTicket,
  SupportTicketMessage,
  SupportTicketActivity,
  SupportCannedResponse,
  SupportAnalytics,
} from '../types/helpSupport';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const faqStorage = {
  async getCategories(): Promise<SupportFaqCategory[]> {
    const { data, error } = await supabase
      .from('support_faq_categories')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createCategory(category: Partial<SupportFaqCategory>): Promise<SupportFaqCategory> {
    const { data, error } = await supabase
      .from('support_faq_categories')
      .insert([{
        ...category,
        slug: slugify(category.name || 'category'),
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateCategory(id: string, updates: Partial<SupportFaqCategory>): Promise<SupportFaqCategory> {
    const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
    if (updates.name) payload.slug = slugify(updates.name);
    const { data, error } = await supabase
      .from('support_faq_categories')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteCategory(id: string): Promise<void> {
    const { error } = await supabase.from('support_faq_categories').delete().eq('id', id);
    if (error) throw error;
  },

  async getFaqs(categoryId?: string): Promise<SupportFaq[]> {
    let query = supabase
      .from('support_faqs')
      .select('*, category:support_faq_categories(*)')
      .order('sort_order', { ascending: true });
    if (categoryId) query = query.eq('category_id', categoryId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((item: any) => ({
      ...item,
      category: item.category || undefined,
    }));
  },

  async createFaq(faq: Partial<SupportFaq>): Promise<SupportFaq> {
    const { data, error } = await supabase
      .from('support_faqs')
      .insert([faq])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateFaq(id: string, updates: Partial<SupportFaq>): Promise<SupportFaq> {
    const { data, error } = await supabase
      .from('support_faqs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteFaq(id: string): Promise<void> {
    const { error } = await supabase.from('support_faqs').delete().eq('id', id);
    if (error) throw error;
  },

  async incrementViewCount(faqId: string): Promise<void> {
    await supabase.rpc('increment_faq_view_count', { faq_id: faqId });
  },

  async markHelpful(faqId: string, helpful: boolean): Promise<void> {
    if (helpful) {
      await supabase.from('support_faqs').update({
        helpful_count: supabase.rpc('increment_faq_view_count', { faq_id: faqId }) as any,
      });
      await supabase.rpc('increment_faq_view_count', { faq_id: faqId });
    }
    const faq = await supabase.from('support_faqs').select('helpful_count, not_helpful_count').eq('id', faqId).maybeSingle();
    if (faq.data) {
      const field = helpful ? 'helpful_count' : 'not_helpful_count';
      await supabase.from('support_faqs').update({
        [field]: (faq.data as any)[field] + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', faqId);
    }
  },
};

export const tutorialStorage = {
  async getGroups(): Promise<SupportTutorialGroup[]> {
    const { data, error } = await supabase
      .from('support_tutorial_groups')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async createGroup(group: Partial<SupportTutorialGroup>): Promise<SupportTutorialGroup> {
    const { data, error } = await supabase
      .from('support_tutorial_groups')
      .insert([{
        ...group,
        slug: slugify(group.name || 'group'),
      }])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateGroup(id: string, updates: Partial<SupportTutorialGroup>): Promise<SupportTutorialGroup> {
    const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
    if (updates.name) payload.slug = slugify(updates.name);
    const { data, error } = await supabase
      .from('support_tutorial_groups')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteGroup(id: string): Promise<void> {
    const { error } = await supabase.from('support_tutorial_groups').delete().eq('id', id);
    if (error) throw error;
  },

  async getTutorials(groupId?: string): Promise<SupportTutorial[]> {
    let query = supabase
      .from('support_tutorials')
      .select('*, group:support_tutorial_groups(*)')
      .order('sort_order', { ascending: true });
    if (groupId) query = query.eq('group_id', groupId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((item: any) => ({
      ...item,
      group: item.group || undefined,
    }));
  },

  async createTutorial(tutorial: Partial<SupportTutorial>): Promise<SupportTutorial> {
    const { data, error } = await supabase
      .from('support_tutorials')
      .insert([tutorial])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateTutorial(id: string, updates: Partial<SupportTutorial>): Promise<SupportTutorial> {
    const { data, error } = await supabase
      .from('support_tutorials')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteTutorial(id: string): Promise<void> {
    const { error } = await supabase.from('support_tutorials').delete().eq('id', id);
    if (error) throw error;
  },

  async incrementViewCount(tutorialId: string): Promise<void> {
    await supabase.rpc('increment_tutorial_view_count', { tutorial_id: tutorialId });
  },

  extractYouTubeId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  },
};

export const ticketStorage = {
  async getTickets(filters?: {
    status?: string;
    priority?: string;
    category?: string;
    assignedTo?: string;
    search?: string;
  }): Promise<SupportTicket[]> {
    let query = supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.priority) query = query.eq('priority', filters.priority);
    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo);
    if (filters?.search) {
      query = query.or(`subject.ilike.%${filters.search}%,ticket_number.ilike.%${filters.search}%,reporter_name.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getTicket(id: string): Promise<SupportTicket | null> {
    const { data, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async createTicket(ticket: Partial<SupportTicket>): Promise<SupportTicket> {
    const { data, error } = await supabase
      .from('support_tickets')
      .insert([ticket])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateTicket(id: string, updates: Partial<SupportTicket>, actorId?: string, actorName?: string): Promise<SupportTicket> {
    const currentTicket = await this.getTicket(id);

    const { data, error } = await supabase
      .from('support_tickets')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;

    if (actorId && currentTicket) {
      const changes: { action: string; old_value: string | null; new_value: string | null }[] = [];
      if (updates.status && updates.status !== currentTicket.status) {
        changes.push({ action: 'status_changed', old_value: currentTicket.status, new_value: updates.status });
      }
      if (updates.priority && updates.priority !== currentTicket.priority) {
        changes.push({ action: 'priority_changed', old_value: currentTicket.priority, new_value: updates.priority });
      }
      if (updates.assigned_to && updates.assigned_to !== currentTicket.assigned_to) {
        changes.push({ action: 'assigned', old_value: currentTicket.assigned_to_name || null, new_value: updates.assigned_to_name || null });
      }

      for (const change of changes) {
        await supabase.from('support_ticket_activity_log').insert([{
          ticket_id: id,
          actor_id: actorId,
          actor_name: actorName || '',
          ...change,
        }]);
      }
    }

    return data;
  },

  async getMessages(ticketId: string): Promise<SupportTicketMessage[]> {
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async addMessage(message: Partial<SupportTicketMessage>): Promise<SupportTicketMessage> {
    const { data, error } = await supabase
      .from('support_ticket_messages')
      .insert([message])
      .select()
      .single();
    if (error) throw error;

    if (message.sender_role === 'agent' || message.is_from_admin) {
      const ticket = await this.getTicket(message.ticket_id!);
      if (ticket && !ticket.first_response_at) {
        await supabase.from('support_tickets').update({
          first_response_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', message.ticket_id);
      }
    }

    return data;
  },

  async getActivityLog(ticketId: string): Promise<SupportTicketActivity[]> {
    const { data, error } = await supabase
      .from('support_ticket_activity_log')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getAnalytics(): Promise<SupportAnalytics> {
    const { data: tickets, error } = await supabase
      .from('support_tickets')
      .select('status, priority, category, created_at, resolved_at, first_response_at, satisfaction_rating');
    if (error) throw error;

    const all = tickets || [];
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let totalResolutionMs = 0;
    let resolutionCount = 0;
    let totalFirstResponseMs = 0;
    let firstResponseCount = 0;
    let satisfactionSum = 0;
    let satisfactionCount = 0;

    for (const t of all) {
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;

      if (t.resolved_at) {
        totalResolutionMs += new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime();
        resolutionCount++;
      }
      if (t.first_response_at) {
        totalFirstResponseMs += new Date(t.first_response_at).getTime() - new Date(t.created_at).getTime();
        firstResponseCount++;
      }
      if (t.satisfaction_rating) {
        satisfactionSum += t.satisfaction_rating;
        satisfactionCount++;
      }
    }

    return {
      totalTickets: all.length,
      openTickets: all.filter(t => t.status === 'open').length,
      inProgressTickets: all.filter(t => t.status === 'in_progress').length,
      resolvedTickets: all.filter(t => t.status === 'resolved').length,
      closedTickets: all.filter(t => t.status === 'closed').length,
      waitingTickets: all.filter(t => t.status === 'waiting_on_customer').length,
      avgResolutionHours: resolutionCount > 0 ? Math.round(totalResolutionMs / resolutionCount / 3600000 * 10) / 10 : 0,
      avgFirstResponseHours: firstResponseCount > 0 ? Math.round(totalFirstResponseMs / firstResponseCount / 3600000 * 10) / 10 : 0,
      ticketsByCategory: byCategory,
      ticketsByPriority: byPriority,
      ticketsThisWeek: all.filter(t => new Date(t.created_at) >= weekAgo).length,
      ticketsThisMonth: all.filter(t => new Date(t.created_at) >= monthAgo).length,
      satisfactionAvg: satisfactionCount > 0 ? Math.round(satisfactionSum / satisfactionCount * 10) / 10 : 0,
    };
  },
};

export const cannedResponseStorage = {
  async getAll(): Promise<SupportCannedResponse[]> {
    const { data, error } = await supabase
      .from('support_canned_responses')
      .select('*')
      .order('usage_count', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(response: Partial<SupportCannedResponse>): Promise<SupportCannedResponse> {
    const { data, error } = await supabase
      .from('support_canned_responses')
      .insert([response])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id: string, updates: Partial<SupportCannedResponse>): Promise<SupportCannedResponse> {
    const { data, error } = await supabase
      .from('support_canned_responses')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('support_canned_responses').delete().eq('id', id);
    if (error) throw error;
  },

  async incrementUsage(id: string): Promise<void> {
    const { data } = await supabase.from('support_canned_responses').select('usage_count').eq('id', id).maybeSingle();
    if (data) {
      await supabase.from('support_canned_responses').update({
        usage_count: (data.usage_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    }
  },
};

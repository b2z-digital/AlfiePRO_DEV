import { supabase } from './supabase';
import type { Classified, ClassifiedFormData, ClassifiedInquiry } from '../types/classified';

export async function getClassifieds(clubId?: string, includePublic = true) {
  try {
    let query = supabase
      .from('classifieds')
      .select('*')
      .eq('status', 'active');

    if (!includePublic && clubId) {
      query = query.eq('club_id', clubId);
    }

    query = query.order('created_at', { ascending: false });

    const { data: classifieds, error } = await query;

    if (error) {
      console.error('Database error fetching classifieds:', error);
      throw error;
    }

    if (!classifieds || classifieds.length === 0) {
      return [];
    }

    // Fetch related user and club data separately
    const userIds = [...new Set(classifieds.map(c => c.user_id).filter(Boolean))];
    const clubIds = [...new Set(classifieds.map(c => c.club_id).filter(Boolean))];

    const [usersData, clubsData] = await Promise.all([
      userIds.length > 0 ? supabase.from('profiles').select('id, first_name, last_name, avatar_url').in('id', userIds) : Promise.resolve({ data: [] }),
      clubIds.length > 0 ? supabase.from('clubs').select('id, name, logo').in('id', clubIds) : Promise.resolve({ data: [] })
    ]);

    const usersMap = new Map((usersData.data || []).map(u => [u.id, u]));
    const clubsMap = new Map((clubsData.data || []).map(c => [c.id, c]));

    // Join the data
    const result = classifieds.map(classified => ({
      ...classified,
      user: classified.user_id ? usersMap.get(classified.user_id) : null,
      club: classified.club_id ? clubsMap.get(classified.club_id) : null
    }));

    return result as unknown as Classified[];
  } catch (error) {
    console.error('Error fetching classifieds:', error);
    throw error;
  }
}

export async function getClassifiedById(id: string) {
  try {
    const { data: classified, error } = await supabase
      .from('classifieds')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Increment view count
    await supabase
      .from('classifieds')
      .update({ views_count: (classified.views_count || 0) + 1 })
      .eq('id', id);

    // Fetch user and club data separately
    const [userData, clubData] = await Promise.all([
      classified.user_id ? supabase.from('profiles').select('id, first_name, last_name, avatar_url').eq('id', classified.user_id).maybeSingle() : Promise.resolve({ data: null }),
      classified.club_id ? supabase.from('clubs').select('id, name, logo').eq('id', classified.club_id).maybeSingle() : Promise.resolve({ data: null })
    ]);

    return {
      ...classified,
      user: userData.data,
      club: clubData.data
    } as unknown as Classified;
  } catch (error) {
    console.error('Error fetching classified:', error);
    throw error;
  }
}

export async function getUserClassifieds(userId: string) {
  try {
    const { data: classifieds, error } = await supabase
      .from('classifieds')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!classifieds || classifieds.length === 0) {
      return [];
    }

    // Fetch club data separately
    const clubIds = [...new Set(classifieds.map(c => c.club_id).filter(Boolean))];

    if (clubIds.length === 0) {
      return classifieds.map(c => ({ ...c, club: null })) as unknown as Classified[];
    }

    const { data: clubsData } = await supabase
      .from('clubs')
      .select('id, name, logo')
      .in('id', clubIds);

    const clubsMap = new Map((clubsData || []).map(c => [c.id, c]));

    const result = classifieds.map(classified => ({
      ...classified,
      club: classified.club_id ? clubsMap.get(classified.club_id) : null
    }));

    return result as unknown as Classified[];
  } catch (error) {
    console.error('Error fetching user classifieds:', error);
    throw error;
  }
}

export async function createClassified(classifiedData: ClassifiedFormData, userId: string) {
  try {
    // Clean the data - remove undefined/optional fields
    const cleanData: any = {
      title: classifiedData.title,
      description: classifiedData.description,
      price: classifiedData.price,
      location: classifiedData.location,
      category: classifiedData.category,
      condition: classifiedData.condition,
      images: classifiedData.images,
      contact_email: classifiedData.contact_email,
      user_id: userId,
      status: 'active',
      is_public: classifiedData.is_public || false
    };

    // Only add optional fields if they have values
    if (classifiedData.contact_phone) cleanData.contact_phone = classifiedData.contact_phone;
    if (classifiedData.club_id) cleanData.club_id = classifiedData.club_id;

    const { data, error } = await supabase
      .from('classifieds')
      .insert([cleanData])
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }
    return data as Classified;
  } catch (error) {
    console.error('Error creating classified:', error);
    throw error;
  }
}

export async function updateClassified(id: string, updates: Partial<ClassifiedFormData>) {
  try {
    const { data, error } = await supabase
      .from('classifieds')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Classified;
  } catch (error) {
    console.error('Error updating classified:', error);
    throw error;
  }
}

export async function deleteClassified(id: string) {
  try {
    const { error } = await supabase
      .from('classifieds')
      .delete()
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting classified:', error);
    throw error;
  }
}

export async function markClassifiedAsSold(id: string) {
  try {
    const { error } = await supabase
      .from('classifieds')
      .update({ status: 'sold' })
      .eq('id', id);

    if (error) throw error;
  } catch (error) {
    console.error('Error marking classified as sold:', error);
    throw error;
  }
}

export async function toggleClassifiedFavorite(classifiedId: string, userId: string) {
  try {
    // Check if already favorited
    const { data: existing } = await supabase
      .from('classified_favorites')
      .select('id')
      .eq('classified_id', classifiedId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      // Remove favorite
      const { error } = await supabase
        .from('classified_favorites')
        .delete()
        .eq('id', existing.id);

      if (error) throw error;
      return false;
    } else {
      // Add favorite
      const { error } = await supabase
        .from('classified_favorites')
        .insert([{ classified_id: classifiedId, user_id: userId }]);

      if (error) throw error;
      return true;
    }
  } catch (error) {
    console.error('Error toggling favorite:', error);
    throw error;
  }
}

export async function getUserFavorites(userId: string) {
  try {
    const { data: favorites, error } = await supabase
      .from('classified_favorites')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!favorites || favorites.length === 0) {
      return [];
    }

    // Fetch classifieds separately
    const classifiedIds = favorites.map(f => f.classified_id);
    const { data: classifieds } = await supabase
      .from('classifieds')
      .select('*')
      .in('id', classifiedIds);

    if (!classifieds || classifieds.length === 0) {
      return [];
    }

    // Fetch user and club data
    const userIds = [...new Set(classifieds.map(c => c.user_id).filter(Boolean))];
    const clubIds = [...new Set(classifieds.map(c => c.club_id).filter(Boolean))];

    const [usersData, clubsData] = await Promise.all([
      userIds.length > 0 ? supabase.from('profiles').select('id, first_name, last_name, avatar_url').in('id', userIds) : Promise.resolve({ data: [] }),
      clubIds.length > 0 ? supabase.from('clubs').select('id, name, logo').in('id', clubIds) : Promise.resolve({ data: [] })
    ]);

    const usersMap = new Map((usersData.data || []).map(u => [u.id, u]));
    const clubsMap = new Map((clubsData.data || []).map(c => [c.id, c]));

    // Join everything together
    const classifiedsMap = new Map(
      classifieds.map(c => [
        c.id,
        {
          ...c,
          user: c.user_id ? usersMap.get(c.user_id) : null,
          club: c.club_id ? clubsMap.get(c.club_id) : null
        }
      ])
    );

    return favorites.map(fav => ({
      ...fav,
      classified: classifiedsMap.get(fav.classified_id)
    }));
  } catch (error) {
    console.error('Error fetching favorites:', error);
    throw error;
  }
}

export async function isClassifiedFavorited(classifiedId: string, userId: string) {
  try {
    const { data } = await supabase
      .from('classified_favorites')
      .select('id')
      .eq('classified_id', classifiedId)
      .eq('user_id', userId)
      .maybeSingle();

    return !!data;
  } catch (error) {
    console.error('Error checking favorite:', error);
    return false;
  }
}

export async function createClassifiedInquiry(
  classifiedId: string,
  senderId: string,
  message: string,
  inquiryType: 'question' | 'offer' | 'interest',
  offerAmount?: number
) {
  try {
    const { data, error } = await supabase
      .from('classified_inquiries')
      .insert([
        {
          classified_id: classifiedId,
          sender_id: senderId,
          message,
          inquiry_type: inquiryType,
          offer_amount: offerAmount,
          status: 'pending'
        }
      ])
      .select(`
        *,
        sender:profiles!classified_inquiries_sender_id_fkey(id, first_name, last_name, avatar_url)
      `)
      .single();

    if (error) throw error;

    // Get classified owner to send notification
    const { data: classified } = await supabase
      .from('classifieds')
      .select('user_id, title, club_id')
      .eq('id', classifiedId)
      .single();

    if (classified) {
      // Get sender profile for notification
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, avatar_url')
        .eq('id', senderId)
        .maybeSingle();

      const senderName = senderProfile
        ? `${senderProfile.first_name} ${senderProfile.last_name}`
        : 'Someone';

      // Create notification for classified owner
      const subject = inquiryType === 'offer'
        ? `New Offer: ${classified.title}`
        : `Question about: ${classified.title}`;

      const body = offerAmount
        ? `${senderName} made an offer of $${offerAmount}\n\n${message}`
        : message;

      await supabase
        .from('notifications')
        .insert([
          {
            user_id: classified.user_id,
            club_id: classified.club_id,
            sender_id: senderId,
            sender_name: senderName,
            sender_avatar_url: senderProfile?.avatar_url || null,
            type: inquiryType === 'offer' ? 'classified_offer' : 'classified_inquiry',
            subject: subject,
            body: body,
            read: false
          }
        ]);
    }

    return data as ClassifiedInquiry;
  } catch (error) {
    console.error('Error creating inquiry:', error);
    throw error;
  }
}

export async function getClassifiedInquiries(classifiedId: string) {
  try {
    const { data, error } = await supabase
      .from('classified_inquiries')
      .select(`
        *,
        sender:profiles!classified_inquiries_sender_id_fkey(id, first_name, last_name, avatar_url)
      `)
      .eq('classified_id', classifiedId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as unknown as ClassifiedInquiry[];
  } catch (error) {
    console.error('Error fetching inquiries:', error);
    throw error;
  }
}

export async function updateInquiryStatus(
  inquiryId: string,
  status: 'accepted' | 'rejected' | 'responded'
) {
  try {
    const { error } = await supabase
      .from('classified_inquiries')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', inquiryId);

    if (error) throw error;
  } catch (error) {
    console.error('Error updating inquiry status:', error);
    throw error;
  }
}

export async function searchClassifieds(
  searchTerm: string,
  category?: string,
  minPrice?: number,
  maxPrice?: number,
  clubId?: string
) {
  try {
    let query = supabase
      .from('classifieds')
      .select(`
        *,
        user:profiles!user_id(id, first_name, last_name, avatar_url),
        club:clubs!club_id(id, name, logo)
      `)
      .eq('status', 'active')
      .ilike('title', `%${searchTerm}%`);

    if (category) {
      query = query.eq('category', category);
    }

    if (minPrice !== undefined) {
      query = query.gte('price', minPrice);
    }

    if (maxPrice !== undefined) {
      query = query.lte('price', maxPrice);
    }

    if (clubId) {
      query = query.or(`club_id.eq.${clubId},is_public.eq.true`);
    }

    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    return data as unknown as Classified[];
  } catch (error) {
    console.error('Error searching classifieds:', error);
    throw error;
  }
}

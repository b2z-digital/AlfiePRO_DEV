import { supabase } from './supabase';

export interface RaceOfficerContact {
  id: string;
  user_id: string;
  name: string;
  sail_number: string;
  boat_class: string;
  boat_name: string;
  club_name: string;
  email: string;
  phone: string;
  notes: string;
  country: string;
  state: string;
  created_at: string;
  updated_at: string;
}

export type RaceOfficerContactInput = Omit<RaceOfficerContact, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export async function getRaceOfficerContacts(): Promise<RaceOfficerContact[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('race_officer_contacts')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching race officer contacts:', error);
    return [];
  }

  return data || [];
}

export async function addRaceOfficerContact(contact: Partial<RaceOfficerContactInput>): Promise<RaceOfficerContact | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('race_officer_contacts')
    .insert({
      user_id: user.id,
      name: contact.name || '',
      sail_number: contact.sail_number || '',
      boat_class: contact.boat_class || '',
      boat_name: contact.boat_name || '',
      club_name: contact.club_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      notes: contact.notes || '',
      country: contact.country || '',
      state: contact.state || '',
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error adding race officer contact:', error);
    return null;
  }

  return data;
}

export async function updateRaceOfficerContact(id: string, updates: Partial<RaceOfficerContactInput>): Promise<RaceOfficerContact | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('race_officer_contacts')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating race officer contact:', error);
    return null;
  }

  return data;
}

export async function deleteRaceOfficerContact(id: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from('race_officer_contacts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error deleting race officer contact:', error);
    return false;
  }

  return true;
}

export async function bulkAddRaceOfficerContacts(contacts: Partial<RaceOfficerContactInput>[]): Promise<RaceOfficerContact[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const rows = contacts.map(c => ({
    user_id: user.id,
    name: c.name || '',
    sail_number: c.sail_number || '',
    boat_class: c.boat_class || '',
    boat_name: c.boat_name || '',
    club_name: c.club_name || '',
    email: c.email || '',
    phone: c.phone || '',
    notes: c.notes || '',
    country: c.country || '',
    state: c.state || '',
  }));

  const { data, error } = await supabase
    .from('race_officer_contacts')
    .insert(rows)
    .select();

  if (error) {
    console.error('Error bulk adding race officer contacts:', error);
    return [];
  }

  return data || [];
}

export async function searchRaceOfficerContacts(searchTerm: string): Promise<RaceOfficerContact[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const term = `%${searchTerm}%`;

  const { data, error } = await supabase
    .from('race_officer_contacts')
    .select('*')
    .eq('user_id', user.id)
    .or(`name.ilike.${term},sail_number.ilike.${term},boat_class.ilike.${term},club_name.ilike.${term},email.ilike.${term}`)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error searching race officer contacts:', error);
    return [];
  }

  return data || [];
}

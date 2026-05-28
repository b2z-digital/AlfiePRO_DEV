import { supabase } from './supabase';

export interface SkipperBoat {
  class: string;
  sail_number: string;
  design: string;
  handicap: number | null;
}

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
  division: string;
  boats: SkipperBoat[];
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

  return (data || []).map(normalizeContact);
}

function normalizeContact(raw: any): RaceOfficerContact {
  let boats: SkipperBoat[] = [];
  if (Array.isArray(raw.boats) && raw.boats.length > 0) {
    boats = raw.boats.map((b: any) => ({
      class: b.class || '',
      sail_number: b.sail_number || '',
      design: b.design || '',
      handicap: b.handicap ?? null,
    }));
  } else if (raw.boat_class || raw.sail_number || raw.boat_name) {
    boats = [{
      class: raw.boat_class || '',
      sail_number: raw.sail_number || '',
      design: raw.boat_name || '',
      handicap: null,
    }];
  }

  return {
    ...raw,
    division: raw.division || '',
    boats,
  };
}

export async function addRaceOfficerContact(contact: Partial<RaceOfficerContactInput>): Promise<RaceOfficerContact | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const boats = contact.boats || [];
  const primaryBoat = boats[0] || { class: '', sail_number: '', design: '' };

  const { data, error } = await supabase
    .from('race_officer_contacts')
    .insert({
      user_id: user.id,
      name: contact.name || '',
      sail_number: primaryBoat.sail_number,
      boat_class: primaryBoat.class,
      boat_name: primaryBoat.design,
      club_name: contact.club_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      notes: contact.notes || '',
      country: contact.country || '',
      state: contact.state || '',
      division: contact.division || '',
      boats: JSON.stringify(boats),
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error adding race officer contact:', error);
    return null;
  }

  return data ? normalizeContact(data) : null;
}

export async function updateRaceOfficerContact(id: string, updates: Partial<RaceOfficerContactInput>): Promise<RaceOfficerContact | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const updatePayload: any = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.boats) {
    const primaryBoat = updates.boats[0] || { class: '', sail_number: '', design: '' };
    updatePayload.sail_number = primaryBoat.sail_number;
    updatePayload.boat_class = primaryBoat.class;
    updatePayload.boat_name = primaryBoat.design;
    updatePayload.boats = JSON.stringify(updates.boats);
  }

  const { data, error } = await supabase
    .from('race_officer_contacts')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating race officer contact:', error);
    return null;
  }

  return data ? normalizeContact(data) : null;
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

  const rows = contacts.map(c => {
    const boats = c.boats || [];
    const primaryBoat = boats.length > 0
      ? boats[0]
      : { class: c.boat_class || '', sail_number: c.sail_number || '', design: c.boat_name || '' };

    const allBoats = boats.length > 0 ? boats : (primaryBoat.class || primaryBoat.sail_number || primaryBoat.design)
      ? [primaryBoat]
      : [];

    return {
      user_id: user.id,
      name: c.name || '',
      sail_number: primaryBoat.sail_number || '',
      boat_class: primaryBoat.class || '',
      boat_name: primaryBoat.design || '',
      club_name: c.club_name || '',
      email: c.email || '',
      phone: c.phone || '',
      notes: c.notes || '',
      country: c.country || '',
      state: c.state || '',
      division: c.division || '',
      boats: JSON.stringify(allBoats),
    };
  });

  const { data, error } = await supabase
    .from('race_officer_contacts')
    .insert(rows)
    .select();

  if (error) {
    console.error('Error bulk adding race officer contacts:', error);
    return [];
  }

  return (data || []).map(normalizeContact);
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

  return (data || []).map(normalizeContact);
}

export async function getBoatClasses(): Promise<{ id: string; name: string; class_image: string | null }[]> {
  const { data, error } = await supabase
    .from('boat_classes')
    .select('id, name, class_image')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching boat classes:', error);
    return [];
  }

  return data || [];
}

import { supabase } from './supabase';

export interface ClubBackupData {
  version: string;
  timestamp: string;
  club: {
    id: string;
    name: string;
    abbreviation: string;
  };
  members: any[];
  boats: any[];
  races: any[];
  race_results: any[];
  race_series: any[];
  series_races: any[];
  venues: any[];
  meetings: any[];
  meeting_agendas: any[];
  tasks: any[];
  articles: any[];
  finance_transactions: any[];
  finance_categories: any[];
  finance_invoices: any[];
  finance_invoice_items: any[];
  media_items: any[];
  membership_types: any[];
  membership_applications: any[];
  custom_forms: any[];
  document_templates: any[];
}

/**
 * Export all club data to a JSON backup file
 */
export async function exportClubBackup(clubId: string): Promise<ClubBackupData> {
  try {
    console.log('Starting backup export for club:', clubId);

    // Fetch club details using maybeSingle() to handle cases where club might not exist
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, name, abbreviation')
      .eq('id', clubId)
      .maybeSingle();

    if (clubError) {
      console.error('Club fetch error:', clubError);
      throw new Error(`Failed to fetch club: ${clubError.message}`);
    }

    if (!club) {
      console.error('Club not found with ID:', clubId);
      throw new Error(`Club not found. Please ensure you have selected a valid club.`);
    }

    console.log('Club fetched successfully:', club.name);

    // Helper function to safely fetch data
    const safeFetch = async (tableName: string, query: any) => {
      try {
        const result = await query;
        if (result.error) {
          console.warn(`Warning: Could not fetch ${tableName}:`, result.error.message);
          return { data: [], error: result.error };
        }
        return result;
      } catch (err) {
        console.warn(`Warning: Error fetching ${tableName}:`, err);
        return { data: [], error: err };
      }
    };

    // Fetch all related data with error handling
    const [
      membersResult,
      boatsResult,
      racesResult,
      raceResultsResult,
      raceSeriesResult,
      seriesRacesResult,
      venuesResult,
      meetingsResult,
      meetingAgendasResult,
      tasksResult,
      articlesResult,
      transactionsResult,
      categoriesResult,
      invoicesResult,
      invoiceItemsResult,
      mediaItemsResult,
      membershipTypesResult,
      membershipApplicationsResult,
      customFormsResult,
      documentTemplatesResult
    ] = await Promise.all([
      safeFetch('members', supabase.from('members').select('*').eq('club_id', clubId)),
      safeFetch('boats', supabase.from('boats').select('*').eq('club_id', clubId)),
      safeFetch('races', supabase.from('races').select('*').eq('club_id', clubId)),
      safeFetch('race_results', supabase.from('race_results').select('*').eq('club_id', clubId)),
      safeFetch('race_series', supabase.from('race_series').select('*').eq('club_id', clubId)),
      safeFetch('series_races', supabase.from('series_races').select('*')),
      safeFetch('venues', supabase.from('venues').select('*').eq('club_id', clubId)),
      safeFetch('meetings', supabase.from('meetings').select('*').eq('club_id', clubId)),
      safeFetch('meeting_agendas', supabase.from('meeting_agendas').select('*')),
      safeFetch('tasks', supabase.from('tasks').select('*').eq('club_id', clubId)),
      safeFetch('articles', supabase.from('articles').select('*').eq('club_id', clubId)),
      safeFetch('finance_transactions', supabase.from('finance_transactions').select('*').eq('club_id', clubId)),
      safeFetch('finance_categories', supabase.from('finance_categories').select('*').eq('club_id', clubId)),
      safeFetch('finance_invoices', supabase.from('finance_invoices').select('*').eq('club_id', clubId)),
      safeFetch('finance_invoice_items', supabase.from('finance_invoice_items').select('*')),
      safeFetch('media_items', supabase.from('media_items').select('*').eq('club_id', clubId)),
      safeFetch('membership_types', supabase.from('membership_types').select('*').eq('club_id', clubId)),
      safeFetch('membership_applications', supabase.from('membership_applications').select('*').eq('club_id', clubId)),
      safeFetch('custom_forms', supabase.from('custom_forms').select('*').eq('club_id', clubId)),
      safeFetch('document_templates', supabase.from('document_templates').select('*').eq('club_id', clubId))
    ]);

    // Filter series_races to only include those related to this club's series
    const seriesIds = (raceSeriesResult.data || []).map(s => s.id);
    const filteredSeriesRaces = (seriesRacesResult.data || []).filter(sr =>
      seriesIds.includes(sr.series_id)
    );

    // Filter meeting agendas to only include those from this club's meetings
    const meetingIds = (meetingsResult.data || []).map(m => m.id);
    const filteredMeetingAgendas = (meetingAgendasResult.data || []).filter(ma =>
      meetingIds.includes(ma.meeting_id)
    );

    // Filter invoice items to only include those from this club's invoices
    const invoiceIds = (invoicesResult.data || []).map(inv => inv.id);
    const filteredInvoiceItems = (invoiceItemsResult.data || []).filter(item =>
      invoiceIds.includes(item.invoice_id)
    );

    const backup: ClubBackupData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      club,
      members: membersResult.data || [],
      boats: boatsResult.data || [],
      races: racesResult.data || [],
      race_results: raceResultsResult.data || [],
      race_series: raceSeriesResult.data || [],
      series_races: filteredSeriesRaces,
      venues: venuesResult.data || [],
      meetings: meetingsResult.data || [],
      meeting_agendas: filteredMeetingAgendas,
      tasks: tasksResult.data || [],
      articles: articlesResult.data || [],
      finance_transactions: transactionsResult.data || [],
      finance_categories: categoriesResult.data || [],
      finance_invoices: invoicesResult.data || [],
      finance_invoice_items: filteredInvoiceItems,
      media_items: mediaItemsResult.data || [],
      membership_types: membershipTypesResult.data || [],
      membership_applications: membershipApplicationsResult.data || [],
      custom_forms: customFormsResult.data || [],
      document_templates: documentTemplatesResult.data || []
    };

    console.log('Backup created successfully with', {
      members: backup.members.length,
      boats: backup.boats.length,
      races: backup.races.length,
      venues: backup.venues.length
    });

    return backup;
  } catch (error) {
    console.error('Error exporting club backup:', error);
    // Provide more detailed error message
    if (error instanceof Error) {
      throw new Error(`Backup export failed: ${error.message}`);
    }
    throw new Error('Backup export failed with an unknown error');
  }
}

/**
 * Download backup data as a JSON file
 */
export function downloadBackup(backup: ClubBackupData, clubName: string) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${clubName.replace(/\s+/g, '_')}_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface ImportSelection {
  members?: boolean;
  boats?: boolean;
  races?: boolean;
  raceSeries?: boolean;
  venues?: boolean;
  meetings?: boolean;
  tasks?: boolean;
  articles?: boolean;
  transactions?: boolean;
  invoices?: boolean;
}

type ProgressCallback = (progress: {
  members: 'pending' | 'importing' | 'completed' | 'error';
  boats: 'pending' | 'importing' | 'completed' | 'error';
  races: 'pending' | 'importing' | 'completed' | 'error';
  raceSeries: 'pending' | 'importing' | 'completed' | 'error';
  venues: 'pending' | 'importing' | 'completed' | 'error';
  meetings: 'pending' | 'importing' | 'completed' | 'error';
  tasks: 'pending' | 'importing' | 'completed' | 'error';
  articles: 'pending' | 'importing' | 'completed' | 'error';
  transactions: 'pending' | 'importing' | 'completed' | 'error';
  invoices: 'pending' | 'importing' | 'completed' | 'error';
}) => void;

/**
 * Import club data from a backup file
 */
export async function importClubBackup(
  targetClubId: string,
  backupData: ClubBackupData,
  selection?: ImportSelection,
  onProgress?: ProgressCallback
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Validate backup version
    if (!backupData.version || backupData.version !== '1.0.0') {
      throw new Error('Unsupported backup version');
    }

    // Create ID mappings for foreign key references
    const idMappings = {
      members: new Map<string, string>(),
      boats: new Map<string, string>(),
      races: new Map<string, string>(),
      race_series: new Map<string, string>(),
      venues: new Map<string, string>(),
      meetings: new Map<string, string>(),
      finance_categories: new Map<string, string>(),
      finance_invoices: new Map<string, string>(),
      membership_types: new Map<string, string>(),
      custom_forms: new Map<string, string>(),
      document_templates: new Map<string, string>()
    };

    // Progress tracker helper
    const currentProgress: {
      members: 'pending' | 'importing' | 'completed' | 'error';
      boats: 'pending' | 'importing' | 'completed' | 'error';
      races: 'pending' | 'importing' | 'completed' | 'error';
      raceSeries: 'pending' | 'importing' | 'completed' | 'error';
      venues: 'pending' | 'importing' | 'completed' | 'error';
      meetings: 'pending' | 'importing' | 'completed' | 'error';
      tasks: 'pending' | 'importing' | 'completed' | 'error';
      articles: 'pending' | 'importing' | 'completed' | 'error';
      transactions: 'pending' | 'importing' | 'completed' | 'error';
      invoices: 'pending' | 'importing' | 'completed' | 'error';
    } = {
      members: 'pending',
      boats: 'pending',
      races: 'pending',
      raceSeries: 'pending',
      venues: 'pending',
      meetings: 'pending',
      tasks: 'pending',
      articles: 'pending',
      transactions: 'pending',
      invoices: 'pending',
    };

    const updateProgress = (key: keyof typeof currentProgress, status: 'importing' | 'completed' | 'error') => {
      currentProgress[key] = status;
      onProgress?.({ ...currentProgress });
    };

    // Import members
    if (selection?.members !== false && backupData.members.length > 0) {
      updateProgress('members', 'importing');

      try {
        for (const member of backupData.members) {
          const { id: oldId, club_id, created_at, updated_at, user_id, ...memberData } = member;

          // Remove any other system-generated fields that might cause conflicts
          const cleanMemberData = { ...memberData };
          delete cleanMemberData.id;

          const { data, error } = await supabase
            .from('members')
            .insert({ ...cleanMemberData, club_id: targetClubId })
            .select()
            .maybeSingle();

          if (error) {
            console.error('Member import error:', error, 'Member data:', member);
            errors.push(`Failed to import member ${member.first_name} ${member.last_name}: ${error.message}`);
          } else if (data) {
            idMappings.members.set(oldId, data.id);
          }
        }
        updateProgress('members', 'completed');
      } catch (err) {
        updateProgress('members', 'error');
        console.error('Members import exception:', err);
        errors.push(`Failed to import members: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Import boats (with member references)
    if (selection?.boats !== false && backupData.boats.length > 0) {
      updateProgress('boats', 'importing');

      try {
        for (const boat of backupData.boats) {
          const { id: oldId, club_id, member_id, created_at, updated_at, ...boatData } = boat;

          const newMemberId = member_id ? idMappings.members.get(member_id) : null;

          const { data, error } = await supabase
            .from('boats')
            .insert({
              ...boatData,
              club_id: targetClubId,
              member_id: newMemberId || null
            })
            .select()
            .maybeSingle();

          if (error) {
            errors.push(`Failed to import boat ${boat.sail_number}: ${error.message}`);
          } else if (data) {
            idMappings.boats.set(oldId, data.id);
          }
        }
        updateProgress('boats', 'completed');
      } catch (err) {
        updateProgress('boats', 'error');
        errors.push(`Failed to import boats: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Import venues
    if (selection?.venues !== false && backupData.venues.length > 0) {
      updateProgress('venues', 'importing');

      try {
        for (const venue of backupData.venues) {
          const { id: oldId, club_id, created_at, updated_at, ...venueData } = venue;

          const { data, error } = await supabase
            .from('venues')
            .insert({ ...venueData, club_id: targetClubId })
            .select()
            .maybeSingle();

          if (error) {
            errors.push(`Failed to import venue ${venue.name}: ${error.message}`);
          } else if (data) {
            idMappings.venues.set(oldId, data.id);
          }
        }
        updateProgress('venues', 'completed');
      } catch (err) {
        updateProgress('venues', 'error');
        errors.push(`Failed to import venues: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Import race series
    if (selection?.raceSeries !== false && backupData.race_series.length > 0) {
      updateProgress('raceSeries', 'importing');

      try {
        for (const series of backupData.race_series) {
          const { id: oldId, club_id, created_at, updated_at, ...seriesData } = series;

          const { data, error } = await supabase
            .from('race_series')
            .insert({ ...seriesData, club_id: targetClubId })
            .select()
            .maybeSingle();

          if (error) {
            errors.push(`Failed to import series ${series.name}: ${error.message}`);
          } else if (data) {
            idMappings.race_series.set(oldId, data.id);
          }
        }
        updateProgress('raceSeries', 'completed');
      } catch (err) {
        updateProgress('raceSeries', 'error');
        errors.push(`Failed to import race series: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Import races
    if (selection?.races !== false && backupData.races.length > 0) {
      updateProgress('races', 'importing');
      try {
        for (const race of backupData.races) {
          const { id: oldId, club_id, venue_id, created_at, updated_at, ...raceData } = race;

      const newVenueId = venue_id ? idMappings.venues.get(venue_id) : null;

      const { data, error } = await supabase
        .from('races')
        .insert({
          ...raceData,
          club_id: targetClubId,
          venue_id: newVenueId || null
        })
        .select()
        .single();

      if (error) {
        errors.push(`Failed to import race ${race.name}: ${error.message}`);
      } else if (data) {
        idMappings.races.set(oldId, data.id);
      }
    }

    // Import series races (links series to races)
    for (const seriesRace of backupData.series_races) {
      const { series_id, race_id, ...seriesRaceData } = seriesRace;

      const newSeriesId = idMappings.race_series.get(series_id);
      const newRaceId = idMappings.races.get(race_id);

      if (newSeriesId && newRaceId) {
        const { error } = await supabase
          .from('series_races')
          .insert({
            ...seriesRaceData,
            series_id: newSeriesId,
            race_id: newRaceId
          });

        if (error) {
          errors.push(`Failed to link series to race: ${error.message}`);
        }
      }
    }

    // Import race results
    for (const result of backupData.race_results) {
      const { id: oldId, club_id, race_id, skipper_id, boat_id, created_at, updated_at, ...resultData } = result;

      const newRaceId = idMappings.races.get(race_id);
      const newSkipperId = skipper_id ? idMappings.members.get(skipper_id) : null;
      const newBoatId = boat_id ? idMappings.boats.get(boat_id) : null;

      if (newRaceId) {
        const { error } = await supabase
          .from('race_results')
          .insert({
            ...resultData,
            club_id: targetClubId,
            race_id: newRaceId,
            skipper_id: newSkipperId || null,
            boat_id: newBoatId || null
          });

        if (error) {
          errors.push(`Failed to import race result: ${error.message}`);
        }
      }
        }
        updateProgress('races', 'completed');
      } catch (err) {
        updateProgress('races', 'error');
        errors.push(`Failed to import races: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Import meetings
    for (const meeting of backupData.meetings) {
      const { id: oldId, club_id, chairperson_id, minute_taker_id, created_at, updated_at, ...meetingData } = meeting;

      const newChairpersonId = chairperson_id ? idMappings.members.get(chairperson_id) : null;
      const newMinuteTakerId = minute_taker_id ? idMappings.members.get(minute_taker_id) : null;

      const { data, error } = await supabase
        .from('meetings')
        .insert({
          ...meetingData,
          club_id: targetClubId,
          chairperson_id: newChairpersonId || null,
          minute_taker_id: newMinuteTakerId || null
        })
        .select()
        .single();

      if (error) {
        errors.push(`Failed to import meeting ${meeting.name}: ${error.message}`);
      } else if (data) {
        idMappings.meetings.set(oldId, data.id);
      }
    }

    // Import meeting agendas
    for (const agenda of backupData.meeting_agendas) {
      const { id: oldId, meeting_id, owner_id, ...agendaData } = agenda;

      const newMeetingId = idMappings.meetings.get(meeting_id);
      const newOwnerId = owner_id ? idMappings.members.get(owner_id) : null;

      if (newMeetingId) {
        const { error } = await supabase
          .from('meeting_agendas')
          .insert({
            ...agendaData,
            meeting_id: newMeetingId,
            owner_id: newOwnerId || null
          });

        if (error) {
          errors.push(`Failed to import meeting agenda: ${error.message}`);
        }
      }
    }

    // Import tasks
    for (const task of backupData.tasks) {
      const { id: oldId, club_id, assignee_id, created_by, created_at, updated_at, ...taskData } = task;

      const newAssigneeId = assignee_id ? idMappings.members.get(assignee_id) : null;

      const { error } = await supabase
        .from('tasks')
        .insert({
          ...taskData,
          club_id: targetClubId,
          assignee_id: newAssigneeId || null,
          created_by: created_by // Keep original creator ID or it could be mapped to current user
        });

      if (error) {
        errors.push(`Failed to import task ${task.title}: ${error.message}`);
      }
    }

    // Import articles
    for (const article of backupData.articles) {
      const { id: oldId, club_id, author_id, created_at, updated_at, ...articleData } = article;

      const { error } = await supabase
        .from('articles')
        .insert({
          ...articleData,
          club_id: targetClubId,
          author_id: author_id // Keep original author or map to current user
        });

      if (error) {
        errors.push(`Failed to import article ${article.title}: ${error.message}`);
      }
    }

    // Import finance categories
    for (const category of backupData.finance_categories) {
      const { id: oldId, club_id, created_at, updated_at, ...categoryData } = category;

      const { data, error } = await supabase
        .from('finance_categories')
        .insert({ ...categoryData, club_id: targetClubId })
        .select()
        .single();

      if (error) {
        errors.push(`Failed to import finance category ${category.name}: ${error.message}`);
      } else if (data) {
        idMappings.finance_categories.set(oldId, data.id);
      }
    }

    // Import finance transactions
    for (const transaction of backupData.finance_transactions) {
      const { id: oldId, club_id, category_id, created_at, updated_at, ...transactionData } = transaction;

      const newCategoryId = category_id ? idMappings.finance_categories.get(category_id) : null;

      const { error } = await supabase
        .from('finance_transactions')
        .insert({
          ...transactionData,
          club_id: targetClubId,
          category_id: newCategoryId || null
        });

      if (error) {
        errors.push(`Failed to import transaction: ${error.message}`);
      }
    }

    // Import finance invoices
    for (const invoice of backupData.finance_invoices) {
      const { id: oldId, club_id, member_id, created_at, updated_at, ...invoiceData } = invoice;

      const newMemberId = member_id ? idMappings.members.get(member_id) : null;

      const { data, error } = await supabase
        .from('finance_invoices')
        .insert({
          ...invoiceData,
          club_id: targetClubId,
          member_id: newMemberId || null
        })
        .select()
        .single();

      if (error) {
        errors.push(`Failed to import invoice ${invoice.invoice_number}: ${error.message}`);
      } else if (data) {
        idMappings.finance_invoices.set(oldId, data.id);
      }
    }

    // Import invoice items
    for (const item of backupData.finance_invoice_items) {
      const { id: oldId, invoice_id, ...itemData } = item;

      const newInvoiceId = idMappings.finance_invoices.get(invoice_id);

      if (newInvoiceId) {
        const { error } = await supabase
          .from('finance_invoice_items')
          .insert({
            ...itemData,
            invoice_id: newInvoiceId
          });

        if (error) {
          errors.push(`Failed to import invoice item: ${error.message}`);
        }
      }
    }

    // Import membership types
    for (const type of backupData.membership_types) {
      const { id: oldId, club_id, created_at, updated_at, ...typeData } = type;

      const { data, error } = await supabase
        .from('membership_types')
        .insert({ ...typeData, club_id: targetClubId })
        .select()
        .single();

      if (error) {
        errors.push(`Failed to import membership type ${type.name}: ${error.message}`);
      } else if (data) {
        idMappings.membership_types.set(oldId, data.id);
      }
    }

    // Import membership applications
    for (const application of backupData.membership_applications) {
      const { id: oldId, club_id, membership_type_id, created_at, updated_at, ...applicationData } = application;

      const newMembershipTypeId = membership_type_id ? idMappings.membership_types.get(membership_type_id) : null;

      const { error } = await supabase
        .from('membership_applications')
        .insert({
          ...applicationData,
          club_id: targetClubId,
          membership_type_id: newMembershipTypeId || null
        });

      if (error) {
        errors.push(`Failed to import membership application: ${error.message}`);
      }
    }

    // Import custom forms
    for (const form of backupData.custom_forms) {
      const { id: oldId, club_id, created_at, updated_at, ...formData } = form;

      const { data, error } = await supabase
        .from('custom_forms')
        .insert({ ...formData, club_id: targetClubId })
        .select()
        .single();

      if (error) {
        errors.push(`Failed to import custom form ${form.name}: ${error.message}`);
      } else if (data) {
        idMappings.custom_forms.set(oldId, data.id);
      }
    }

    // Import document templates
    for (const template of backupData.document_templates) {
      const { id: oldId, club_id, created_at, updated_at, ...templateData } = template;

      const { data, error } = await supabase
        .from('document_templates')
        .insert({ ...templateData, club_id: targetClubId })
        .select()
        .single();

      if (error) {
        errors.push(`Failed to import document template ${template.name}: ${error.message}`);
      } else if (data) {
        idMappings.document_templates.set(oldId, data.id);
      }
    }

    // Note: Media items are not imported as they reference storage files
    // Users would need to manually re-upload media

    return {
      success: errors.length === 0,
      errors
    };
  } catch (error) {
    console.error('Error importing club backup:', error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error occurred']
    };
  }
}

/**
 * Validate a backup file structure
 */
export function validateBackupFile(data: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.version) {
    errors.push('Backup file is missing version information');
  }

  if (!data.timestamp) {
    errors.push('Backup file is missing timestamp');
  }

  if (!data.club) {
    errors.push('Backup file is missing club information');
  }

  const requiredTables = [
    'members', 'boats', 'races', 'race_results', 'race_series',
    'venues', 'meetings', 'tasks', 'articles'
  ];

  for (const table of requiredTables) {
    if (!Array.isArray(data[table])) {
      errors.push(`Backup file has invalid or missing ${table} data`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

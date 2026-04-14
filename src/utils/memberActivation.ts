import { supabase } from './supabase';

export interface ActivationResult {
  member_id: string;
  email: string;
  name: string;
  status: 'created' | 'existing_linked' | 'error' | 'no_email';
  error?: string;
}

export interface ActivationSummary {
  created: number;
  existing_linked: number;
  errors: number;
  no_email: number;
  total: number;
}

export interface ActivationResponse {
  success: boolean;
  summary: ActivationSummary;
  results: ActivationResult[];
  error?: string;
}

export async function activateMembers(
  memberIds: string[],
  clubId: string,
  clubName: string,
  bccEmail?: string
): Promise<ActivationResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return {
        success: false,
        summary: { created: 0, existing_linked: 0, errors: 0, no_email: 0, total: 0 },
        results: [],
        error: 'Not authenticated',
      };
    }

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/activate-member-account`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        member_ids: memberIds,
        club_id: clubId,
        club_name: clubName,
        ...(bccEmail ? { bcc_email: bccEmail } : {}),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        summary: { created: 0, existing_linked: 0, errors: 0, no_email: 0, total: 0 },
        results: [],
        error: data.error || `Request failed with status ${response.status}`,
      };
    }

    return data as ActivationResponse;
  } catch (err: any) {
    return {
      success: false,
      summary: { created: 0, existing_linked: 0, errors: 0, no_email: 0, total: 0 },
      results: [],
      error: err.message || 'Failed to activate members',
    };
  }
}

export function getActivationStatusConfig(
  member: { user_id?: string | null; activation_status?: string | null; activation_sent_at?: string | null }
) {
  if (member.user_id && member.activation_status === 'activated') {
    return {
      label: 'Active',
      color: 'bg-green-900/30 text-green-400',
      dotColor: 'bg-green-500',
      canActivate: false,
    };
  }

  if (member.user_id && !member.activation_status) {
    return {
      label: 'Connected',
      color: 'bg-green-900/30 text-green-400',
      dotColor: 'bg-green-500',
      canActivate: false,
    };
  }

  if (member.activation_status === 'pending') {
    return {
      label: 'Invite Sent',
      color: 'bg-sky-900/30 text-sky-400',
      dotColor: 'bg-sky-500',
      canActivate: true,
    };
  }

  return {
    label: 'Not Activated',
    color: 'bg-slate-700/50 text-slate-400',
    dotColor: 'bg-slate-500',
    canActivate: true,
  };
}

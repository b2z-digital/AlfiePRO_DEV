import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, SquarePen as Edit2, DollarSign, Calendar, Save, TriangleAlert as AlertTriangle, Check, CalendarDays, X, FileText, ArrowRightLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { MembershipType, MembershipSettings, RenewalMode } from '../../types/membership';
import { WysiwygEditor } from '../ui/WysiwygEditor';
import { EmailTemplateEditor } from '../ui/EmailTemplateEditor';

interface MembershipSettingsPageProps {
  darkMode: boolean;
  initialView?: 'types' | 'renewals' | 'emails' | 'conduct';
  onSaveComplete?: () => void;
}

export const MembershipSettingsPage: React.FC<MembershipSettingsPageProps> = ({ darkMode, initialView, onSaveComplete }) => {
  const { currentClub } = useAuth();
  const [membershipTypes, setMembershipTypes] = useState<MembershipType[]>([]);
  const [memberCountsByType, setMemberCountsByType] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<MembershipType | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showStripeConnect, setShowStripeConnect] = useState(false);
  const [codeOfConduct, setCodeOfConduct] = useState('');
  const [renewalMode, setRenewalMode] = useState<RenewalMode>('fixed');
  const [fixedRenewalDate, setFixedRenewalDate] = useState<string>('07-01');
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(false);
  const [renewalNotificationDays, setRenewalNotificationDays] = useState(30);
  const [renewalGracePeriodDays, setRenewalGracePeriodDays] = useState(21);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeEmailTemplate, setActiveEmailTemplate] = useState<string | null>(null);

  // Default system templates
  const defaultTemplates = {
    welcome: {
      subject: 'Welcome to {{clubName}}!',
      body: `<p>Dear {{firstName}},</p><p>We're thrilled to welcome you as a new member of {{clubName}}!</p><p>Your membership is now active, and you can start enjoying all the benefits of being a member, including participating in our racing events and club activities.</p><h2>Getting Started</h2><ul><li>Access your dashboard to manage your profile</li><li>View upcoming events and register for races</li><li>Connect with other club members</li><li>Stay updated with club news and announcements</li></ul><p>If you have any questions or need assistance getting started, please don't hesitate to reach out to us.</p><p>Welcome aboard!</p>`
    },
    renewal: {
      subject: 'Time to renew your {{clubName}} membership',
      body: `<p>Hi {{firstName}},</p><p>Your {{membershipType}} membership with {{clubName}} is due for renewal.</p><h2 class="ql-align-center"><strong>Membership Details</strong></h2><p class="ql-align-center"><strong>Membership Type</strong>: {{membershipType}}</p><p class="ql-align-center"><strong>Renewal Date</strong>: {{renewalDate}}</p><p class="ql-align-center"><br></p><p class="ql-align-center">To keep racing and enjoying all club benefits without interruption,</p><p class="ql-align-center">you can renew your membership in just a few minutes:</p><p class="ql-align-center"><br></p><p class="ql-align-center">\u{1F449} <strong>Renew via AlfiePRO App</strong></p><p class="ql-align-center"><em>Open AlfiePRO \u2192 Tap your profile \u2192 Membership</em></p><p class="ql-align-center"><strong>OR</strong></p><p class="ql-align-center">\u{1F449} <strong>Renew Online</strong></p><p class="ql-align-center"><a href="{{renewalLink}}" rel="noopener noreferrer" target="_blank">Renew My Membership</a></p><h3><br></h3><h3><strong>\u26A0\uFE0F Why renew now?</strong></h3><p>Renewing before your expiry ensures:</p><ul><li>You stay eligible to race</li><li>Your results and rankings continue uninterrupted</li><li>You remain covered under association insurance</li><li>If you have any questions or need help, just email<strong> {{secretaryName}}</strong> - {{secretaryEmail}}</li></ul><p>Thank you for being a valued member of {{clubName}}!</p>`
    },
    renewal_reminder_unregistered: {
      subject: 'Time to renew your {{clubName}} membership',
      body: `<p>Hi {{firstName}},</p><p>Your <strong>{{membershipType}}</strong> membership with <strong>{{clubName}}</strong> is due for renewal.</p><h2 class="ql-align-center"><strong>Membership Details</strong></h2><p class="ql-align-center"><strong>Membership Type</strong>: {{membershipType}}</p><p class="ql-align-center"><strong>Renewal Date</strong>: {{renewalDate}}</p><p class="ql-align-center"><strong>Amount Due</strong>: {{amount}}</p><p class="ql-align-center"><br></p><p>To renew your membership, please make a bank transfer using the details below:</p><p>{{bankDetails}}</p><p>Please use your <strong>full name</strong> as the payment reference so the club treasurer can identify your payment.</p><p>Once your payment is received, your membership will be renewed by the club treasurer.</p><p>If you have any questions or need help, please email <strong>{{secretaryName}}</strong> - {{secretaryEmail}}</p><p>Thank you for being a valued member of {{clubName}}!</p>`
    },
    payment_confirmation: {
      subject: 'Payment confirmation for {{clubName}} membership',
      body: `<p>Payment Received - Thank you {{firstName}} {{lastName}}!</p><p>We have successfully received your payment of {{amount}} {{currency}} for your <strong>{{clubName}}</strong> membership.</p><h2 class="ql-align-center"><strong>Membership Details</strong></h2><p class="ql-align-center"><strong>Membership Type</strong>: {{membershipType}}</p><p class="ql-align-center"><strong>Active Until</strong>: {{renewalDate}}</p><p class="ql-align-center"><br></p><p>Your membership is now active and you can continue enjoying all the benefits of being a member, including participating in racing events and club activities.</p><p>If you have any questions, please contact <strong>{{secretaryName}}</strong> - {{secretaryEmail}}</p><p>Thank you for your continued support of {{clubName}}!</p>`
    },
    event: {
      subject: 'New Event: {{eventName}}',
      body: `<p>Hi {{firstName}},</p><p>We're excited to announce a new upcoming event at {{clubName}}!</p><h2>{{eventName}}</h2><p>\u{1F4C5} Date{{eventDate}}\u{1F4CD} Location{{eventLocation}}</p><p>We hope to see you there! This is a great opportunity to connect with fellow members and enjoy some great racing.</p><p><a href="{{eventLink}}" rel="noopener noreferrer" target="_blank">View Event Details</a></p><p>For more information and to RSVP, please log in to your account or contact us directly.</p><p>See you on the water!</p><p><br></p><p>Best regards,</p>`
    }
  };

  const [emailTemplates, setEmailTemplates] = useState(defaultTemplates);
  const [showConfirmFixedDate, setShowConfirmFixedDate] = useState(false);
  
  const [typeFormData, setTypeFormData] = useState({
    name: '',
    description: '',
    amount: '',
    currency: 'AUD',
    renewal_period: 'annual' as 'annual' | 'monthly' | 'quarterly' | 'lifetime',
    requires_association_fees: true,
    replaces_membership_type_id: '' as string,
    is_active: true
  });

  useEffect(() => {
    if (currentClub?.clubId) {
      fetchMembershipData();
    }
  }, [currentClub]);

  const fetchMembershipData = async () => {
    if (!currentClub?.clubId) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch membership types
      const { data: typesData, error: typesError } = await supabase
        .from('membership_types')
        .select('*')
        .eq('club_id', currentClub.clubId)
        .order('created_at');
      
      if (typesError) throw typesError;

      const countsByTypeId: Record<string, number> = {};
      const countsByName: Record<string, number> = {};

      const { data: cmData } = await supabase
        .from('club_memberships')
        .select('membership_type_id')
        .eq('club_id', currentClub.clubId)
        .not('membership_type_id', 'is', null);

      if (cmData) {
        cmData.forEach(row => {
          countsByTypeId[row.membership_type_id] = (countsByTypeId[row.membership_type_id] || 0) + 1;
        });
      }

      const { data: membersData } = await supabase
        .from('members')
        .select('membership_level')
        .eq('club_id', currentClub.clubId);

      if (membersData) {
        membersData.forEach(row => {
          if (row.membership_level) {
            countsByName[row.membership_level] = (countsByName[row.membership_level] || 0) + 1;
          }
        });
      }

      const merged: Record<string, number> = {};
      if (typesData) {
        typesData.forEach((t: any) => {
          const fromId = countsByTypeId[t.id] || 0;
          const fromName = countsByName[t.name] || 0;
          const total = Math.max(fromId, fromName);
          if (total > 0) merged[t.id] = total;
        });
      }

      setMemberCountsByType(merged);

      // Fetch club settings including renewal settings
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select('code_of_conduct, renewal_mode, fixed_renewal_date, auto_renew_enabled, renewal_notification_days, renewal_grace_period_days')
        .eq('id', currentClub.clubId)
        .single();

      if (clubError) throw clubError;

      console.log("Fetched club data:", clubData);

      // Fetch email templates
      const { data: templatesData, error: templatesError } = await supabase
        .from('email_templates')
        .select('template_key, subject, body')
        .eq('club_id', currentClub.clubId);

      if (templatesError) {
        console.error('Error fetching email templates:', templatesError);
      }

      // Merge custom templates with defaults
      const loadedTemplates = { ...defaultTemplates };
      if (templatesData && templatesData.length > 0) {
        templatesData.forEach(template => {
          if (template.template_key in loadedTemplates) {
            loadedTemplates[template.template_key as keyof typeof loadedTemplates] = {
              subject: template.subject,
              body: template.body
            };
          }
        });
      }

      // Set the data
      setMembershipTypes(typesData || []);
      setCodeOfConduct(clubData?.code_of_conduct || '');
      setRenewalMode(clubData?.renewal_mode || 'fixed');
      setFixedRenewalDate(clubData?.fixed_renewal_date || '07-01');
      setAutoRenewEnabled(clubData?.auto_renew_enabled || false);
      setRenewalNotificationDays(clubData?.renewal_notification_days || 30);
      setRenewalGracePeriodDays(clubData?.renewal_grace_period_days ?? 21);
      setEmailTemplates(loadedTemplates);

      // Reset unsaved changes flag after loading data
      setHasUnsavedChanges(false);
      
    } catch (err) {
      console.error('Error fetching membership data:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!currentClub?.clubId) return;
    
    // If switching to fixed mode, show confirmation dialog
    if (renewalMode === 'fixed' && !showConfirmFixedDate) {
      setShowConfirmFixedDate(true);
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      console.log("Saving settings to database:", {
        renewal_mode: renewalMode,
        fixed_renewal_date: renewalMode === 'fixed' ? fixedRenewalDate : null,
        auto_renew_enabled: autoRenewEnabled,
        renewal_notification_days: renewalNotificationDays,
        renewal_grace_period_days: renewalGracePeriodDays
      });

      // Update club settings
      const { error: updateError } = await supabase
        .from('clubs')
        .update({
          renewal_mode: renewalMode,
          fixed_renewal_date: renewalMode === 'fixed' ? fixedRenewalDate : null,
          auto_renew_enabled: autoRenewEnabled,
          renewal_notification_days: renewalNotificationDays,
          renewal_grace_period_days: renewalGracePeriodDays
        })
        .eq('id', currentClub.clubId);
      
      if (updateError) throw updateError;
      
      // If switching to fixed mode, update all membership types to annual
      if (renewalMode === 'fixed') {
        const { error: typesUpdateError } = await supabase
          .from('membership_types')
          .update({ renewal_period: 'annual' })
          .eq('club_id', currentClub.clubId)
          .neq('renewal_period', 'lifetime'); // Don't change lifetime memberships
        
        if (typesUpdateError) throw typesUpdateError;
        
        // Update local state for membership types
        setMembershipTypes(membershipTypes.map(type => ({
          ...type,
          renewal_period: type.renewal_period === 'lifetime' ? 'lifetime' : 'annual'
        })));
        
        // Update all member renewal dates to the fixed date
        await updateMemberRenewalDates();
      }
      
      setSuccess('Renewal settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
      setHasUnsavedChanges(false);
      setShowConfirmFixedDate(false);
      if (onSaveComplete) {
        setTimeout(() => onSaveComplete(), 500);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const updateMemberRenewalDates = async () => {
    try {
      // Parse the fixed renewal date
      const [month, day] = fixedRenewalDate.split('-').map(Number);
      
      // Get the current year
      const currentYear = new Date().getFullYear();
      
      // Create a date object for the fixed renewal date with noon time to avoid timezone issues
      let newFixedRenewalDate = new Date(currentYear, month - 1, day, 12, 0, 0);
      
      // If the date has already passed this year, use next year's date
      if (newFixedRenewalDate < new Date()) {
        newFixedRenewalDate = new Date(currentYear + 1, month - 1, day, 12, 0, 0);
      }
      
      // Format the date as ISO string for the database
      const formattedDate = newFixedRenewalDate.toISOString().split('T')[0];
      
      // Update all members with the new renewal date
      const { error } = await supabase
        .from('members')
        .update({ renewal_date: formattedDate })
        .eq('club_id', currentClub?.clubId)
        .eq('is_financial', true);
      
      if (error) throw error;
      
      console.log(`Updated all member renewal dates to ${formattedDate}`);
    } catch (error) {
      console.error('Error updating member renewal dates:', error);
      throw error;
    }
  };

  const handleSaveCodeOfConduct = async () => {
    if (!currentClub?.clubId) return;
    
    try {
      setSaving(true);
      setError(null);
      
      // Update club settings
      const { error: updateError } = await supabase
        .from('clubs')
        .update({ 
          code_of_conduct: codeOfConduct
        })
        .eq('id', currentClub.clubId);
      
      if (updateError) throw updateError;
      
      setSuccess('Code of Conduct saved successfully');
      setTimeout(() => setSuccess(null), 3000);
      if (onSaveComplete) {
        setTimeout(() => onSaveComplete(), 500);
      }
    } catch (error) {
      console.error('Error saving Code of Conduct:', error);
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleAddType = async () => {
    if (!currentClub?.clubId) return;
    
    try {
      setError(null);
      
      // Validate form
      if (!typeFormData.name) {
        setError('Name is required');
        return;
      }
      
      // Allow $0 for lifetime memberships
      const amount = parseFloat(typeFormData.amount);
      if (isNaN(amount) || amount < 0) {
        setError('Amount must be a non-negative number');
        return;
      }
      
      // If fixed renewal mode is set, force renewal_period to match
      let renewal_period = typeFormData.renewal_period;
      if (renewalMode === 'fixed' && renewal_period !== 'lifetime') {
        renewal_period = 'annual';
      }
      
      const newType: Record<string, any> = {
        club_id: currentClub.clubId,
        name: typeFormData.name,
        description: typeFormData.description || null,
        amount,
        currency: typeFormData.currency,
        renewal_period,
        is_active: typeFormData.is_active,
        requires_association_fees: typeFormData.requires_association_fees,
        replaces_membership_type_id: typeFormData.replaces_membership_type_id || null
      };

      const { data: memberData, error: insertError } = await supabase
        .from('membership_types')
        .insert(newType)
        .select()
        .single();

      if (insertError) throw insertError;

      setMembershipTypes([...membershipTypes, memberData]);
      setShowForm(false);
      setTypeFormData({
        name: '',
        description: '',
        amount: '',
        currency: 'AUD',
        renewal_period: 'annual',
        requires_association_fees: true,
        replaces_membership_type_id: '',
        is_active: true
      });
      setSuccess('Membership type added successfully');

      setTimeout(() => setSuccess(null), 3000);
      if (onSaveComplete) {
        setTimeout(() => onSaveComplete(), 500);
      }
    } catch (err) {
      console.error('Error adding membership type:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleUpdateType = async () => {
    if (!currentClub?.clubId || !editingType) return;

    try {
      setError(null);

      // Validate form
      if (!typeFormData.name) {
        setError('Name is required');
        return;
      }

      // Allow $0 for lifetime memberships
      const amount = parseFloat(typeFormData.amount);
      if (isNaN(amount) || amount < 0) {
        setError('Amount must be a non-negative number');
        return;
      }

      // Prevent changing the last primary type to associate
      if (editingType.requires_association_fees !== false && !typeFormData.requires_association_fees) {
        const primaryTypes = membershipTypes.filter(t => t.requires_association_fees !== false);
        if (primaryTypes.length === 1) {
          setError('Cannot change the last Full/Primary membership to Associate. Please add another Full membership first.');
          return;
        }
      }
      
      // If fixed renewal mode is set, force renewal_period to match
      let renewal_period = typeFormData.renewal_period;
      if (renewalMode === 'fixed' && renewal_period !== 'lifetime') {
        renewal_period = 'annual';
      }
      
      const updatedType: Record<string, any> = {
        name: typeFormData.name,
        description: typeFormData.description || null,
        amount,
        currency: typeFormData.currency,
        renewal_period,
        is_active: typeFormData.is_active,
        requires_association_fees: typeFormData.requires_association_fees,
        replaces_membership_type_id: typeFormData.replaces_membership_type_id || null
      };

      const { error: updateError } = await supabase
        .from('membership_types')
        .update(updatedType)
        .eq('id', editingType.id)
        .eq('club_id', currentClub.clubId);

      if (updateError) throw updateError;

      setMembershipTypes(membershipTypes.map(type =>
        type.id === editingType.id ? { ...type, ...updatedType } : type
      ));
      setEditingType(null);
      setShowForm(false);
      setTypeFormData({
        name: '',
        description: '',
        amount: '',
        currency: 'AUD',
        renewal_period: 'annual',
        requires_association_fees: true,
        replaces_membership_type_id: '',
        is_active: true
      });
      setSuccess('Membership type updated successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
      
    } catch (err) {
      console.error('Error updating membership type:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleDeleteType = async (typeId: string) => {
    if (!currentClub?.clubId) return;

    const memberCount = memberCountsByType[typeId] || 0;
    if (memberCount > 0) {
      setError(`Cannot delete this membership type because ${memberCount} member${memberCount === 1 ? ' is' : 's are'} currently assigned to it. Set it to inactive instead.`);
      setTimeout(() => setError(null), 5000);
      return;
    }

    const typeToDelete = membershipTypes.find(t => t.id === typeId);
    if (typeToDelete?.requires_association_fees !== false) {
      const primaryTypes = membershipTypes.filter(t => t.requires_association_fees !== false);
      if (primaryTypes.length === 1) {
        setError('Cannot delete the last Full/Primary membership type. Please add another Full membership before removing this one.');
        setTimeout(() => setError(null), 5000);
        return;
      }
    }

    if (!confirm('Are you sure you want to delete this membership type? This cannot be undone.')) {
      return;
    }

    try {
      setError(null);

      // Delete type
      const { error: deleteError } = await supabase
        .from('membership_types')
        .delete()
        .eq('id', typeId)
        .eq('club_id', currentClub.clubId);

      if (deleteError) throw deleteError;

      // Update state
      setMembershipTypes(membershipTypes.filter(type => type.id !== typeId));
      setSuccess('Membership type deleted successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);

    } catch (err) {
      console.error('Error deleting membership type:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleEditType = (type: MembershipType) => {
    setEditingType(type);
    setTypeFormData({
      name: type.name,
      description: type.description || '',
      amount: type.amount.toString(),
      currency: type.currency,
      renewal_period: type.renewal_period as 'annual' | 'monthly' | 'quarterly' | 'lifetime',
      requires_association_fees: type.requires_association_fees !== false,
      replaces_membership_type_id: type.replaces_membership_type_id || '',
      is_active: type.is_active !== false
    });
    setShowForm(true);
  };

  // Handle renewal mode changes
  const handleRenewalModeChange = (mode: RenewalMode) => {
    setRenewalMode(mode);
    setHasUnsavedChanges(true);
  };

  // Handle fixed renewal date changes
  const handleFixedRenewalDateChange = (month: string, day: string) => {
    const newDate = `${month}-${day}`;
    setFixedRenewalDate(newDate);
    setHasUnsavedChanges(true);
  };

  // Handle auto renew toggle
  const handleAutoRenewToggle = (enabled: boolean) => {
    setAutoRenewEnabled(enabled);
    setHasUnsavedChanges(true);
  };

  // Handle notification days change
  const handleNotificationDaysChange = (days: number) => {
    setRenewalNotificationDays(days);
    setHasUnsavedChanges(true);
  };

  // Format MM-DD date for display
  const formatFixedRenewalDate = (mmdd: string) => {
    try {
      const [month, day] = mmdd.split('-');
      const date = new Date(2000, parseInt(month) - 1, parseInt(day));
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    } catch (err) {
      return mmdd;
    }
  };

  // Handle email template edit
  const handleEditEmailTemplate = (templateKey: string) => {
    setActiveEmailTemplate(templateKey);
  };

  // Handle email template save
  const handleSaveEmailTemplate = async (templateKey: string, subject: string, body: string) => {
    if (!currentClub?.clubId) return;

    try {
      // Upsert the template to database
      const { error: upsertError } = await supabase
        .from('email_templates')
        .upsert({
          club_id: currentClub.clubId,
          template_key: templateKey,
          subject,
          body,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'club_id,template_key'
        });

      if (upsertError) throw upsertError;

      // Update local state
      setEmailTemplates(prev => ({
        ...prev,
        [templateKey]: {
          subject,
          body
        }
      }));

      setActiveEmailTemplate(null);
      setSuccess(`${templateKey.charAt(0).toUpperCase() + templateKey.slice(1)} email template saved`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error saving email template:', error);
      setError(error instanceof Error ? error.message : 'Failed to save email template');
    }
  };

  // Handle restore default template
  const handleRestoreDefaultTemplate = async (templateKey: string) => {
    if (!currentClub?.clubId) return;

    try {
      // Delete the custom template from database (restores to default)
      const { error: deleteError } = await supabase
        .from('email_templates')
        .delete()
        .eq('club_id', currentClub.clubId)
        .eq('template_key', templateKey);

      if (deleteError) throw deleteError;

      // Restore default in local state
      setEmailTemplates(prev => ({
        ...prev,
        [templateKey]: defaultTemplates[templateKey as keyof typeof defaultTemplates]
      }));

      setActiveEmailTemplate(null);
      setSuccess(`${templateKey.charAt(0).toUpperCase() + templateKey.slice(1)} template restored to default`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error restoring default template:', error);
      setError(error instanceof Error ? error.message : 'Failed to restore default template');
    }
  };

  const handleSendTestEmail = async (templateKey: string, subject: string, body: string, recipientEmail?: string) => {
    if (!currentClub?.clubId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const targetEmail = recipientEmail || user.email;
      if (!targetEmail) throw new Error('No email address provided');

      const { error: sendError } = await supabase.functions.invoke('send-membership-notifications', {
        body: {
          email_type: templateKey,
          recipient_email: targetEmail,
          member_data: {
            first_name: 'Test',
            last_name: 'User',
            club_name: currentClub.club?.name || 'Your Club',
            membership_type: 'Full Member',
            renewal_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            amount: 150,
            currency: 'AUD',
            club_id: currentClub.clubId,
            user_id: user.id
          }
        }
      });

      if (sendError) throw sendError;

      setSuccess(`Test email sent to ${targetEmail}`);
      setTimeout(() => setSuccess(null), 5000);
    } catch (error) {
      console.error('Error sending test email:', error);
      setError(error instanceof Error ? error.message : 'Failed to send test email');
      setTimeout(() => setError(null), 5000);
    }
  };

  // Determine which sections to show based on initialView
  const showTypes = !initialView || initialView === 'types';
  const showRenewals = !initialView || initialView === 'renewals';
  const showEmails = !initialView || initialView === 'emails';
  const showConduct = !initialView || initialView === 'conduct';

  return (
    <div className="space-y-6">
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-300">
                {error}
              </h3>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-900/30">
          <div className="flex">
            <div className="flex-shrink-0">
              <Check className="h-5 w-5 text-green-400" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-300">
                {success}
              </h3>
            </div>
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 ${!initialView ? 'lg:grid-cols-5' : ''} gap-8`}>
        {/* Left column - Membership Types */}
        {(showTypes || showEmails || showConduct) && (
        <div className={`${!initialView ? 'lg:col-span-3' : ''} space-y-6`}>
          {/* Membership Types Section */}
          {showTypes && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Membership Types</h2>
              <button
                onClick={() => {
                  setEditingType(null);
                  setTypeFormData({
                    name: '',
                    description: '',
                    amount: '',
                    currency: 'AUD',
                    renewal_period: renewalMode === 'fixed' ? 'annual' : 'annual',
                    requires_association_fees: true,
                    replaces_membership_type_id: '',
                    is_active: true
                  });
                  setShowForm(true);
                }}
                className="flex items-center gap-2 px-4 py-2 text-white rounded-lg hover:shadow-lg hover:scale-105 font-medium transition-all duration-200"
              >
                <Plus size={18} />
                Add Type
              </button>
            </div>

            {showForm ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={typeFormData.name}
                    onChange={(e) => setTypeFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Full Member, Associate Member, Lifetime Member"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={typeFormData.description}
                    onChange={(e) => setTypeFormData(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe this membership type"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Membership Type <span className="text-red-400">*</span>
                  </label>
                  <div className="space-y-3">
                    <label className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                      typeFormData.requires_association_fees
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                    }`}>
                      <input
                        type="radio"
                        name="membership-type"
                        checked={typeFormData.requires_association_fees}
                        onChange={() => setTypeFormData(prev => ({ ...prev, requires_association_fees: true }))}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-200">Full/Primary Membership</div>
                        <div className="text-sm text-slate-400 mt-1">
                          Pays club + state + national fees. Recommended for new members.
                        </div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-all cursor-pointer ${
                      !typeFormData.requires_association_fees
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                    }`}>
                      <input
                        type="radio"
                        name="membership-type"
                        checked={!typeFormData.requires_association_fees}
                        onChange={() => setTypeFormData(prev => ({ ...prev, requires_association_fees: false }))}
                        className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-200">Associate/Secondary Membership</div>
                        <div className="text-sm text-slate-400 mt-1">
                          Pays club fee only. For members already in another club in your association.
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {(() => {
                  const inactiveTypes = membershipTypes.filter(t =>
                    !t.is_active && (!editingType || t.id !== editingType.id)
                  );
                  if (inactiveTypes.length > 0) {
                    return (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          Replaces (optional)
                        </label>
                        <select
                          value={typeFormData.replaces_membership_type_id}
                          onChange={(e) => setTypeFormData(prev => ({ ...prev, replaces_membership_type_id: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">None - new membership type</option>
                          {inactiveTypes.map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name} (${t.amount} {t.currency} - inactive)
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-400">
                          Members on the selected inactive type will be automatically moved to this type at renewal time.
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Amount *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <DollarSign size={16} className="text-slate-400" />
                      </div>
                      <input
                        type="number"
                        value={typeFormData.amount}
                        onChange={(e) => setTypeFormData(prev => ({ ...prev, amount: e.target.value }))}
                        className="w-full pl-8 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Enter 0.00 for free memberships like Lifetime Members
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Currency
                    </label>
                    <select
                      value={typeFormData.currency}
                      onChange={(e) => setTypeFormData(prev => ({ ...prev, currency: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="AUD">AUD</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Renewal Period
                    </label>
                    <select
                      value={typeFormData.renewal_period}
                      onChange={(e) => setTypeFormData(prev => ({ ...prev, renewal_period: e.target.value as any }))}
                      disabled={renewalMode === 'fixed' && typeFormData.renewal_period !== 'lifetime'}
                      className={`w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        renewalMode === 'fixed' && typeFormData.renewal_period !== 'lifetime' ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <option value="annual">Annual</option>
                      <option value="monthly" disabled={renewalMode === 'fixed'}>Monthly</option>
                      <option value="quarterly" disabled={renewalMode === 'fixed'}>Quarterly</option>
                      <option value="lifetime">Lifetime</option>
                    </select>
                    {renewalMode === 'fixed' && typeFormData.renewal_period !== 'lifetime' && (
                      <p className="mt-1 text-xs text-amber-400">
                        Fixed renewal date mode requires annual renewal period
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is-active"
                    checked={typeFormData.is_active}
                    onChange={(e) => setTypeFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="is-active" className="ml-2 block text-sm text-slate-300">
                    Active
                  </label>
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingType(null);
                      setTypeFormData({
                        name: '',
                        description: '',
                        amount: '',
                        currency: 'AUD',
                        renewal_period: 'annual',
                        requires_association_fees: true,
                        replaces_membership_type_id: '',
                        is_active: true
                      });
                    }}
                    className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={editingType ? handleUpdateType : handleAddType}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {editingType ? 'Update' : 'Add'} Membership Type
                  </button>
                </div>
              </div>
            ) : (
              <>
                {loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-slate-400">Loading membership types...</p>
                  </div>
                ) : membershipTypes.length === 0 ? (
                  <div className="text-center py-8 bg-slate-800/30 rounded-lg border border-slate-700/50">
                    <DollarSign size={48} className="mx-auto mb-4 text-slate-600" />
                    <h3 className="text-lg font-medium text-slate-300 mb-2">No Membership Types</h3>
                    <p className="text-slate-400 mb-6">Create your first membership type to get started.</p>
                    <button
                      onClick={() => {
                        setEditingType(null);
                        setTypeFormData({
                          name: '',
                          description: '',
                          amount: '',
                          currency: 'AUD',
                          renewal_period: renewalMode === 'fixed' ? 'annual' : 'annual'
                        });
                        setShowForm(true);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add Membership Type
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {membershipTypes.map(type => {
                      const replacesType = type.replaces_membership_type_id
                        ? membershipTypes.find(t => t.id === type.replaces_membership_type_id)
                        : null;
                      return (
                        <div
                          key={type.id}
                          className={`p-4 rounded-lg border hover:bg-slate-800 transition-colors ${
                            type.is_active
                              ? 'bg-slate-800/70 border-slate-700/50'
                              : 'bg-slate-900/50 border-slate-700/30 opacity-60'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-medium text-white">{type.name}</h3>
                                {!type.is_active && (
                                  <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700 text-slate-400">
                                    Inactive
                                  </span>
                                )}
                              </div>
                              {type.description && (
                                <p className="text-sm text-slate-400 mt-1">{type.description}</p>
                              )}
                              <div className="flex items-center gap-4 mt-2 flex-wrap">
                                <div className="flex items-center gap-1 text-sm">
                                  <DollarSign size={14} className="text-green-400" />
                                  <span className="text-slate-300">
                                    {type.amount} {type.currency}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-sm">
                                  <Calendar size={14} className="text-blue-400" />
                                  <span className="text-slate-300">
                                    {type.renewal_period === 'annual' ? 'Annual' :
                                     type.renewal_period === 'monthly' ? 'Monthly' :
                                     type.renewal_period === 'quarterly' ? 'Quarterly' :
                                     'Lifetime'}
                                  </span>
                                </div>
                                {replacesType && (
                                  <div className="flex items-center gap-1 text-sm">
                                    <ArrowRightLeft size={14} className="text-amber-400" />
                                    <span className="text-amber-300">
                                      Replaces "{replacesType.name}"
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEditType(type)}
                                className="p-2 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
                              >
                                <Edit2 size={16} />
                              </button>
                              {(memberCountsByType[type.id] || 0) > 0 ? (
                                <div className="relative group">
                                  <button
                                    disabled
                                    className="p-2 rounded-lg text-slate-600 cursor-not-allowed"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                  <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-slate-900 text-xs text-slate-300 rounded-lg border border-slate-600 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                    {memberCountsByType[type.id]} member{memberCountsByType[type.id] === 1 ? '' : 's'} assigned - set inactive instead
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleDeleteType(type.id)}
                                  className="p-2 rounded-lg text-red-400 hover:bg-red-900/30 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
          )}

          {/* Email Templates Section */}
          {showEmails && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <FileText size={20} className="text-blue-400" />
                Email Templates
              </h2>
            </div>
            
            <div className="space-y-4">
              {/* Welcome Email Template */}
              <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-slate-200">Welcome Email</h4>
                  <button 
                    onClick={() => handleEditEmailTemplate('welcome')}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-sm text-slate-400">
                  Sent to new members when they join the club
                </p>
              </div>
              
              {/* Renewal Reminder Template */}
              <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-slate-200">Renewal Reminder</h4>
                  <button
                    onClick={() => handleEditEmailTemplate('renewal')}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-sm text-slate-400">
                  Sent to members when their membership is about to expire
                </p>
              </div>

              {/* Renewal Reminder (Unregistered) Template */}
              <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-slate-200">Renewal Reminder (Unregistered)</h4>
                  <button
                    onClick={() => handleEditEmailTemplate('renewal_reminder_unregistered')}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-sm text-slate-400">
                  Sent to members without an AlfiePRO account - includes bank details for direct payment
                </p>
              </div>
              
              {/* Renewal Confirmation Template */}
              <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-slate-200">Renewal Confirmation</h4>
                  <button
                    onClick={() => handleEditEmailTemplate('payment_confirmation')}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-sm text-slate-400">
                  Sent to members when their membership renewal payment is confirmed
                </p>
              </div>

              {/* Event Invitation Template */}
              <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-slate-200">Event Invitation</h4>
                  <button
                    onClick={() => handleEditEmailTemplate('event')}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                </div>
                <p className="text-sm text-slate-400">
                  Sent to members when a new event is created
                </p>
              </div>
            </div>
          </div>
          )}

          {/* Code of Conduct Section */}
          {showConduct && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <FileText size={20} className="text-blue-400" />
                Code of Conduct
              </h2>
            </div>

            <div className="bg-slate-700/50 rounded-lg border border-slate-600/50 p-1 mb-6">
              <WysiwygEditor
                value={codeOfConduct}
                onChange={setCodeOfConduct}
                darkMode={darkMode}
                height={400}
                placeholder="Enter your club's code of conduct here..."
              />
            </div>
            
            <div className="flex justify-end">
              <button
                onClick={handleSaveCodeOfConduct}
                disabled={saving}
                className="btn-primary-green flex items-center gap-2 px-6 py-3 text-white rounded-lg hover:shadow-lg hover:scale-105 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                {saving ? 'Saving...' : 'Save Code of Conduct'}
              </button>
            </div>
          </div>
          )}
        </div>
        )}

        {/* Right column - Payment & Renewal Settings */}
        {showRenewals && (
        <div className={`${!initialView ? 'lg:col-span-2' : ''} space-y-6`}>
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center gap-3 mb-6">
              <Calendar className="text-blue-400" size={24} />
              <h2 className="text-xl font-semibold text-white">Renewal Settings</h2>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Renewal Mode
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => handleRenewalModeChange('anniversary')}
                    className={`
                      flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors
                      ${renewalMode === 'anniversary'
                        ? 'bg-blue-600/20 border-blue-500/50 text-white'
                        : 'bg-slate-700/50 border-slate-600/50 text-slate-300 hover:bg-slate-700'}
                    `}
                  >
                    <Calendar size={24} className={renewalMode === 'anniversary' ? 'text-blue-400' : 'text-slate-400'} />
                    <span className="font-medium">Anniversary-based</span>
                    <span className="text-xs text-center">
                      Members renew on the anniversary of their join date
                    </span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => handleRenewalModeChange('fixed')}
                    className={`
                      flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors
                      ${renewalMode === 'fixed'
                        ? 'bg-blue-600/20 border-blue-500/50 text-white'
                        : 'bg-slate-700/50 border-slate-600/50 text-slate-300 hover:bg-slate-700'}
                    `}
                  >
                    <Calendar size={24} className={renewalMode === 'fixed' ? 'text-blue-400' : 'text-slate-400'} />
                    <span className="font-medium">Fixed Date</span>
                    <span className="text-xs text-center">
                      All memberships renew on the same date each year
                    </span>
                  </button>
                </div>
              </div>
              
              {renewalMode === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-3">
                    Fixed Renewal Date
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <select
                      value={fixedRenewalDate.split('-')[0]}
                      onChange={(e) => {
                        const month = e.target.value.padStart(2, '0');
                        const day = fixedRenewalDate.split('-')[1];
                        handleFixedRenewalDateChange(month, day);
                      }}
                      className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="01">January</option>
                      <option value="02">February</option>
                      <option value="03">March</option>
                      <option value="04">April</option>
                      <option value="05">May</option>
                      <option value="06">June</option>
                      <option value="07">July</option>
                      <option value="08">August</option>
                      <option value="09">September</option>
                      <option value="10">October</option>
                      <option value="11">November</option>
                      <option value="12">December</option>
                    </select>
                    
                    <select
                      value={fixedRenewalDate.split('-')[1]}
                      onChange={(e) => {
                        const month = fixedRenewalDate.split('-')[0];
                        const day = e.target.value.padStart(2, '0');
                        handleFixedRenewalDateChange(month, day);
                      }}
                      className="px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                        <option key={day} value={day.toString().padStart(2, '0')}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm text-slate-400 mt-2">
                    All memberships will renew on {formatFixedRenewalDate(fixedRenewalDate)} each year
                  </p>
                </div>
              )}
              
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRenewEnabled}
                    onChange={(e) => handleAutoRenewToggle(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-700 border-slate-500"
                  />
                  <span className="text-sm text-slate-300">Enable automatic renewals</span>
                </label>
                <p className="text-xs text-slate-400 mt-1 ml-6">
                  Members will be charged automatically when their membership expires.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Send renewal notifications
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={renewalNotificationDays}
                    onChange={(e) => handleNotificationDaysChange(parseInt(e.target.value) || 30)}
                    className="w-20 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="90"
                  />
                  <span className="text-slate-300">days before expiry</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Members will receive email and in-app notifications reminding them to renew their membership
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Grace period after expiry
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={renewalGracePeriodDays}
                    onChange={(e) => {
                      setRenewalGracePeriodDays(parseInt(e.target.value) || 0);
                      setHasUnsavedChanges(true);
                    }}
                    className="w-20 px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    max="90"
                  />
                  <span className="text-slate-300">days</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Members can still renew during this period after their membership expires. Set to 0 for no grace period.
                </p>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleSaveSettings}
                  disabled={saving}
                  className="btn-primary-green w-full flex items-center justify-center gap-2 px-6 py-3 text-white rounded-lg hover:shadow-lg hover:scale-105 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={18} />
                  {saving ? 'Saving...' : 'Save Renewal Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Email Template Editor Modal */}
      {activeEmailTemplate && (
        <EmailTemplateEditor
          isOpen={!!activeEmailTemplate}
          onClose={() => setActiveEmailTemplate(null)}
          templateKey={activeEmailTemplate}
          initialSubject={emailTemplates[activeEmailTemplate as keyof typeof emailTemplates].subject}
          initialBody={emailTemplates[activeEmailTemplate as keyof typeof emailTemplates].body}
          onSave={handleSaveEmailTemplate}
          onRestoreDefault={handleRestoreDefaultTemplate}
          onSendTest={handleSendTestEmail}
          darkMode={darkMode}
        />
      )}

      {/* Fixed Date Confirmation Modal */}
      {showConfirmFixedDate && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Confirm Fixed Renewal Date</h3>
            
            <p className="text-slate-300 mb-6">
              Are you sure you want to switch to a fixed renewal date? This will:
            </p>
            
            <ul className="list-disc pl-5 mb-6 space-y-2 text-slate-300">
              <li>Set all membership types to annual renewal only (except lifetime memberships)</li>
              <li>Update all active members to renew on {formatFixedRenewalDate(fixedRenewalDate)} each year</li>
              <li>Apply to all future memberships</li>
            </ul>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmFixedDate(false)}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
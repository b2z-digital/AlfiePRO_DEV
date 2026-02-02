import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign, Plus, Edit2, Trash2, Save, X, Settings, Receipt, Tag, Percent, Users, CreditCard, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { CircularCheckbox } from '../ui/CircularCheckbox';
import { useNotifications } from '../../contexts/NotificationContext';
import { StripeConnectionChoiceModal } from '../StripeConnectionChoiceModal';
import { StripeConnectionPreloaderModal } from '../StripeConnectionPreloaderModal';

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  currency: string;
  is_default: boolean;
  is_active: boolean;
}

interface TransactionSettings {
  invoice_title: string;
  organization_number: string;
  invoice_prefix: string;
  deposit_prefix: string;
  expense_prefix: string;
  invoice_next_number: number;
  deposit_next_number: number;
  expense_next_number: number;
  footer_information: string;
  payment_information: string;
  opening_balance: number;
  opening_balance_date: string | null;
}

interface BudgetCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  description?: string;
  is_active: boolean;
  is_system?: boolean;
  system_key?: string;
  tax_rate_id?: string;
}

interface FinanceSettingsPageProps {
  darkMode: boolean;
  associationId?: string;
  associationType?: 'state' | 'national';
  initialTab?: 'taxes' | 'transactions' | 'categories' | 'membership';
  initialSection?: 'payment';
}

export const FinanceSettingsPage: React.FC<FinanceSettingsPageProps> = ({ darkMode, associationId, associationType, initialTab = 'taxes', initialSection }) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const [activeTab, setActiveTab] = useState<'taxes' | 'transactions' | 'categories' | 'membership'>(initialTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tax rates state
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [editingTax, setEditingTax] = useState<TaxRate | null>(null);
  const [taxForm, setTaxForm] = useState({ name: '', rate: 0, currency: 'AUD' });

  // Common currency codes
  const currencies = [
    { code: 'AUD', name: 'Australian Dollar' },
    { code: 'USD', name: 'US Dollar' },
    { code: 'EUR', name: 'Euro' },
    { code: 'GBP', name: 'British Pound' },
    { code: 'CAD', name: 'Canadian Dollar' },
    { code: 'JPY', name: 'Japanese Yen' },
    { code: 'CHF', name: 'Swiss Franc' },
    { code: 'CNY', name: 'Chinese Yuan' },
    { code: 'NZD', name: 'New Zealand Dollar' },
    { code: 'SGD', name: 'Singapore Dollar' },
    { code: 'HKD', name: 'Hong Kong Dollar' },
    { code: 'SEK', name: 'Swedish Krona' },
    { code: 'NOK', name: 'Norwegian Krone' },
    { code: 'DKK', name: 'Danish Krone' },
    { code: 'INR', name: 'Indian Rupee' },
    { code: 'KRW', name: 'South Korean Won' },
    { code: 'MXN', name: 'Mexican Peso' },
    { code: 'BRL', name: 'Brazilian Real' },
    { code: 'ZAR', name: 'South African Rand' },
    { code: 'RUB', name: 'Russian Ruble' }
  ];

  // Transaction settings state
  const [transactionSettings, setTransactionSettings] = useState<TransactionSettings>({
    invoice_title: 'INVOICE',
    organization_number: '',
    invoice_prefix: 'INV-',
    deposit_prefix: 'DEP-',
    expense_prefix: 'EXP-',
    invoice_next_number: 1,
    deposit_next_number: 1,
    expense_next_number: 1,
    footer_information: '',
    payment_information: '',
    opening_balance: 0,
    opening_balance_date: null
  });

  // Categories state
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    type: 'expense' as 'income' | 'expense',
    description: '',
    tax_rate_id: ''
  });

  // Membership fee state (for associations)
  const [membershipFeePerMember, setMembershipFeePerMember] = useState<number>(15.00);
  const [savingMembership, setSavingMembership] = useState(false);

  // Membership integration state
  const [membershipConfig, setMembershipConfig] = useState({
    default_membership_category_id: '',
    stripe_enabled: false,
    stripe_account_name: ''
  });
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showConnectionChoiceModal, setShowConnectionChoiceModal] = useState(false);
  const [showStripePreloader, setShowStripePreloader] = useState(false);
  const [selectedConnectionType, setSelectedConnectionType] = useState<'oauth' | 'express'>('express');

  const { addNotification } = useNotifications();

  const handleConnectStripe = async (connectionType: 'oauth' | 'express') => {
    if (!currentClub?.clubId) return;

    try {
      // Store connection type and show preloader
      setSelectedConnectionType(connectionType);
      setShowStripePreloader(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Store session tokens and club ID for OAuth callback
      // Use multiple storage methods to handle domain mismatches (www vs non-www)
      if (connectionType === 'oauth') {
        // 1. localStorage (works if same domain)
        localStorage.setItem('stripe_oauth_token', session.access_token);
        localStorage.setItem('stripe_oauth_refresh_token', session.refresh_token || '');
        localStorage.setItem('stripe_oauth_club_id', currentClub.clubId);
        localStorage.setItem('stripe_oauth_timestamp', Date.now().toString());

        // 2. sessionStorage (works if same domain)
        sessionStorage.setItem('stripe_oauth_token', session.access_token);
        sessionStorage.setItem('stripe_oauth_refresh_token', session.refresh_token || '');
        sessionStorage.setItem('stripe_oauth_club_id', currentClub.clubId);
        sessionStorage.setItem('stripe_oauth_timestamp', Date.now().toString());

        // 3. Cookie (works across www/non-www subdomains if domain is set correctly)
        const domain = window.location.hostname.includes('alfiepro.com.au') ? '.alfiepro.com.au' : window.location.hostname;
        document.cookie = `stripe_oauth_token=${session.access_token}; path=/; domain=${domain}; max-age=600; SameSite=Lax`;
        document.cookie = `stripe_oauth_refresh_token=${session.refresh_token || ''}; path=/; domain=${domain}; max-age=600; SameSite=Lax`;
        document.cookie = `stripe_oauth_club_id=${currentClub.clubId}; path=/; domain=${domain}; max-age=600; SameSite=Lax`;
        document.cookie = `stripe_oauth_timestamp=${Date.now()}; path=/; domain=${domain}; max-age=600; SameSite=Lax`;

        console.log('✅ Stored OAuth session data in localStorage, sessionStorage, AND cookies:', {
          hasToken: !!session.access_token,
          hasRefreshToken: !!session.refresh_token,
          clubId: currentClub.clubId,
          timestamp: Date.now(),
          currentDomain: window.location.hostname,
          cookieDomain: domain
        });
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-stripe`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            club_id: currentClub.clubId,
            connection_type: connectionType
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect to Stripe');
      }

      const data = await response.json();

      // Redirect to Stripe onboarding or OAuth after preloader completes
      if (data.url) {
        // Store the URL to redirect to after preloader
        sessionStorage.setItem('stripe_redirect_url', data.url);
      }
    } catch (err) {
      console.error('Error connecting to Stripe:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect to Stripe');
      setShowStripePreloader(false);
      addNotification('error', 'Failed to connect to Stripe. Please try again.');
    }
  };

  const handlePreloaderComplete = () => {
    setShowStripePreloader(false);
    const redirectUrl = sessionStorage.getItem('stripe_redirect_url');
    if (redirectUrl) {
      sessionStorage.removeItem('stripe_redirect_url');
      window.location.href = redirectUrl;
    }
  };

  const handleDisconnectStripe = async () => {
    if (!currentClub?.clubId) return;

    try {
      setSaving(true);
      setError(null);

      // Clear stripe_account_id from clubs table
      const { error: updateError } = await supabase
        .from('clubs')
        .update({
          stripe_account_id: null,
          stripe_account_name: null,
          stripe_enabled: false
        })
        .eq('id', currentClub.clubId);

      if (updateError) throw updateError;

      // Update local state
      setMembershipConfig({
        ...membershipConfig,
        stripe_enabled: false,
        stripe_account_name: ''
      });

      setShowDisconnectModal(false);
      addNotification('success', 'Stripe account disconnected successfully. You can now connect a different account.');
    } catch (err) {
      console.error('Error disconnecting Stripe:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect Stripe');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (isAssociation || currentClub?.clubId) {
      loadFinanceSettings();
    }

    // Check if returning from Stripe Connect
    const urlParams = new URLSearchParams(window.location.search);

    // Handle Express account success
    if (urlParams.get('stripe_connected') === 'true') {
      addNotification('success', 'Stripe account connected successfully! You can now accept card payments.');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Handle OAuth callback
    if (urlParams.get('oauth_callback') === 'true') {
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code && state && currentClub?.clubId) {
        handleOAuthCallback(code, state);
      }
    }
  }, [currentClub, associationId, associationType]);

  const handleOAuthCallback = async (code: string, state: string) => {
    try {
      setSaving(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/connect-stripe`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            club_id: state,
            code: code,
            state: state
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect Stripe account');
      }

      const data = await response.json();

      if (data.success) {
        addNotification('success', 'Stripe account connected successfully! You can now accept card payments.');
        // Reload settings to show connected state
        await loadFinanceSettings();
      }

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('Error processing OAuth callback:', err);
      addNotification('error', 'Failed to connect Stripe account. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const loadFinanceSettings = async () => {
    if (!isAssociation && !currentClub?.clubId) return;

    try {
      setLoading(true);
      setError(null);

      if (isAssociation) {
        // Load association tax rates
        const { data: taxRatesData, error: taxRatesError } = await supabase
          .from('association_tax_rates')
          .select('id, name, rate, currency, is_default, is_active')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('name');

        if (taxRatesError) throw taxRatesError;
        setTaxRates(taxRatesData || []);
      } else {
        // Load tax rates from Supabase for clubs
        const { data: taxRatesData, error: taxRatesError } = await supabase
          .from('tax_rates')
          .select('id, name, rate, currency, is_default, is_active')
          .eq('club_id', currentClub.clubId)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('name');

        if (taxRatesError) throw taxRatesError;
        setTaxRates(taxRatesData || []);
      }

      // Load transaction settings
      if (isAssociation) {
        // Load from association_finance_settings for associations
        const { data: financeSettingsData, error: financeSettingsError } = await supabase
          .from('association_finance_settings')
          .select('*')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .maybeSingle();

        if (financeSettingsError && financeSettingsError.code !== 'PGRST116') {
          throw financeSettingsError;
        }

        if (financeSettingsData) {
          setTransactionSettings({
            invoice_title: financeSettingsData.invoice_title || 'INVOICE',
            organization_number: financeSettingsData.organization_number || '',
            invoice_prefix: financeSettingsData.invoice_prefix || 'INV-',
            deposit_prefix: financeSettingsData.deposit_prefix || 'DEP-',
            expense_prefix: financeSettingsData.expense_prefix || 'EXP-',
            invoice_next_number: financeSettingsData.invoice_next_number || 1,
            deposit_next_number: financeSettingsData.deposit_next_number || 1,
            expense_next_number: financeSettingsData.expense_next_number || 1,
            footer_information: financeSettingsData.footer_information || '',
            payment_information: financeSettingsData.payment_information || '',
            opening_balance: financeSettingsData.opening_balance || 0,
            opening_balance_date: financeSettingsData.opening_balance_date || null
          });
        }
      } else if (currentClub?.clubId) {
        // Load from club_finance_settings for clubs
        const { data: financeSettingsData, error: financeSettingsError } = await supabase
          .from('club_finance_settings')
          .select('*')
          .eq('club_id', currentClub.clubId)
          .maybeSingle();

        if (financeSettingsError && financeSettingsError.code !== 'PGRST116') {
          throw financeSettingsError;
        }

        if (financeSettingsData) {
          setTransactionSettings({
            invoice_title: financeSettingsData.invoice_title || 'INVOICE',
            organization_number: financeSettingsData.organization_number || '',
            invoice_prefix: financeSettingsData.invoice_prefix || 'INV-',
            deposit_prefix: financeSettingsData.deposit_prefix || 'DEP-',
            expense_prefix: financeSettingsData.expense_prefix || 'EXP-',
            invoice_next_number: financeSettingsData.invoice_next_number || 1,
            deposit_next_number: financeSettingsData.deposit_next_number || 1,
            expense_next_number: financeSettingsData.expense_next_number || 1,
            footer_information: financeSettingsData.footer_information || '',
            payment_information: financeSettingsData.payment_information || '',
            opening_balance: financeSettingsData.opening_balance || 0,
            opening_balance_date: financeSettingsData.opening_balance_date || null
          });
        }

        // Load membership integration config from clubs table
        const { data: clubData, error: clubError } = await supabase
          .from('clubs')
          .select('default_membership_category_id, stripe_enabled, stripe_account_id, stripe_account_name')
          .eq('id', currentClub.clubId)
          .single();

        if (clubError) throw clubError;

        if (clubData) {
          setMembershipConfig({
            default_membership_category_id: clubData.default_membership_category_id || '',
            stripe_enabled: clubData.stripe_enabled || !!clubData.stripe_account_id,
            stripe_account_name: clubData.stripe_account_name || ''
          });
        }
      }

      // Load budget categories
      if (isAssociation) {
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('association_budget_categories')
          .select('*')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('is_active', true)
          .order('is_system', { ascending: false})
          .order('name');

        if (categoriesError) throw categoriesError;
        setCategories(categoriesData || []);

        // Load membership fee for associations
        const feeColumnName = associationType === 'state' ? 'state_fee_per_member' : 'national_fee_per_member';
        const tableName = associationType === 'state' ? 'state_associations' : 'national_associations';

        const { data: feeData, error: feeError } = await supabase
          .from(tableName)
          .select(feeColumnName)
          .eq('id', associationId)
          .maybeSingle();

        if (!feeError && feeData) {
          setMembershipFeePerMember(parseFloat((feeData as any)[feeColumnName] || (associationType === 'state' ? '15.00' : '5.00')));
        } else {
          setMembershipFeePerMember(associationType === 'state' ? 15.00 : 5.00);
        }
      } else {
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('budget_categories')
          .select('*')
          .eq('club_id', currentClub.clubId)
          .eq('is_active', true)
          .order('is_system', { ascending: false })
          .order('name');

        if (categoriesError) throw categoriesError;
        setCategories(categoriesData || []);
      }

    } catch (err) {
      console.error('Error loading finance settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load finance settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTaxRate = async () => {
    if (!taxForm.name || taxForm.rate < 0) return;
    if (!isAssociation && !currentClub?.clubId) return;
    if (isAssociation && (!associationId || !associationType)) return;

    try {
      setSaving(true);
      setError(null);

      const tableName = isAssociation ? 'association_tax_rates' : 'tax_rates';

      if (editingTax) {
        // Update existing tax rate
        const { error } = await supabase
          .from(tableName)
          .update({
            name: taxForm.name,
            rate: taxForm.rate,
            currency: taxForm.currency
          })
          .eq('id', editingTax.id);

        if (error) throw error;
      } else {
        // Add new tax rate
        const isFirstTaxRate = taxRates.length === 0;
        const insertData: any = {
          name: taxForm.name,
          rate: taxForm.rate,
          currency: taxForm.currency,
          is_default: isFirstTaxRate,
          is_active: true
        };

        if (isAssociation) {
          insertData.association_id = associationId;
          insertData.association_type = associationType;
        } else {
          insertData.club_id = currentClub?.clubId;
        }

        const { error } = await supabase
          .from(tableName)
          .insert(insertData);

        if (error) throw error;
      }

      // Reload data from database
      await loadFinanceSettings();
      
      addNotification('success', editingTax ? 'Tax rate updated successfully' : 'Tax rate added successfully');
      setShowTaxModal(false);
      setEditingTax(null);
      setTaxForm({ name: '', rate: 0, currency: 'AUD' });
    } catch (err) {
      console.error('Error saving tax rate:', err);
      setError(err instanceof Error ? err.message : 'Failed to save tax rate');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefaultTaxRate = async (taxRateId: string) => {
    if (!isAssociation && !currentClub?.clubId) return;
    if (isAssociation && (!associationId || !associationType)) return;

    try {
      setError(null);

      const tableName = isAssociation ? 'association_tax_rates' : 'tax_rates';

      // First, set all tax rates to not default
      let query = supabase
        .from(tableName)
        .update({ is_default: false })
        .neq('id', taxRateId);

      if (isAssociation) {
        query = query.eq('association_id', associationId).eq('association_type', associationType);
      } else {
        query = query.eq('club_id', currentClub.clubId);
      }

      const { error: updateAllError } = await query;
      if (updateAllError) throw updateAllError;

      // Then set the selected one as default
      const { error: updateSelectedError } = await supabase
        .from(tableName)
        .update({ is_default: true })
        .eq('id', taxRateId);

      if (updateSelectedError) throw updateSelectedError;

      // Reload data from database
      await loadFinanceSettings();
      
    } catch (err) {
      console.error('Error setting default tax rate:', err);
      setError(err instanceof Error ? err.message : 'Failed to set default tax rate');
    }
  };

  const handleDeleteTaxRate = async (taxRateId: string) => {
    if (taxRates.length <= 1) {
      setError('Cannot delete the only tax rate');
      return;
    }

    if (!confirm('Are you sure you want to delete this tax rate?')) return;

    try {
      setError(null);

      const tableName = isAssociation ? 'association_tax_rates' : 'tax_rates';
      const taxRateToDelete = taxRates.find(rate => rate.id === taxRateId);

      // Soft delete the tax rate
      const { error } = await supabase
        .from(tableName)
        .update({ is_active: false })
        .eq('id', taxRateId);

      if (error) throw error;

      // If we're deleting the default tax rate, make the first remaining one default
      if (taxRateToDelete?.is_default) {
        const remainingRates = taxRates.filter(rate => rate.id !== taxRateId);
        if (remainingRates.length > 0) {
          await handleSetDefaultTaxRate(remainingRates[0].id);
        }
      }
      
      // Reload data from database
      await loadFinanceSettings();
      
    } catch (err) {
      console.error('Error deleting tax rate:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete tax rate');
    }
  };

  const handleSaveTransactionSettings = async () => {
    if (!isAssociation && !currentClub?.clubId) return;

    try {
      setSaving(true);
      setError(null);

      // Validate invoice_next_number to prevent conflicts
      if (transactionSettings.invoice_next_number < 1) {
        setError('Invoice next number must be at least 1');
        return;
      }

      if (isAssociation) {
        // Save to association_finance_settings for associations
        const { error } = await supabase
          .from('association_finance_settings')
          .upsert({
            association_id: associationId,
            association_type: associationType,
            invoice_title: transactionSettings.invoice_title,
            organization_number: transactionSettings.organization_number,
            invoice_prefix: transactionSettings.invoice_prefix,
            deposit_prefix: transactionSettings.deposit_prefix,
            expense_prefix: transactionSettings.expense_prefix,
            invoice_next_number: transactionSettings.invoice_next_number,
            deposit_next_number: transactionSettings.deposit_next_number,
            expense_next_number: transactionSettings.expense_next_number,
            footer_information: transactionSettings.footer_information,
            payment_information: transactionSettings.payment_information
          }, {
            onConflict: 'association_id,association_type'
          });

        if (error) throw error;
      } else {
        // Check if the proposed next number would conflict with existing invoices (clubs only)
        const proposedNumber = `${transactionSettings.invoice_prefix}${transactionSettings.invoice_next_number.toString().padStart(3, '0')}`;
        const { data: existingInvoice, error: checkError } = await supabase
          .from('invoices')
          .select('invoice_number')
          .eq('club_id', currentClub.clubId)
          .eq('invoice_number', proposedNumber)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }

        if (existingInvoice) {
          setError(`Invoice number ${proposedNumber} already exists. Please choose a higher number.`);
          return;
        }

        // Upsert the finance settings for clubs
        const { error } = await supabase
          .from('club_finance_settings')
          .upsert({
            club_id: currentClub.clubId,
            invoice_title: transactionSettings.invoice_title,
            organization_number: transactionSettings.organization_number,
            invoice_prefix: transactionSettings.invoice_prefix,
            deposit_prefix: transactionSettings.deposit_prefix,
            expense_prefix: transactionSettings.expense_prefix,
            invoice_next_number: transactionSettings.invoice_next_number,
            deposit_next_number: transactionSettings.deposit_next_number,
            expense_next_number: transactionSettings.expense_next_number,
            footer_information: transactionSettings.footer_information,
            payment_information: transactionSettings.payment_information,
            opening_balance: transactionSettings.opening_balance,
            opening_balance_date: transactionSettings.opening_balance_date
          }, {
            onConflict: 'club_id'
          });

        if (error) throw error;
      }

      addNotification('success', 'Transaction settings saved successfully');
      
    } catch (err) {
      console.error('Error saving transaction settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to save transaction settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!categoryForm.name) return;
    if (!isAssociation && !currentClub?.clubId) return;

    try {
      setSaving(true);
      setError(null);

      const tableName = isAssociation ? 'association_budget_categories' : 'budget_categories';

      if (editingCategory) {
        // Update existing category
        const updateData: any = {
          name: categoryForm.name,
          type: categoryForm.type,
          description: categoryForm.description || null,
          tax_rate_id: categoryForm.tax_rate_id || null
        };

        const { error } = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', editingCategory.id);

        if (error) throw error;
      } else {
        // Add new category
        const insertData: any = {
          name: categoryForm.name,
          type: categoryForm.type,
          description: categoryForm.description || null,
          is_active: true,
          tax_rate_id: categoryForm.tax_rate_id || null
        };

        if (isAssociation) {
          insertData.association_id = associationId;
          insertData.association_type = associationType;
        } else {
          insertData.club_id = currentClub.clubId;
        }

        const { error } = await supabase
          .from(tableName)
          .insert(insertData);

        if (error) throw error;
      }

      // Reload data from database
      await loadFinanceSettings();

      addNotification('success', editingCategory ? 'Category updated successfully' : 'Category added successfully');
      setShowCategoryModal(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', type: 'expense', description: '', tax_rate_id: '' });
    } catch (err) {
      console.error('Error saving category:', err);
      setError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);

    if (category?.is_system) {
      setError('System categories cannot be deleted');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      setError(null);

      const tableName = isAssociation ? 'association_budget_categories' : 'budget_categories';

      // Soft delete the category
      const { error } = await supabase
        .from(tableName)
        .update({ is_active: false })
        .eq('id', categoryId);

      if (error) throw error;

      // Reload data from database
      await loadFinanceSettings();
    } catch (err) {
      console.error('Error deleting category:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    }
  };

  const handleUpdateCategoryTaxRate = async (categoryId: string, taxRateId: string) => {
    try {
      setError(null);

      const tableName = isAssociation ? 'association_budget_categories' : 'budget_categories';
      const { error } = await supabase
        .from(tableName)
        .update({ tax_rate_id: taxRateId || null })
        .eq('id', categoryId);

      if (error) throw error;

      // Update local state
      setCategories(categories.map(cat =>
        cat.id === categoryId
          ? { ...cat, tax_rate_id: taxRateId || undefined }
          : cat
      ));
    } catch (err) {
      console.error('Error updating category tax rate:', err);
      setError(err instanceof Error ? err.message : 'Failed to update category tax rate');
    }
  };

  const saveMembershipConfig = async () => {
    if (!currentClub?.clubId) return;

    try {
      setSaving(true);
      setError(null);

      const { error: updateError } = await supabase
        .from('clubs')
        .update({
          default_membership_category_id: membershipConfig.default_membership_category_id || null,
        })
        .eq('id', currentClub.clubId);

      if (updateError) throw updateError;

      addNotification('success', 'Membership integration settings saved');
    } catch (err) {
      console.error('Error saving membership config:', err);
      addNotification('error', 'Failed to save settings');
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveMembershipFee = async () => {
    if (!isAssociation || !associationId || !associationType) return;

    try {
      setSavingMembership(true);
      setError(null);

      const feeColumnName = associationType === 'state' ? 'state_fee_per_member' : 'national_fee_per_member';
      const tableName = associationType === 'state' ? 'state_associations' : 'national_associations';

      const { error } = await supabase
        .from(tableName)
        .update({ [feeColumnName]: membershipFeePerMember })
        .eq('id', associationId);

      if (error) throw error;

      addNotification('success', 'Membership fee settings saved successfully');
    } catch (err) {
      console.error('Error saving membership fee:', err);
      setError(err instanceof Error ? err.message : 'Failed to save membership fee');
    } finally {
      setSavingMembership(false);
    }
  };

  const renderMembershipTab = () => {
    if (isAssociation) {
      // Association membership fee configuration
      const childEntityType = associationType === 'state' ? 'clubs' : 'state associations';

      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Membership Fee Configuration</h3>
            <p className="text-slate-400 text-sm">
              Set the membership fee that {childEntityType} pay to your {associationType?.toLowerCase()} association per member
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              {associationType} Fee Per Member
            </label>
            <div className="flex items-center gap-2">
              <span className="text-2xl text-slate-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={membershipFeePerMember}
                onChange={(e) => setMembershipFeePerMember(parseFloat(e.target.value) || 0)}
                className="px-4 py-2 rounded-lg border bg-slate-700 border-slate-600 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent w-32"
              />
              <span className="text-sm text-slate-400">per member</span>
            </div>
            <p className="text-sm text-slate-500 mt-2">
              This amount will be automatically charged to {childEntityType} for each member and tracked for remittance
            </p>
          </div>

          <div className="p-4 rounded-lg bg-blue-900/20 border-blue-800 border">
            <p className="text-sm text-blue-300 font-medium">How it works</p>
            <p className="text-sm text-blue-400 mt-1">
              When a {childEntityType === 'clubs' ? 'club member' : 'state association member'} pays their membership fee,
              ${membershipFeePerMember.toFixed(2)} is automatically allocated to your {associationType?.toLowerCase()} association
              and tracked in the remittances system.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleSaveMembershipFee}
              disabled={savingMembership}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {savingMembership ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      );
    }

    // Club membership payment integration
    const incomeCategories = categories.filter(c => c.type === 'income');

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Membership Payment Integration</h3>
          <p className="text-slate-400 text-sm">
            Configure how membership payments are tracked in your finance system. All approved membership applications will automatically create transactions in your finance records.
          </p>
        </div>

        {/* Stripe Status */}
        <div className="bg-slate-800/70 rounded-lg border border-slate-700 p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              {membershipConfig.stripe_enabled ? (
                <div className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                  <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"/>
                  </svg>
                </div>
              ) : (
                <CreditCard className="text-slate-500" size={24} />
              )}
              <div className="flex-1">
                <h4 className="font-medium text-white mb-1">Stripe Integration</h4>
                {membershipConfig.stripe_enabled && membershipConfig.stripe_account_name ? (
                  <div className="space-y-1">
                    <p className="text-sm text-green-400 font-medium">
                      Connected: {membershipConfig.stripe_account_name}
                    </p>
                    <p className="text-xs text-slate-400">
                      Card payments will automatically create finance transactions.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    {membershipConfig.stripe_enabled
                      ? 'Stripe is connected. Card payments will automatically create finance transactions.'
                      : 'Stripe not connected. Set up Stripe Connect to accept card payments.'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {membershipConfig.stripe_enabled ? (
                <>
                  <CheckCircle2 className="text-green-400" size={20} />
                  <button
                    onClick={() => setShowDisconnectModal(true)}
                    className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <>
                  <AlertCircle className="text-slate-500" size={20} />
                  <button
                    onClick={() => setShowConnectionChoiceModal(true)}
                    disabled={saving}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Connecting...' : 'Connect to Stripe'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Default Category */}
        <div className="bg-slate-800/70 rounded-lg border border-slate-700 p-4">
          <label className="block text-sm font-medium text-slate-300 mb-3">
            Default Membership Income Category
          </label>
          <select
            value={membershipConfig.default_membership_category_id}
            onChange={(e) => setMembershipConfig({ ...membershipConfig, default_membership_category_id: e.target.value })}
            className="w-full bg-slate-900/50 border border-slate-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a category...</option>
            {incomeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <p className="text-slate-400 text-xs mt-2">
            All membership payment transactions will be assigned to this category. Create a "Membership Fees" or "Membership Income" category in the Categories tab if you don't have one.
          </p>
        </div>

        {/* Info Panel */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
            <div className="text-sm text-blue-300">
              <p className="font-medium mb-2">How Membership Integration Works:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>Bank Transfer:</strong> Creates a pending transaction when application is approved. Mark as paid in Payment Reconciliation.</li>
                <li><strong>Credit Card:</strong> Creates a completed transaction automatically when Stripe payment succeeds.</li>
                <li><strong>Stripe Fees:</strong> Automatically calculated and recorded (1.75% + $0.30 AUD)</li>
                <li><strong>Category Assignment:</strong> All transactions are automatically assigned to your selected default category</li>
                <li><strong>Tax:</strong> Tax rates configured in the "Taxes" tab are applied based on the category's tax settings</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={saveMembershipConfig}
            disabled={saving || !membershipConfig.default_membership_category_id}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    );
  };

  const renderTaxesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Tax Configuration</h3>
          <p className="text-slate-400 text-sm">Manage tax rates for your organization</p>
        </div>
        <button
          onClick={() => {
            setTaxForm({ name: '', rate: 0, currency: 'AUD' });
            setEditingTax(null);
            setShowTaxModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Tax Rate
        </button>
      </div>

      <div className="grid gap-4">
        {taxRates.map((taxRate) => (
          <div
            key={taxRate.id}
            className={`
              p-4 rounded-lg border transition-all
              ${taxRate.is_default 
                ? darkMode 
                  ? 'bg-blue-900/20 border-blue-600/50' 
                  : 'bg-blue-50 border-blue-200'
                : darkMode 
                  ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700/70' 
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <CircularCheckbox
                  checked={taxRate.is_default}
                  onChange={() => handleSetDefaultTaxRate(taxRate.id)}
                  size="md"
                />
                <div>
                  <h4 className={`font-medium ${taxRate.is_default ? 'text-blue-400' : 'text-white'}`}>
                    {taxRate.name}
                  </h4>
                  <p className="text-slate-400 text-sm">
                    {(taxRate.rate * 100).toFixed(1)}% • {taxRate.currency}
                  </p>
                  {taxRate.is_default && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600/20 text-blue-400 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Default
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTaxForm({ 
                      name: taxRate.name, 
                      rate: taxRate.rate,
                      currency: taxRate.currency 
                    });
                    setEditingTax(taxRate);
                    setShowTaxModal(true);
                  }}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                {taxRates.length > 1 && (
                  <button
                    onClick={() => handleDeleteTaxRate(taxRate.id)}
                    className="p-2 text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {taxRates.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <Percent size={48} className="mx-auto mb-4 opacity-50" />
            <p>No tax rates configured yet</p>
            <p className="text-sm">Create your first tax rate to get started</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderTransactionsTab = () => {
    // If showing only payment section, render just that
    if (initialSection === 'payment') {
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Payment Information</h3>
            <p className="text-slate-400 text-sm">Configure payment details for invoices and documents</p>
          </div>

          <div className="grid gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Payment Information
              </label>
              <textarea
                value={transactionSettings.payment_information}
                onChange={(e) => setTransactionSettings({
                  ...transactionSettings,
                  payment_information: e.target.value
                })}
                rows={6}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
                placeholder="Enter your payment details here (e.g., bank name, BSB, account number)"
              />
              <p className="text-xs text-slate-400 mt-1">
                This information will appear on all invoices and documents being sent to your contacts.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-600/30">
              <p className="text-blue-400 text-sm">
                <strong>Note:</strong> Your club's logo from the club profile will automatically be used on all invoices and documents.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSaveTransactionSettings}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 disabled:opacity-50"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Payment Information'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Otherwise render the full document settings
    return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Document Settings</h3>
        <p className="text-slate-400 text-sm">Configure how invoices, expenses and deposits are formatted</p>
      </div>

      <div className="grid gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Invoice Title
            </label>
            <input
              type="text"
              value={transactionSettings.invoice_title}
              onChange={(e) => setTransactionSettings({
                ...transactionSettings,
                invoice_title: e.target.value
              })}
              className={`
                w-full px-3 py-2 rounded-lg border
                ${darkMode 
                  ? 'bg-slate-700 border-slate-600 text-white' 
                  : 'bg-white border-slate-300 text-slate-900'}
              `}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Organization Number
            </label>
            <input
              type="text"
              value={transactionSettings.organization_number}
              onChange={(e) => setTransactionSettings({
                ...transactionSettings,
                organization_number: e.target.value
              })}
              className={`
                w-full px-3 py-2 rounded-lg border
                ${darkMode 
                  ? 'bg-slate-700 border-slate-600 text-white' 
                  : 'bg-white border-slate-300 text-slate-900'}
              `}
            />
          </div>
        </div>

        {/* Opening Balance */}
        <div className="border border-slate-600 rounded-lg p-4">
          <h4 className="text-md font-medium text-white mb-2">Opening Balance</h4>
          <p className="text-sm text-slate-400 mb-4">
            Set your starting bank balance to track your current financial position accurately
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Opening Balance Amount
              </label>
              <div className="relative">
                <span className={`absolute left-3 top-2.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>$</span>
                <input
                  type="number"
                  step="0.01"
                  value={transactionSettings.opening_balance}
                  onChange={(e) => setTransactionSettings({
                    ...transactionSettings,
                    opening_balance: parseFloat(e.target.value) || 0
                  })}
                  className={`
                    w-full pl-7 pr-3 py-2 rounded-lg border
                    ${darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'}
                  `}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Balance Date
              </label>
              <input
                type="date"
                value={transactionSettings.opening_balance_date || ''}
                onChange={(e) => setTransactionSettings({
                  ...transactionSettings,
                  opening_balance_date: e.target.value || null
                })}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            </div>
          </div>
        </div>

        {/* Invoice Numbering */}
        <div className="border border-slate-600 rounded-lg p-4">
          <h4 className="text-md font-medium text-white mb-4">Invoice Numbering</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Number Prefix
              </label>
              <input
                type="text"
                value={transactionSettings.invoice_prefix}
                onChange={(e) => setTransactionSettings({
                  ...transactionSettings,
                  invoice_prefix: e.target.value
                })}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Next Number Starts From
              </label>
              <input
                type="number"
                value={transactionSettings.invoice_next_number}
                onChange={(e) => setTransactionSettings({
                  ...transactionSettings,
                  invoice_next_number: parseInt(e.target.value) || 1
                })}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            </div>
          </div>
        </div>

        {/* Deposit Numbering */}
        <div className="border border-slate-600 rounded-lg p-4">
          <h4 className="text-md font-medium text-white mb-4">Deposit Numbering</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Number Prefix
              </label>
              <input
                type="text"
                value={transactionSettings.deposit_prefix}
                onChange={(e) => setTransactionSettings({
                  ...transactionSettings,
                  deposit_prefix: e.target.value
                })}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Next Number Starts From
              </label>
              <input
                type="number"
                value={transactionSettings.deposit_next_number}
                onChange={(e) => setTransactionSettings({
                  ...transactionSettings,
                  deposit_next_number: parseInt(e.target.value) || 1
                })}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            </div>
          </div>
        </div>

        {/* Expense Numbering */}
        <div className="border border-slate-600 rounded-lg p-4">
          <h4 className="text-md font-medium text-white mb-4">Expense Numbering</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Number Prefix
              </label>
              <input
                type="text"
                value={transactionSettings.expense_prefix}
                onChange={(e) => setTransactionSettings({
                  ...transactionSettings,
                  expense_prefix: e.target.value
                })}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Next Number Starts From
              </label>
              <input
                type="number"
                value={transactionSettings.expense_next_number}
                onChange={(e) => setTransactionSettings({
                  ...transactionSettings,
                  expense_next_number: parseInt(e.target.value) || 1
                })}
                className={`
                  w-full px-3 py-2 rounded-lg border
                  ${darkMode 
                    ? 'bg-slate-700 border-slate-600 text-white' 
                    : 'bg-white border-slate-300 text-slate-900'}
                `}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Footer Information
          </label>
          <textarea
            value={transactionSettings.footer_information}
            onChange={(e) => setTransactionSettings({
              ...transactionSettings,
              footer_information: e.target.value
            })}
            rows={3}
            className={`
              w-full px-3 py-2 rounded-lg border
              ${darkMode 
                ? 'bg-slate-700 border-slate-600 text-white' 
                : 'bg-white border-slate-300 text-slate-900'}
            `}
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSaveTransactionSettings}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
    );
  };

  const renderCategoriesTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Financial Categories</h3>
          <p className="text-slate-400 text-sm">
            Categories allow your organization to categorise line items or transactions.
          </p>
          <p className="text-slate-400 text-xs italic mt-1">
            Tip: You can create as many categories as you like but we would suggest you keep them fairly broad so they're easy to follow.
          </p>
        </div>
        <button
          onClick={() => {
            setCategoryForm({ name: '', type: 'expense', description: '', tax_rate_id: '' });
            setEditingCategory(null);
            setShowCategoryModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200"
        >
          <Plus size={16} />
          New Category
        </button>
      </div>

      <div className="space-y-3">
        {categories.map((category) => (
          <div
            key={category.id}
            className={`
              flex items-center justify-between p-4 rounded-lg border
              ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-white border-slate-200'}
            `}
          >
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="text-white font-medium">{category.name}</span>
                <span className={`
                  px-2 py-1 text-xs rounded-full
                  ${category.type === 'income'
                    ? 'bg-green-600/20 text-green-400'
                    : 'bg-red-600/20 text-red-400'}
                `}>
                  {category.type}
                </span>
                {category.is_system && (
                  <span className="px-2 py-1 text-xs rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30">
                    System Category
                  </span>
                )}
              </div>
              {category.description && (
                <p className="text-slate-400 text-sm mt-1">{category.description}</p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-slate-400 text-sm">Tax:</span>
                <select
                  value={category.tax_rate_id || ''}
                  onChange={(e) => handleUpdateCategoryTaxRate(category.id, e.target.value)}
                  className={`
                    ml-2 px-2 py-1 rounded border text-sm
                    ${darkMode 
                      ? 'bg-slate-700 border-slate-600 text-white' 
                      : 'bg-white border-slate-300 text-slate-900'}
                  `}
                >
                  <option value="">None</option>
                  {taxRates.map(rate => (
                    <option key={rate.id} value={rate.id}>{rate.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCategoryForm({
                      name: category.name,
                      type: category.type,
                      description: category.description || '',
                      tax_rate_id: category.tax_rate_id || ''
                    });
                    setEditingCategory(category);
                    setShowCategoryModal(true);
                  }}
                  disabled={category.is_system}
                  className={`p-2 transition-colors ${
                    category.is_system
                      ? 'text-slate-600 cursor-not-allowed'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={category.is_system ? 'System categories cannot be edited' : 'Edit category'}
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  disabled={category.is_system}
                  className={`p-2 transition-colors ${
                    category.is_system
                      ? 'text-slate-600 cursor-not-allowed'
                      : 'text-red-400 hover:text-red-300'
                  }`}
                  title={category.is_system ? 'System categories cannot be deleted' : 'Delete category'}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {categories.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <Tag size={48} className="mx-auto mb-4 opacity-50" />
            <p>No categories created yet</p>
            <p className="text-sm">Create your first category to get started</p>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Hide tabs and header when initialTab is provided (coming from Settings cards)
  const showNavigation = initialTab === 'taxes' && !initialTab;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
      <div className="space-y-6">
          {!initialTab && (
            <div className="flex items-center gap-3 mb-6">
              <DollarSign className="text-green-400" size={24} />
              <div>
                <h2 className="text-xl font-semibold text-white">Finance Settings</h2>
                <p className="text-slate-400">Configure financial settings for your club</p>
              </div>
            </div>
          )}

          {error && (
            <div className={`p-4 rounded-lg ${
              error.includes('successfully')
                ? 'bg-green-900/20 border-green-900/30 text-green-400'
                : 'bg-red-900/20 border-red-900/30 text-red-400'
            } border`}>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Tabs - only show if no initialTab specified */}
          {!initialTab && (
            <div className="border-b border-slate-700">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveTab('taxes')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'taxes'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Percent size={16} />
                  <span>Taxes</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('transactions')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'transactions'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Receipt size={16} />
                  <span>Documents</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('categories')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'categories'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Tag size={16} />
                  <span>Categories</span>
                </div>
              </button>

              <button
                onClick={() => setActiveTab('membership')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'membership'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Users size={16} />
                  <span>Membership{!isAssociation ? ' Integration' : ''}</span>
                </div>
              </button>
            </div>
          </div>
          )}

          {/* Tab Content */}
          <div className={initialTab ? '' : 'bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6'}>
            {activeTab === 'taxes' && renderTaxesTab()}
            {activeTab === 'transactions' && renderTransactionsTab()}
            {activeTab === 'categories' && renderCategoriesTab()}
            {activeTab === 'membership' && renderMembershipTab()}
          </div>

          {/* Tax Rate Modal */}
          {showTaxModal && createPortal(
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-xl font-semibold text-white mb-4">
                  {editingTax ? 'Edit Tax Rate' : 'Add Tax Rate'}
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Tax Name
                    </label>
                    <input
                      type="text"
                      value={taxForm.name}
                      onChange={(e) => setTaxForm({ ...taxForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      placeholder="e.g., GST, VAT"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Tax Rate (as decimal)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={taxForm.rate}
                      onChange={(e) => setTaxForm({ ...taxForm, rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      placeholder="0.10"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Please enter your tax rate as a decimal. For example, 10% = 0.10.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Currency
                    </label>
                    <select
                      value={taxForm.currency}
                      onChange={(e) => setTaxForm({ ...taxForm, currency: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    >
                      {currencies.map(currency => (
                        <option key={currency.code} value={currency.code}>
                          {currency.code} - {currency.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {taxRates.length === 0 && (
                    <div className="flex items-center gap-2 p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg">
                      <CircularCheckbox
                        checked={true}
                        onChange={() => {}}
                        disabled={true}
                        size="sm"
                      />
                      <div>
                        <p className="text-blue-400 text-sm font-medium">This will be your default tax rate</p>
                        <p className="text-blue-400/70 text-xs">The first tax rate is automatically set as default</p>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowTaxModal(false);
                      setEditingTax(null);
                      setTaxForm({ name: '', rate: 0, currency: 'AUD' });
                    }}
                    className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTaxRate}
                    disabled={saving || !taxForm.name || !taxForm.currency}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Category Modal */}
          {showCategoryModal && createPortal(
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-xl font-semibold text-white mb-4">
                  {editingCategory ? 'Edit Category' : 'Add Category'}
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Category Name
                    </label>
                    <input
                      type="text"
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      placeholder="e.g., Equipment, Events"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Type
                    </label>
                    <select
                      value={categoryForm.type}
                      onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value as 'income' | 'expense' })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    >
                      <option value="expense">Expense</option>
                      <option value="income">Income</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Description (Optional)
                    </label>
                    <textarea
                      value={categoryForm.description}
                      onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                      rows={3}
                      placeholder="Brief description of this category"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Default Tax Rate (Optional)
                    </label>
                    <select
                      value={categoryForm.tax_rate_id}
                      onChange={(e) => setCategoryForm({ ...categoryForm, tax_rate_id: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
                    >
                      <option value="">None</option>
                      {taxRates.map(rate => (
                        <option key={rate.id} value={rate.id}>{rate.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => {
                      setShowCategoryModal(false);
                      setEditingCategory(null);
                      setCategoryForm({ name: '', type: 'expense', description: '', tax_rate_id: '' });
                    }}
                    className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveCategory}
                    disabled={saving || !categoryForm.name}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

      {/* Disconnect Stripe Confirmation Modal */}
      {showDisconnectModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Disconnect Stripe Account?</h3>
            <p className="text-slate-300 mb-6">
              Are you sure you want to disconnect your Stripe account? This will:
            </p>
            <ul className="text-slate-300 text-sm space-y-2 mb-6 list-disc list-inside">
              <li>Stop accepting credit card payments for memberships</li>
              <li>Remove the connection to your current Stripe account</li>
              <li>Allow you to connect a different Stripe account</li>
              <li>Not affect existing transactions or financial records</li>
            </ul>
            <p className="text-amber-400 text-sm mb-6 flex items-start gap-2">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>Members will only be able to pay via bank transfer until you reconnect Stripe.</span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDisconnectModal(false)}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisconnectStripe}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Disconnecting...' : 'Disconnect Stripe'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Stripe Connection Choice Modal */}
      <StripeConnectionChoiceModal
        isOpen={showConnectionChoiceModal}
        onClose={() => setShowConnectionChoiceModal(false)}
        onSelectConnectionType={handleConnectStripe}
        darkMode={darkMode}
      />

      {/* Stripe Connection Preloader Modal */}
      <StripeConnectionPreloaderModal
        isOpen={showStripePreloader}
        connectionType={selectedConnectionType}
        onComplete={handlePreloaderComplete}
      />
      </div>
    </div>
  );
};
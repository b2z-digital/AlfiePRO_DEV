import React, { useState, useEffect } from 'react';
import { Globe, Check, AlertCircle, Loader2, Copy, ExternalLink, RefreshCw, Shield, Server, XCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { PublishingPreloaderModal } from '../pages/PublishingPreloaderModal';

interface EnhancedDomainManagementSectionProps {
  entityType: 'club' | 'event';
  entityId: string;
  entityName: string;
  currentSubdomain?: string;
  currentCustomDomain?: string;
  onDomainUpdate?: () => void;
}

interface DNSRecord {
  id: string;
  subdomain: string;
  full_domain: string;
  status: 'pending' | 'active' | 'failed' | 'custom';
  ssl_status?: 'pending' | 'provisioning' | 'active' | 'failed';
  ssl_verified_at?: string | null;
  ssl_error_message?: string | null;
  verified_at: string | null;
  error_message: string | null;
}

export const EnhancedDomainManagementSection: React.FC<EnhancedDomainManagementSectionProps> = ({
  entityType,
  entityId,
  entityName,
  currentSubdomain,
  currentCustomDomain,
  onDomainUpdate
}) => {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [subdomain, setSubdomain] = useState(currentSubdomain || '');
  const [customDomain, setCustomDomain] = useState(currentCustomDomain || '');
  const [useCustomDomain, setUseCustomDomain] = useState(!!currentCustomDomain);
  const [dnsRecord, setDnsRecord] = useState<DNSRecord | null>(null);
  const [showDnsInstructions, setShowDnsInstructions] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [showPublishingModal, setShowPublishingModal] = useState(false);
  const [takingOffline, setTakingOffline] = useState(false);
  const [changingDomainType, setChangingDomainType] = useState(false);
  const [showDomainTypeChange, setShowDomainTypeChange] = useState(false);
  const [newSubdomain, setNewSubdomain] = useState('');
  const [newCustomDomain, setNewCustomDomain] = useState('');
  const [switchToCustom, setSwitchToCustom] = useState(false);

  const baseDomain = 'alfiepro.com.au';
  const recordType = entityType === 'club' ? 'club_website' : 'event_website';
  const darkMode = localStorage.getItem('lightMode') !== 'true';

  useEffect(() => {
    loadDNSRecord();
    loadPublishStatus();
  }, [entityId]);

  useEffect(() => {
    if (!subdomain && entityName) {
      const generated = generateSubdomain(entityName);
      setSubdomain(generated);
    }
  }, [entityName]);

  const generateSubdomain = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 63);
  };

  const loadPublishStatus = async () => {
    try {
      const tableName = entityType === 'club' ? 'clubs' : 'event_websites';
      const { data, error } = await supabase
        .from(tableName)
        .select('website_published')
        .eq('id', entityId)
        .single();

      if (error) throw error;
      setIsPublished(data?.website_published || false);
    } catch (error) {
      console.error('Error loading publish status:', error);
    }
  };

  const loadDNSRecord = async () => {
    try {
      const { data, error } = await supabase
        .from('dns_records')
        .select('*')
        .eq('entity_id', entityId)
        .eq('record_type', recordType)
        .maybeSingle();

      if (error) {
        console.error('Error loading DNS record:', error);
        return;
      }

      if (data) {
        setDnsRecord(data);
        setSubdomain(data.subdomain || '');
        setShowDnsInstructions(data.status === 'custom');
      }
    } catch (error) {
      console.error('Error loading DNS record:', error);
    }
  };

  const publishWebsite = async () => {
    if (!subdomain.trim() && !customDomain.trim()) {
      addNotification('error', 'Please enter a subdomain or custom domain');
      return;
    }

    setShowPublishingModal(true);
    setLoading(true);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-dns`;
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          record_type: recordType,
          entity_id: entityId,
          subdomain: useCustomDomain ? undefined : subdomain.trim(),
          custom_domain: useCustomDomain ? customDomain.trim() : undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData.error || `Server error: ${response.status}`;
        throw new Error(errorMessage);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to publish website');
      }

      setDnsRecord(result.data.record);
      setShowDnsInstructions(useCustomDomain);

      const tableName = entityType === 'club' ? 'clubs' : 'event_websites';
      await supabase
        .from(tableName)
        .update({ website_published: true })
        .eq('id', entityId);

      setIsPublished(true);

      if (onDomainUpdate) {
        onDomainUpdate();
      }

      await loadDNSRecord();

      // Start polling for SSL certificate status
      startSSLPolling();
    } catch (error: any) {
      console.error('Error publishing website:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      setShowPublishingModal(false);

      if (error.name === 'AbortError') {
        addNotification('error', 'Request timed out. Please try again.');
      } else {
        addNotification('error', error.message || 'Failed to publish website');
      }
    } finally {
      setLoading(false);
    }
  };

  const takeWebsiteOffline = async () => {
    setTakingOffline(true);
    try {
      const tableName = entityType === 'club' ? 'clubs' : 'event_websites';
      const { error } = await supabase
        .from(tableName)
        .update({ website_published: false })
        .eq('id', entityId);

      if (error) throw error;

      setIsPublished(false);
      addNotification('success', 'Website taken offline successfully');

      if (onDomainUpdate) {
        onDomainUpdate();
      }
    } catch (error) {
      console.error('Error taking website offline:', error);
      addNotification('error', 'Failed to take website offline');
    } finally {
      setTakingOffline(false);
    }
  };

  const changeDomainType = async () => {
    if (switchToCustom && !newCustomDomain.trim()) {
      addNotification('error', 'Please enter a custom domain');
      return;
    }
    if (!switchToCustom && !newSubdomain.trim()) {
      addNotification('error', 'Please enter a subdomain');
      return;
    }

    setChangingDomainType(true);
    try {
      const tableName = entityType === 'club' ? 'clubs' : 'event_websites';
      const domainField = entityType === 'club' ? 'subdomain_slug' : 'slug';

      // Update the entity's domain fields
      const updateData: any = {
        custom_domain: switchToCustom ? newCustomDomain.trim() : null,
      };

      if (!switchToCustom) {
        updateData[domainField] = newSubdomain.trim();
      }

      const { error: updateError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', entityId);

      if (updateError) throw updateError;

      // Delete old DNS record
      if (dnsRecord) {
        await supabase
          .from('dns_records')
          .delete()
          .eq('id', dnsRecord.id);
      }

      // Create new DNS record via edge function
      if (!switchToCustom) {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-dns`;
        const { data: { session } } = await supabase.auth.getSession();

        await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'create',
            record_type: recordType,
            entity_id: entityId,
            subdomain: newSubdomain.trim(),
          }),
        });
      } else {
        // For custom domains, create AWS Amplify domain
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-aws-amplify`;
        const { data: { session } } = await supabase.auth.getSession();

        await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'add_domain',
            entity_id: entityId,
            entity_type: entityType,
            custom_domain: newCustomDomain.trim(),
          }),
        });
      }

      addNotification('success', `Domain type changed successfully! ${switchToCustom ? 'Please follow DNS instructions to complete setup.' : 'Your new subdomain is being set up.'}`);

      setShowDomainTypeChange(false);
      setNewSubdomain('');
      setNewCustomDomain('');

      // Reload data
      await loadDNSRecord();
      await loadPublishStatus();

      if (onDomainUpdate) {
        onDomainUpdate();
      }
    } catch (error) {
      console.error('Error changing domain type:', error);
      addNotification('error', 'Failed to change domain type');
    } finally {
      setChangingDomainType(false);
    }
  };

  const verifyDomain = async () => {
    setVerifying(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-dns`;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'verify',
          record_type: recordType,
          entity_id: entityId,
          subdomain: subdomain.trim(),
        }),
      });

      const result = await response.json();

      if (result.data.verified) {
        addNotification('success', 'Domain verified successfully!');
        await loadDNSRecord();
      } else {
        addNotification('info', result.data.message || 'Domain verification pending');
      }
    } catch (error: any) {
      console.error('Error verifying domain:', error);
      addNotification('error', 'Failed to verify domain');
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addNotification('success', 'Copied to clipboard');
  };

  const startSSLPolling = () => {
    // Poll every 10 seconds for SSL status updates
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('dns_records')
          .select('ssl_status, ssl_verified_at')
          .eq('entity_id', entityId)
          .eq('record_type', recordType)
          .maybeSingle();

        if (error) {
          console.error('Error polling SSL status:', error);
          clearInterval(pollInterval);
          return;
        }

        if (data && data.ssl_status === 'active') {
          // SSL is active, stop polling
          clearInterval(pollInterval);
          await loadDNSRecord();
          addNotification('success', 'SSL certificate activated! Your website is now secure.');
        } else if (data && data.ssl_status === 'failed') {
          // SSL failed, stop polling
          clearInterval(pollInterval);
          await loadDNSRecord();
          addNotification('error', 'SSL certificate provisioning failed. Please contact support.');
        }
      } catch (error) {
        console.error('Error during SSL polling:', error);
      }
    }, 10000); // Poll every 10 seconds

    // Stop polling after 5 minutes (max SSL provisioning time)
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 300000);
  };

  const getWebsiteStatus = () => {
    if (!dnsRecord) return 'draft';
    if (!isPublished) return 'draft';
    if (dnsRecord.status === 'pending' || dnsRecord.status === 'custom') return 'pending';
    if (dnsRecord.status === 'active' && dnsRecord.ssl_status === 'active') return 'live';
    if (dnsRecord.status === 'active') return 'pending';
    if (dnsRecord.status === 'failed') return 'error';
    return 'draft';
  };

  const websiteStatus = getWebsiteStatus();

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'live':
        return {
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-900/30',
          borderColor: 'border-emerald-600/30',
          dotColor: 'bg-emerald-400',
          label: 'Live',
          icon: <Check size={16} className="text-emerald-400" />
        };
      case 'pending':
        return {
          color: 'text-amber-400',
          bgColor: 'bg-amber-900/30',
          borderColor: 'border-amber-600/30',
          dotColor: 'bg-amber-400',
          label: 'Pending',
          icon: <Loader2 size={16} className="text-amber-400 animate-spin" />
        };
      case 'error':
        return {
          color: 'text-red-400',
          bgColor: 'bg-red-900/30',
          borderColor: 'border-red-600/30',
          dotColor: 'bg-red-400',
          label: 'Error',
          icon: <XCircle size={16} className="text-red-400" />
        };
      default:
        return {
          color: 'text-slate-400',
          bgColor: 'bg-slate-700/30',
          borderColor: 'border-slate-600/30',
          dotColor: 'bg-slate-400',
          label: 'Draft',
          icon: <Globe size={16} className="text-slate-400" />
        };
    }
  };

  const statusConfig = getStatusConfig(websiteStatus);

  return (
    <>
      <div className={`${darkMode ? 'bg-slate-800/50' : 'bg-white'} rounded-xl p-6 border ${darkMode ? 'border-slate-700/50' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-600/20">
              <Globe size={20} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
            </div>
            <div>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Domain Management
              </h3>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Configure your website domain settings
              </p>
            </div>
          </div>

          <div className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${statusConfig.bgColor} ${statusConfig.color} border ${statusConfig.borderColor}`}>
            <div className={`w-2 h-2 rounded-full ${statusConfig.dotColor} ${websiteStatus === 'live' || websiteStatus === 'pending' ? 'animate-pulse' : ''}`} />
            {statusConfig.label}
          </div>
        </div>

        {dnsRecord && dnsRecord.status !== 'pending' && (
          <div className={`mb-6 p-4 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'} border ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Current Domain
              </span>
              <div className="flex items-center gap-2">
                {statusConfig.icon}
                <span className={`text-sm font-medium ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`https://${dnsRecord.full_domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm ${darkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'} font-mono flex items-center gap-1`}
              >
                {dnsRecord.full_domain}
                <ExternalLink size={14} />
              </a>
            </div>
            {dnsRecord.verified_at && (
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mt-1`}>
                Verified {new Date(dnsRecord.verified_at).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {!isPublished && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!useCustomDomain}
                  onChange={() => setUseCustomDomain(false)}
                  className="w-4 h-4"
                />
                <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Use Subdomain
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={useCustomDomain}
                  onChange={() => setUseCustomDomain(true)}
                  className="w-4 h-4"
                />
                <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Custom Domain
                </span>
              </label>
            </div>

            {!useCustomDomain ? (
              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                  Subdomain
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="your-club"
                    className={`flex-1 px-3 py-2 rounded-lg border ${
                      darkMode
                        ? 'bg-slate-700 border-slate-600 text-white'
                        : 'bg-white border-slate-300 text-slate-900'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                  <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    .{baseDomain}
                  </span>
                </div>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mt-1`}>
                  Your website will be accessible at: {subdomain || 'your-subdomain'}.{baseDomain}
                </p>
              </div>
            ) : (
              <div>
                <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                  Custom Domain
                </label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
                  placeholder="www.yourclub.com"
                  className={`w-full px-3 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-slate-700 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mt-1`}>
                  Enter your custom domain (e.g., www.yourclub.com)
                </p>
              </div>
            )}
          </div>
        )}

        {showDnsInstructions && useCustomDomain && dnsRecord && (
          <div className={`mb-6 p-4 rounded-lg border ${darkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
            <h4 className={`text-sm font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'} mb-3 flex items-center gap-2`}>
              <AlertCircle size={16} />
              DNS Setup Instructions for Custom Domain
            </h4>
            <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-3`}>
              AWS Amplify is provisioning SSL for your domain. Add these DNS records to your domain registrar to complete the verification:
            </p>

            <div className={`space-y-3 ${darkMode ? 'bg-slate-800' : 'bg-white'} p-4 rounded`}>
              <div className="space-y-2">
                <h5 className={`text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Step 1: Add SSL Verification Record
                </h5>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-xs font-mono break-all">
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                        Type: CNAME<br />
                        Host: Check AWS Amplify console for exact value<br />
                        Value: Check AWS Amplify console for exact value
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'} pt-3 space-y-2`}>
                <h5 className={`text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Step 2: Point Domain to AWS Amplify
                </h5>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-xs font-mono break-all">
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                        Type: CNAME<br />
                        Host: www (or your subdomain)<br />
                        Target: d205ctqm5i025u.cloudfront.net
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard('d205ctqm5i025u.cloudfront.net')}
                    className={`p-2 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className={`mt-3 p-3 rounded ${darkMode ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
              <p className={`text-xs ${darkMode ? 'text-amber-200' : 'text-amber-800'}`}>
                <strong>Note:</strong> SSL provisioning typically takes 5-30 minutes. Your website will be fully accessible once AWS Amplify verifies your domain and issues the SSL certificate.
              </p>
            </div>
          </div>
        )}

        {dnsRecord && websiteStatus === 'live' && (
          <div className={`mb-6 p-4 rounded-lg border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
            <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'} mb-3 flex items-center gap-2`}>
              <Server size={16} className="text-blue-400" />
              Domain Status
            </h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-green-400" />
                  <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>DNS Verification</span>
                </div>
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-400">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={16} className={dnsRecord.ssl_status === 'active' ? 'text-green-400' : 'text-amber-400'} />
                  <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>SSL Certificate</span>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  dnsRecord.ssl_status === 'active'
                    ? 'bg-green-900/30 text-green-400'
                    : dnsRecord.ssl_status === 'provisioning'
                    ? 'bg-amber-900/30 text-amber-400'
                    : dnsRecord.ssl_status === 'failed'
                    ? 'bg-red-900/30 text-red-400'
                    : 'bg-slate-700/30 text-slate-400'
                }`}>
                  {dnsRecord.ssl_status === 'active' ? 'Secure' : dnsRecord.ssl_status === 'provisioning' ? 'Provisioning' : dnsRecord.ssl_status || 'Pending'}
                </span>
              </div>

              {dnsRecord.ssl_status !== 'active' && (
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className={`text-xs ${darkMode ? 'text-amber-200' : 'text-amber-800'}`}>
                      SSL certificate is being provisioned. Your website will be fully accessible via HTTPS once complete (typically 5-15 minutes).
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {isPublished && dnsRecord && (
          <div className={`mb-6 p-4 rounded-lg border ${darkMode ? 'bg-blue-900/10 border-blue-600/30' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className={`text-sm font-semibold ${darkMode ? 'text-white' : 'text-slate-900'} flex items-center gap-2`}>
                  <RefreshCw size={16} className="text-blue-400" />
                  Change Domain Type
                </h4>
                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'} mt-1`}>
                  Switch between subdomain and custom domain without taking your website offline
                </p>
              </div>
              {!showDomainTypeChange && (
                <button
                  onClick={() => {
                    setShowDomainTypeChange(true);
                    const isCurrentlyCustom = !!dnsRecord.full_domain && !dnsRecord.full_domain.includes(baseDomain);
                    setSwitchToCustom(!isCurrentlyCustom);
                    if (isCurrentlyCustom) {
                      setNewSubdomain(subdomain || generateSubdomain(entityName));
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium ${darkMode ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'} transition-colors`}
                >
                  Change
                </button>
              )}
            </div>

            {showDomainTypeChange && (
              <div className="space-y-4 mt-4">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!switchToCustom}
                      onChange={() => setSwitchToCustom(false)}
                      className="w-4 h-4"
                    />
                    <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Switch to Subdomain
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={switchToCustom}
                      onChange={() => setSwitchToCustom(true)}
                      className="w-4 h-4"
                    />
                    <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Switch to Custom Domain
                    </span>
                  </label>
                </div>

                {!switchToCustom ? (
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                      New Subdomain
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newSubdomain}
                        onChange={(e) => setNewSubdomain(e.target.value)}
                        placeholder="your-club-name"
                        className={`flex-1 px-3 py-2 rounded-lg ${
                          darkMode
                            ? 'bg-slate-700 border-slate-600 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      />
                      <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        .{baseDomain}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-2`}>
                      New Custom Domain
                    </label>
                    <input
                      type="text"
                      value={newCustomDomain}
                      onChange={(e) => setNewCustomDomain(e.target.value)}
                      placeholder="www.yourclub.com"
                      className={`w-full px-3 py-2 rounded-lg ${
                        darkMode
                          ? 'bg-slate-700 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      } border focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mt-1`}>
                      You'll need to configure DNS records after the change
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={changeDomainType}
                    disabled={changingDomainType || (switchToCustom ? !newCustomDomain.trim() : !newSubdomain.trim())}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                      changingDomainType || (switchToCustom ? !newCustomDomain.trim() : !newSubdomain.trim())
                        ? 'bg-slate-600 cursor-not-allowed text-slate-400'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {changingDomainType ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Changing...
                      </>
                    ) : (
                      <>
                        <RefreshCw size={16} />
                        Change Domain
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowDomainTypeChange(false);
                      setNewSubdomain('');
                      setNewCustomDomain('');
                    }}
                    disabled={changingDomainType}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      darkMode
                        ? 'bg-slate-700 hover:bg-slate-600 text-white'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3">
          {!isPublished ? (
            <button
              onClick={publishWebsite}
              disabled={loading || (!subdomain.trim() && !customDomain.trim())}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                loading || (!subdomain.trim() && !customDomain.trim())
                  ? 'bg-slate-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Globe size={18} />
                  Publish Website
                </>
              )}
            </button>
          ) : (
            <>
              {dnsRecord && !useCustomDomain && (
                <button
                  onClick={verifyDomain}
                  disabled={verifying}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                    darkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                  }`}
                >
                  {verifying ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <RefreshCw size={18} />
                  )}
                  Verify
                </button>
              )}

              <button
                onClick={takeWebsiteOffline}
                disabled={takingOffline}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  takingOffline
                    ? 'bg-slate-600 cursor-not-allowed'
                    : 'bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30'
                }`}
              >
                {takingOffline ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Taking Offline...
                  </>
                ) : (
                  <>
                    <XCircle size={18} />
                    Take Website Offline
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      <PublishingPreloaderModal
        isOpen={showPublishingModal}
        domain={useCustomDomain ? customDomain : `${subdomain}.${baseDomain}`}
        isCustomDomain={useCustomDomain}
        onComplete={() => {
          setShowPublishingModal(false);
          const domain = useCustomDomain ? customDomain : `${subdomain}.${baseDomain}`;
          addNotification('success', `Website published successfully! Domain: ${domain}`);
          loadDNSRecord();
          loadPublishStatus();
        }}
      />
    </>
  );
};

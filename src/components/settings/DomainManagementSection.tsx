import React, { useState, useEffect } from 'react';
import { Globe, Check, AlertCircle, Loader2, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface DomainManagementSectionProps {
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
  verified_at: string | null;
  error_message: string | null;
}

export const DomainManagementSection: React.FC<DomainManagementSectionProps> = ({
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

  const baseDomain = 'alfiepro.com.au';
  const recordType = entityType === 'club' ? 'club_website' : 'event_website';

  useEffect(() => {
    loadDNSRecord();
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

  const loadDNSRecord = async () => {
    try {
      const { data, error } = await supabase
        .from('dns_records')
        .select('*')
        .eq('entity_id', entityId)
        .eq('record_type', recordType)
        .single();

      if (error && error.code !== 'PGRST116') {
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

    setLoading(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-cloudflare-dns`;
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      console.log('Publishing website with data:', {
        action: 'create',
        record_type: recordType,
        entity_id: entityId,
        subdomain: useCustomDomain ? undefined : subdomain.trim(),
        custom_domain: useCustomDomain ? customDomain.trim() : undefined,
      });

      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

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

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Response result:', result);

      if (!result.success) {
        throw new Error(result.error || 'Failed to publish website');
      }

      addNotification('success', result.data.message);
      setDnsRecord(result.data.record);
      setShowDnsInstructions(useCustomDomain);

      if (onDomainUpdate) {
        onDomainUpdate();
      }

      await loadDNSRecord();
    } catch (error: any) {
      console.error('Error publishing website:', error);

      if (error.name === 'AbortError') {
        addNotification('error', 'Request timed out. Please check if Cloudflare DNS nameservers have propagated and try again.');
      } else if (error.message.includes('Failed to fetch')) {
        addNotification('error', 'Network error. Please check your connection and try again.');
      } else {
        addNotification('error', error.message || 'Failed to publish website. Check console for details.');
      }
    } finally {
      setLoading(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-500';
      case 'pending':
      case 'custom':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-500';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Check size={18} className="text-green-500" />;
      case 'pending':
      case 'custom':
        return <AlertCircle size={18} className="text-yellow-500" />;
      case 'failed':
        return <AlertCircle size={18} className="text-red-500" />;
      default:
        return <Globe size={18} className="text-slate-400" />;
    }
  };

  const darkMode = localStorage.getItem('lightMode') !== 'true';

  return (
    <div className={`${darkMode ? 'bg-slate-800' : 'bg-white'} rounded-lg p-6 border ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
      <div className="flex items-center gap-3 mb-6">
        <Globe size={24} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
        <div>
          <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Domain Management
          </h3>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Configure your website domain settings
          </p>
        </div>
      </div>

      {dnsRecord && dnsRecord.status !== 'pending' && (
        <div className={`mb-6 p-4 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'} border ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Current Domain
            </span>
            <div className="flex items-center gap-2">
              {getStatusIcon(dnsRecord.status)}
              <span className={`text-sm font-medium ${getStatusColor(dnsRecord.status)}`}>
                {dnsRecord.status === 'active' ? 'Active' : dnsRecord.status === 'custom' ? 'Custom Domain' : dnsRecord.status}
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

      <div className="space-y-4">
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

        {showDnsInstructions && useCustomDomain && (
          <div className={`p-4 rounded-lg border ${darkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
            <h4 className={`text-sm font-semibold ${darkMode ? 'text-blue-400' : 'text-blue-600'} mb-3`}>
              DNS Setup Instructions
            </h4>
            <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-3`}>
              Add the following DNS records to your domain's DNS settings:
            </p>

            <div className={`space-y-2 ${darkMode ? 'bg-slate-800' : 'bg-white'} p-3 rounded`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-xs font-mono">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Record Type:</span>{' '}
                    <span className={darkMode ? 'text-white' : 'text-slate-900'}>A</span>
                  </div>
                  <div className="text-xs font-mono mt-1">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Host:</span>{' '}
                    <span className={darkMode ? 'text-white' : 'text-slate-900'}>@</span>
                  </div>
                  <div className="text-xs font-mono mt-1">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Value:</span>{' '}
                    <span className={darkMode ? 'text-white' : 'text-slate-900'}>76.76.21.21</span>
                  </div>
                  <div className="text-xs font-mono mt-1">
                    <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>TTL:</span>{' '}
                    <span className={darkMode ? 'text-white' : 'text-slate-900'}>3600</span>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard('76.76.21.21')}
                  className={`p-2 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                >
                  <Copy size={14} />
                </button>
              </div>

              <div className={`border-t ${darkMode ? 'border-slate-700' : 'border-slate-200'} pt-2 mt-2`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-xs font-mono">
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Type:</span>{' '}
                      <span className={darkMode ? 'text-white' : 'text-slate-900'}>CNAME</span>
                    </div>
                    <div className="text-xs font-mono mt-1">
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Host:</span>{' '}
                      <span className={darkMode ? 'text-white' : 'text-slate-900'}>www</span>
                    </div>
                    <div className="text-xs font-mono mt-1">
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Target:</span>{' '}
                      <span className={darkMode ? 'text-white' : 'text-slate-900'}>{baseDomain}</span>
                    </div>
                    <div className="text-xs font-mono mt-1">
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>TTL:</span>{' '}
                      <span className={darkMode ? 'text-white' : 'text-slate-900'}>3600</span>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(baseDomain)}
                    className={`p-2 rounded ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className={`mt-3 p-3 rounded ${darkMode ? 'bg-slate-800' : 'bg-white'}`}>
              <p className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-700'} mb-2 font-semibold`}>
                Domain Configuration:
              </p>
              <div className="text-xs font-mono space-y-1">
                <div>
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Alfie Pro URL:</span>{' '}
                  <span className={darkMode ? 'text-blue-400' : 'text-blue-600'}>{subdomain || 'your-subdomain'}.{baseDomain}</span>
                </div>
                <div>
                  <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>Custom Domain:</span>{' '}
                  <span className={darkMode ? 'text-blue-400' : 'text-blue-600'}>{customDomain || 'example.com'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={publishWebsite}
            disabled={loading || (!subdomain.trim() && !customDomain.trim())}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
              loading || (!subdomain.trim() && !customDomain.trim())
                ? 'bg-slate-600 cursor-not-allowed'
                : darkMode
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
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
                {dnsRecord ? 'Update Website' : 'Publish Website'}
              </>
            )}
          </button>

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
        </div>
      </div>
    </div>
  );
};

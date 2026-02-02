import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileText, Sparkles, AlertCircle, Loader } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { DocumentGenerationWizard } from '../documents/DocumentGenerationWizard';

interface GeneratorSettings {
  id: string;
  club_id: string;
  is_enabled: boolean;
  slug: string;
  default_template_id: string | null;
  allow_template_selection: boolean;
  branding_logo_url: string | null;
  branding_primary_color: string;
  welcome_message: string | null;
  club_name?: string;
}

export const PublicNorGenerator: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<GeneratorSettings | null>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    loadGeneratorSettings();
  }, [slug]);

  const loadGeneratorSettings = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!slug) {
        setError('Invalid generator URL');
        setLoading(false);
        return;
      }

      // Load generator settings with club info
      const { data: settingsData, error: settingsError } = await supabase
        .from('public_nor_generator_settings')
        .select('*, clubs(name)')
        .eq('slug', slug)
        .eq('is_enabled', true)
        .single();

      if (settingsError || !settingsData) {
        setError('NOR Generator not found or not available');
        setLoading(false);
        return;
      }

      const loadedSettings: GeneratorSettings = {
        ...settingsData,
        club_name: settingsData.clubs?.name
      };
      setSettings(loadedSettings);

      // Load available templates for this club
      const { data: templatesData, error: templatesError } = await supabase
        .from('document_templates')
        .select('id, name, description, document_type')
        .eq('club_id', settingsData.club_id)
        .eq('is_active', true)
        .eq('document_type', 'nor')
        .order('name');

      if (!templatesError && templatesData) {
        setTemplates(templatesData);

        // Set default template if specified
        if (settingsData.default_template_id) {
          setSelectedTemplateId(settingsData.default_template_id);
        } else if (templatesData.length > 0) {
          setSelectedTemplateId(templatesData[0].id);
        }
      }

      setLoading(false);
    } catch (err: any) {
      console.error('Error loading generator:', err);
      setError('Failed to load NOR generator');
      setLoading(false);
    }
  };

  const handleStartGeneration = () => {
    if (!selectedTemplateId) {
      setError('Please select a template');
      return;
    }
    setShowWizard(true);
  };

  const handleComplete = (documentUrl: string) => {
    setShowWizard(false);
    // Show success message or download the document
    window.open(documentUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading NOR Generator...</p>
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Not Available</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Homepage
          </button>
        </div>
      </div>
    );
  }

  if (showWizard && selectedTemplateId) {
    return (
      <DocumentGenerationWizard
        templateId={selectedTemplateId}
        documentType="nor"
        onClose={() => setShowWizard(false)}
        onComplete={handleComplete}
        darkMode={false}
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50"
      style={{
        background: `linear-gradient(135deg, ${settings.branding_primary_color}10 0%, white 50%, ${settings.branding_primary_color}10 100%)`
      }}
    >
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          {settings.branding_logo_url && (
            <img
              src={settings.branding_logo_url}
              alt={settings.club_name}
              className="h-20 mx-auto mb-6 object-contain"
            />
          )}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            {settings.club_name}
          </h1>
          <div className="flex items-center justify-center gap-2 mb-6">
            <Sparkles className="w-6 h-6" style={{ color: settings.branding_primary_color }} />
            <h2 className="text-2xl md:text-3xl font-semibold text-gray-700">
              Notice of Race Generator
            </h2>
            <Sparkles className="w-6 h-6" style={{ color: settings.branding_primary_color }} />
          </div>
          {settings.welcome_message && (
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              {settings.welcome_message}
            </p>
          )}
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
          <div className="flex items-start gap-4 mb-8">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${settings.branding_primary_color}20` }}
            >
              <FileText className="w-6 h-6" style={{ color: settings.branding_primary_color }} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                Generate Your Notice of Race
              </h3>
              <p className="text-gray-600">
                Create a professional Notice of Race document for your sailing event in minutes.
                Simply fill out the form with your event details and download your completed NOR.
              </p>
            </div>
          </div>

          {/* Template Selection */}
          {settings.allow_template_selection && templates.length > 1 ? (
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Template
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                {templates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      selectedTemplateId === template.id
                        ? 'border-current bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    style={{
                      borderColor: selectedTemplateId === template.id ? settings.branding_primary_color : undefined
                    }}
                  >
                    <h4 className="font-semibold text-gray-900 mb-1">{template.name}</h4>
                    {template.description && (
                      <p className="text-sm text-gray-600">{template.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ) : templates.length === 1 && (
            <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Template:</span> {templates[0].name}
              </p>
              {templates[0].description && (
                <p className="text-sm text-gray-600 mt-1">{templates[0].description}</p>
              )}
            </div>
          )}

          {templates.length === 0 && (
            <div className="mb-8 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-sm text-gray-700">
                No templates are currently available. Please contact the club administrator.
              </p>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStartGeneration}
            disabled={!selectedTemplateId || templates.length === 0}
            className="w-full py-4 px-6 rounded-xl font-semibold text-white text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg"
            style={{
              backgroundColor: settings.branding_primary_color,
              opacity: !selectedTemplateId || templates.length === 0 ? 0.5 : 1
            }}
          >
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5" />
              Start Creating Your NOR
              <Sparkles className="w-5 h-5" />
            </span>
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>Powered by {settings.club_name} Race Management System</p>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Check, Upload, Image as ImageIcon, Trash2, Plus, Target as TargetIcon, MapPin, Building2 } from 'lucide-react';
import { advertisingStorage } from '../../../utils/advertisingStorage';
import { Advertiser, AdPlacement } from '../../../types/advertising';
import { useNotification } from '../../../contexts/NotificationContext';
import imageCompression from 'browser-image-compression';
import { supabase } from '../../../utils/supabase';
import { getStoredClubs } from '../../../utils/clubStorage';

interface CampaignCreationWizardProps {
  onClose: (success?: boolean) => void;
}

interface BannerData {
  id: string;
  name: string;
  ad_type: 'image' | 'html5' | 'adsense' | 'text';
  image_url: string;
  image_file?: File;
  html_content: string;
  adsense_code: string;
  text_headline: string;
  text_body: string;
  text_cta: string;
  link_url: string;
  size_width: number;
  size_height: number;
  placement_ids: string[];
}

interface ClubData {
  id: string;
  name: string;
  state?: string;
}

export const CampaignCreationWizard: React.FC<CampaignCreationWizardProps> = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);
  const [placements, setPlacements] = useState<AdPlacement[]>([]);
  const [clubs, setClubs] = useState<ClubData[]>([]);
  const [loading, setLoading] = useState(false);
  const { addNotification } = useNotification();

  // Step 1: Campaign Details
  const [campaignData, setCampaignData] = useState({
    advertiser_id: '',
    name: '',
    description: '',
    pricing_model: 'flat_rate' as 'flat_rate' | 'cpm',
    flat_rate_amount: 0,
    cpm_rate: 0,
  });

  // Step 2: Banners
  const [banners, setBanners] = useState<BannerData[]>([]);
  const [uploadingBannerId, setUploadingBannerId] = useState<string | null>(null);

  // Step 3: Targeting & Schedule
  const [targetingData, setTargetingData] = useState({
    start_date: '',
    end_date: '',
    priority: 5,
    budget_impressions: 0,
    budget_clicks: 0,
    is_active: true,
    target_states: [] as string[],
    target_club_ids: [] as string[],
    target_all: true,
  });

  useEffect(() => {
    loadAdvertisers();
    loadPlacements();
    loadClubs();
  }, []);

  const loadAdvertisers = async () => {
    const data = await advertisingStorage.getAdvertisers();
    setAdvertisers(data.filter(a => a.is_active));
  };

  const loadPlacements = async () => {
    const data = await advertisingStorage.getPlacements();
    setPlacements(data.filter(p => p.is_active));
  };

  const loadClubs = async () => {
    const data = await getStoredClubs();
    setClubs(data.map(c => ({ id: c.id, name: c.name, state: c.state })));
  };

  const addBanner = () => {
    const newBanner: BannerData = {
      id: Date.now().toString(),
      name: `Banner ${banners.length + 1}`,
      ad_type: 'image',
      image_url: '',
      html_content: '',
      adsense_code: '',
      text_headline: '',
      text_body: '',
      text_cta: '',
      link_url: '',
      size_width: 300,
      size_height: 250,
      placement_ids: [],
    };
    setBanners([...banners, newBanner]);
  };

  const removeBanner = (id: string) => {
    setBanners(banners.filter(b => b.id !== id));
  };

  const updateBanner = (id: string, updates: Partial<BannerData>) => {
    setBanners(banners.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const handleBannerImageChange = async (bannerId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addNotification('Please upload an image file', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addNotification('Image size should be less than 5MB', 'error');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    updateBanner(bannerId, { image_url: previewUrl, image_file: file });
  };

  const uploadBannerImage = async (file: File): Promise<string> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
    };

    const compressedFile = await imageCompression(file, options);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `advertising/banners/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, compressedFile, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        if (!campaignData.advertiser_id || !campaignData.name.trim()) {
          addNotification('Please fill in all required fields', 'error');
          return false;
        }
        return true;
      case 2:
        if (banners.length === 0) {
          addNotification('Please add at least one banner', 'error');
          return false;
        }
        for (const banner of banners) {
          if (!banner.name.trim()) {
            addNotification('Please provide a name for all banners', 'error');
            return false;
          }
          if (banner.ad_type === 'image' && !banner.image_url) {
            addNotification('Please upload an image for all image banners', 'error');
            return false;
          }
        }
        return true;
      case 3:
        if (!targetingData.start_date || !targetingData.end_date) {
          addNotification('Please select start and end dates', 'error');
          return false;
        }
        if (new Date(targetingData.end_date) < new Date(targetingData.start_date)) {
          addNotification('End date must be after start date', 'error');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    try {
      setLoading(true);

      // Create campaign
      const campaignPayload = {
        ...campaignData,
        start_date: targetingData.start_date,
        end_date: targetingData.end_date,
        priority: targetingData.priority,
        budget_impressions: targetingData.budget_impressions,
        budget_clicks: targetingData.budget_clicks,
        is_active: targetingData.is_active,
      };

      const campaign = await advertisingStorage.createCampaign(campaignPayload);

      // Add campaign targeting
      if (!targetingData.target_all) {
        for (const state of targetingData.target_states) {
          await advertisingStorage.addCampaignTargeting({
            campaign_id: campaign.id,
            target_type: 'state',
            target_value: state,
          });
        }

        for (const clubId of targetingData.target_club_ids) {
          await advertisingStorage.addCampaignTargeting({
            campaign_id: campaign.id,
            target_type: 'club',
            target_value: clubId,
          });
        }
      }

      // Add campaign placements from all banners
      const allPlacementIds = new Set<string>();
      banners.forEach(b => b.placement_ids.forEach(id => allPlacementIds.add(id)));

      for (const placementId of allPlacementIds) {
        await advertisingStorage.addCampaignPlacement(campaign.id, placementId, 1);
      }

      // Upload banner images and create banners
      for (const banner of banners) {
        let imageUrl = banner.image_url;

        if (banner.image_file) {
          setUploadingBannerId(banner.id);
          imageUrl = await uploadBannerImage(banner.image_file);
        }

        const bannerPayload: any = {
          campaign_id: campaign.id,
          name: banner.name,
          ad_type: banner.ad_type,
          link_url: banner.link_url,
          size_width: banner.size_width,
          size_height: banner.size_height,
          is_active: true,
        };

        if (banner.ad_type === 'image') bannerPayload.image_url = imageUrl;
        if (banner.ad_type === 'html5') bannerPayload.html_content = banner.html_content;
        if (banner.ad_type === 'adsense') bannerPayload.adsense_code = banner.adsense_code;
        if (banner.ad_type === 'text') {
          bannerPayload.text_content = {
            headline: banner.text_headline,
            body: banner.text_body,
            cta: banner.text_cta,
          };
        }

        await advertisingStorage.createBanner(bannerPayload);
      }

      addNotification('Campaign created successfully with all banners!', 'success');
      onClose(true);
    } catch (error) {
      console.error('Error creating campaign:', error);
      addNotification('Failed to create campaign', 'error');
    } finally {
      setLoading(false);
      setUploadingBannerId(null);
    }
  };

  const steps = [
    { number: 1, title: 'Campaign Details', description: 'Basic information' },
    { number: 2, title: 'Banners', description: 'Add creative assets' },
    { number: 3, title: 'Schedule & Target', description: 'Configure targeting' },
    { number: 4, title: 'Review', description: 'Review and launch' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header with blue strip */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Create New Campaign</h2>
            <p className="text-blue-100 text-sm mt-1">Step {currentStep} of {steps.length}</p>
          </div>
          <button
            onClick={() => onClose()}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                      currentStep > step.number
                        ? 'bg-green-500 text-white'
                        : currentStep === step.number
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {currentStep > step.number ? <Check size={20} /> : step.number}
                  </div>
                  <div>
                    <div className={`font-medium ${currentStep >= step.number ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{step.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <ChevronRight className="text-gray-400 dark:text-gray-600 flex-shrink-0" size={20} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStep === 1 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Campaign Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Advertiser *
                  </label>
                  <select
                    value={campaignData.advertiser_id}
                    onChange={(e) => setCampaignData({ ...campaignData, advertiser_id: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  >
                    <option value="">Select Advertiser</option>
                    {advertisers.map(adv => (
                      <option key={adv.id} value={adv.id}>{adv.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Campaign Name *
                  </label>
                  <input
                    type="text"
                    value={campaignData.name}
                    onChange={(e) => setCampaignData({ ...campaignData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="Summer Sale 2026"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={campaignData.description}
                  onChange={(e) => setCampaignData({ ...campaignData, description: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  placeholder="Brief description of this advertising campaign..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pricing Model
                  </label>
                  <select
                    value={campaignData.pricing_model}
                    onChange={(e) => setCampaignData({ ...campaignData, pricing_model: e.target.value as 'flat_rate' | 'cpm' })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="flat_rate">Flat Rate</option>
                    <option value="cpm">Cost Per Mille (CPM)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {campaignData.pricing_model === 'flat_rate' ? 'Flat Rate Amount ($)' : 'CPM Rate ($)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={campaignData.pricing_model === 'flat_rate' ? campaignData.flat_rate_amount : campaignData.cpm_rate}
                    onChange={(e) => setCampaignData({
                      ...campaignData,
                      [campaignData.pricing_model === 'flat_rate' ? 'flat_rate_amount' : 'cpm_rate']: parseFloat(e.target.value) || 0
                    })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Campaign Banners</h3>
                <button
                  onClick={addBanner}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Plus size={16} />
                  Add Banner
                </button>
              </div>

              {banners.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700">
                  <ImageIcon size={48} className="mx-auto text-gray-400 dark:text-gray-500 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 mb-4">No banners added yet</p>
                  <button
                    onClick={addBanner}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Add Your First Banner
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {banners.map((banner, index) => (
                    <div
                      key={banner.id}
                      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <h4 className="font-medium text-gray-900 dark:text-white">Banner {index + 1}</h4>
                        <button
                          onClick={() => removeBanner(banner.id)}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded text-red-600 dark:text-red-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Banner Name *
                          </label>
                          <input
                            type="text"
                            value={banner.name}
                            onChange={(e) => updateBanner(banner.id, { name: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="Banner name"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Ad Type
                          </label>
                          <select
                            value={banner.ad_type}
                            onChange={(e) => updateBanner(banner.id, { ad_type: e.target.value as any })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          >
                            <option value="image">Image Banner</option>
                            <option value="html5">HTML5 Banner</option>
                            <option value="adsense">Google AdSense</option>
                            <option value="text">Text Ad</option>
                          </select>
                        </div>
                      </div>

                      {banner.ad_type === 'image' && (
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Banner Image *
                          </label>
                          <div className="flex items-start gap-4">
                            <div className="relative flex-shrink-0">
                              {banner.image_url ? (
                                <div className="relative w-32 h-32 rounded-lg border-2 border-gray-300 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-700">
                                  <img
                                    src={banner.image_url}
                                    alt="Banner preview"
                                    className="w-full h-full object-contain p-2"
                                  />
                                  {uploadingBannerId === banner.id && (
                                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
                                  <ImageIcon size={32} className="text-gray-400 dark:text-gray-600" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1">
                              <label className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer transition-colors w-fit">
                                <Upload size={16} />
                                <span>Upload Image</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleBannerImageChange(banner.id, e)}
                                  className="hidden"
                                />
                              </label>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                Recommended: PNG or JPG, max 5MB
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          <div className="flex items-center gap-2">
                            <TargetIcon size={16} />
                            Target Placements
                          </div>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          {placements.map((placement) => (
                            <label
                              key={placement.id}
                              className="flex items-start gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={banner.placement_ids.includes(placement.id)}
                                onChange={(e) => {
                                  const newIds = e.target.checked
                                    ? [...banner.placement_ids, placement.id]
                                    : banner.placement_ids.filter(id => id !== placement.id);
                                  updateBanner(banner.id, { placement_ids: newIds });
                                }}
                                className="mt-1 h-4 w-4 text-green-600 rounded"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-gray-900 dark:text-white text-sm">
                                  {placement.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  {placement.page_type} • {placement.position} • {placement.size_width}x{placement.size_height}px
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                        {placements.length === 0 && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                            No placements available. Please create placements in the Placements tab first.
                          </p>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Click URL
                          </label>
                          <input
                            type="text"
                            value={banner.link_url}
                            onChange={(e) => updateBanner(banner.id, { link_url: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            placeholder="https://example.com"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Width (px)
                          </label>
                          <input
                            type="number"
                            value={banner.size_width}
                            onChange={(e) => updateBanner(banner.id, { size_width: parseInt(e.target.value) || 300 })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Height (px)
                          </label>
                          <input
                            type="number"
                            value={banner.size_height}
                            onChange={(e) => updateBanner(banner.id, { size_height: parseInt(e.target.value) || 250 })}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Schedule & Targeting</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Start Date *
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={targetingData.start_date}
                      onChange={(e) => setTargetingData({ ...targetingData, start_date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    End Date *
                  </label>
                  <div className="relative">
                    <input
                      type="date"
                      value={targetingData.end_date}
                      onChange={(e) => setTargetingData({ ...targetingData, end_date: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white [color-scheme:light] dark:[color-scheme:dark]"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Priority (1-10)
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={targetingData.priority}
                  onChange={(e) => setTargetingData({ ...targetingData, priority: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mt-1">
                  <span>Low (1)</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">{targetingData.priority}</span>
                  <span>High (10)</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Budget Impressions
                  </label>
                  <input
                    type="number"
                    value={targetingData.budget_impressions}
                    onChange={(e) => setTargetingData({ ...targetingData, budget_impressions: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="0 = unlimited"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Budget Clicks
                  </label>
                  <input
                    type="number"
                    value={targetingData.budget_clicks}
                    onChange={(e) => setTargetingData({ ...targetingData, budget_clicks: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="0 = unlimited"
                  />
                </div>
              </div>

              {/* Geographic & Club Targeting */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
                <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <MapPin size={18} />
                  Geographic Targeting
                </h4>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <input
                      type="checkbox"
                      id="target_all"
                      checked={targetingData.target_all}
                      onChange={(e) => setTargetingData({
                        ...targetingData,
                        target_all: e.target.checked,
                        target_states: [],
                        target_club_ids: []
                      })}
                      className="h-4 w-4 text-green-600 rounded"
                    />
                    <label htmlFor="target_all" className="text-sm font-medium text-gray-900 dark:text-white">
                      Target all locations (no geographic restrictions)
                    </label>
                  </div>

                  {!targetingData.target_all && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Target States
                        </label>
                        <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          {Array.from(new Set(clubs.map(c => c.state).filter(Boolean))).sort().map((state) => (
                            <label
                              key={state}
                              className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={targetingData.target_states.includes(state!)}
                                onChange={(e) => {
                                  const newStates = e.target.checked
                                    ? [...targetingData.target_states, state!]
                                    : targetingData.target_states.filter(s => s !== state);
                                  setTargetingData({ ...targetingData, target_states: newStates });
                                }}
                                className="h-4 w-4 text-green-600 rounded"
                              />
                              <span className="text-sm text-gray-900 dark:text-white">{state}</span>
                            </label>
                          ))}
                        </div>
                        {targetingData.target_states.length > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {targetingData.target_states.length} state{targetingData.target_states.length !== 1 ? 's' : ''} selected
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                          <Building2 size={16} />
                          Target Specific Clubs
                        </label>
                        <div className="max-h-64 overflow-y-auto p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                          {clubs
                            .filter(club => targetingData.target_states.length === 0 || targetingData.target_states.includes(club.state || ''))
                            .map((club) => (
                              <label
                                key={club.id}
                                className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={targetingData.target_club_ids.includes(club.id)}
                                  onChange={(e) => {
                                    const newClubIds = e.target.checked
                                      ? [...targetingData.target_club_ids, club.id]
                                      : targetingData.target_club_ids.filter(id => id !== club.id);
                                    setTargetingData({ ...targetingData, target_club_ids: newClubIds });
                                  }}
                                  className="h-4 w-4 text-green-600 rounded"
                                />
                                <span className="text-sm text-gray-900 dark:text-white flex-1">{club.name}</span>
                                {club.state && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">{club.state}</span>
                                )}
                              </label>
                            ))}
                          {clubs.filter(club => targetingData.target_states.length === 0 || targetingData.target_states.includes(club.state || '')).length === 0 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                              No clubs available{targetingData.target_states.length > 0 ? ' in selected states' : ''}
                            </p>
                          )}
                        </div>
                        {targetingData.target_club_ids.length > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {targetingData.target_club_ids.length} club{targetingData.target_club_ids.length !== 1 ? 's' : ''} selected
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={targetingData.is_active}
                  onChange={(e) => setTargetingData({ ...targetingData, is_active: e.target.checked })}
                  className="h-4 w-4 text-green-600 rounded"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-900 dark:text-white">
                  Activate campaign immediately after creation
                </label>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Review Your Campaign</h3>

              {/* Campaign Summary */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Campaign Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Campaign Name:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{campaignData.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Advertiser:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {advertisers.find(a => a.id === campaignData.advertiser_id)?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Pricing:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {campaignData.pricing_model === 'flat_rate'
                        ? `$${campaignData.flat_rate_amount} Flat Rate`
                        : `$${campaignData.cpm_rate} CPM`
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {targetingData.start_date} to {targetingData.end_date}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Priority:</span>
                    <span className="font-medium text-gray-900 dark:text-white">{targetingData.priority}/10</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Status:</span>
                    <span className={`font-medium ${targetingData.is_active ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                      {targetingData.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Targeting Summary */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <TargetIcon size={16} />
                  Targeting
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Geographic Targeting:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {targetingData.target_all ? 'All Locations' : 'Specific Locations'}
                    </span>
                  </div>
                  {!targetingData.target_all && (
                    <>
                      {targetingData.target_states.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Target States:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {targetingData.target_states.join(', ')}
                          </span>
                        </div>
                      )}
                      {targetingData.target_club_ids.length > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Target Clubs:</span>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {targetingData.target_club_ids.length} club{targetingData.target_club_ids.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Ad Placements:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {(() => {
                        const allPlacementIds = new Set<string>();
                        banners.forEach(b => b.placement_ids.forEach(id => allPlacementIds.add(id)));
                        return allPlacementIds.size > 0 ? `${allPlacementIds.size} placement${allPlacementIds.size !== 1 ? 's' : ''}` : 'None selected';
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Banners Summary */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Banners ({banners.length})</h4>
                <div className="space-y-3">
                  {banners.map((banner, index) => (
                    <div key={banner.id} className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                      {banner.ad_type === 'image' && banner.image_url && (
                        <img
                          src={banner.image_url}
                          alt={banner.name}
                          className="w-16 h-16 object-cover rounded border border-gray-200 dark:border-gray-600"
                        />
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-white">{banner.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {banner.ad_type} • {banner.size_width}x{banner.size_height}px
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <p className="text-sm text-green-900 dark:text-green-200">
                  <strong>Ready to launch!</strong> Click "Create Campaign" to finalize and activate your advertising campaign with all configured banners.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-900">
          <div className="flex justify-between items-center">
            <button
              onClick={prevStep}
              disabled={currentStep === 1}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
              Previous
            </button>

            {currentStep < 4 ? (
              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Next
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create Campaign'}
                <Check size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

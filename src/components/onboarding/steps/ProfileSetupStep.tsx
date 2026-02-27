import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight, ArrowLeft, Upload, User, Loader } from 'lucide-react';
import { OnboardingData } from '../OnboardingWizard';
import { supabase } from '../../../utils/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotifications } from '../../../contexts/NotificationContext';
import { AvatarCropModal } from '../../ui/AvatarCropModal';
import imageCompression from 'browser-image-compression';
import { loadGoogleMaps } from '../../../utils/googleMaps';

interface ProfileSetupStepProps {
  darkMode: boolean;
  formData: OnboardingData;
  onNext: (data: Partial<OnboardingData>) => void;
  onBack: () => void;
}

export const ProfileSetupStep: React.FC<ProfileSetupStepProps> = ({
  darkMode,
  formData,
  onNext,
  onBack,
}) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [firstName, setFirstName] = useState(formData.firstName || '');
  const [lastName, setLastName] = useState(formData.lastName || '');
  const [phone, setPhone] = useState(formData.phone || '');

  const formatPhoneNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 4) return numbers;
    if (numbers.length <= 7) return `${numbers.slice(0, 4)} ${numbers.slice(4)}`;
    return `${numbers.slice(0, 4)} ${numbers.slice(4, 7)} ${numbers.slice(7, 10)}`;
  };

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value);
    setPhone(formatted);
  };
  const [street, setStreet] = useState(formData.street || '');
  const [city, setCity] = useState(formData.city || '');
  const [state, setState] = useState(formData.state || 'NSW');
  const [postcode, setPostcode] = useState(formData.postcode || '');
  const [avatarUrl, setAvatarUrl] = useState(formData.avatarUrl || '');
  const [uploading, setUploading] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [addressSelected, setAddressSelected] = useState(false);

  useEffect(() => {
    const fetchMemberAvatar = async () => {
      if (!user?.email || avatarUrl) return;

      try {
        const { data: member } = await supabase
          .from('members')
          .select('avatar_url, first_name, last_name, phone, street, city, state, postcode')
          .eq('email', user.email)
          .maybeSingle();

        if (member?.avatar_url) {
          setAvatarUrl(member.avatar_url);
        }
        if (member?.first_name && !firstName) setFirstName(member.first_name);
        if (member?.last_name && !lastName) setLastName(member.last_name);
        if (member?.phone && !phone) setPhone(member.phone);
        if (member?.street && !street) setStreet(member.street);
        if (member?.city && !city) setCity(member.city);
        if (member?.state && !state) setState(member.state);
        if (member?.postcode && !postcode) setPostcode(member.postcode);
      } catch (error) {
        console.error('Error fetching member data:', error);
      }
    };

    fetchMemberAvatar();
  }, [user?.email]);

  useEffect(() => {
    loadGoogleMaps(() => {
      if (!addressInputRef.current) return;

      const autocomplete = new google.maps.places.Autocomplete(addressInputRef.current, {
        componentRestrictions: { country: 'au' },
        fields: ['address_components', 'formatted_address'],
        types: ['address'],
      });

      autocompleteRef.current = autocomplete;

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.address_components) return;

        let streetNumber = '';
        let streetName = '';
        let suburb = '';
        let stateValue = '';
        let postcodeValue = '';

        place.address_components.forEach((component) => {
          const types = component.types;
          if (types.includes('street_number')) {
            streetNumber = component.long_name;
          } else if (types.includes('route')) {
            streetName = component.long_name;
          } else if (types.includes('locality') || types.includes('postal_town')) {
            suburb = component.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            stateValue = component.short_name;
          } else if (types.includes('postal_code')) {
            postcodeValue = component.long_name;
          }
        });

        const fullStreet = `${streetNumber} ${streetName}`.trim();
        setStreet(fullStreet);
        setCity(suburb);
        setState(stateValue);
        setPostcode(postcodeValue);
        setAddressSelected(true);
      });
    });

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      addNotification('error', 'Please select an image file');
      return;
    }

    setSelectedImageFile(file);
    setShowCropModal(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCroppedImage = async (croppedBlob: Blob) => {
    if (!user) return;

    try {
      setUploading(true);
      setShowCropModal(false);

      const fileName = `${user.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, croppedBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      setAvatarUrl(publicUrl);
      addNotification('success', 'Avatar uploaded successfully');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      addNotification('error', 'Failed to upload avatar. Please try again.');
    } finally {
      setUploading(false);
      setSelectedImageFile(null);
    }
  };

  const handleContinue = () => {
    if (!firstName || !lastName || !phone) {
      addNotification('error', 'Please fill in all required fields');
      return;
    }

    onNext({
      firstName,
      lastName,
      phone,
      street: street || undefined,
      city: city || undefined,
      state: state || undefined,
      postcode: postcode || undefined,
      avatarUrl: avatarUrl || undefined,
    });
  };

  const australianStates = [
    'NSW',
    'VIC',
    'QLD',
    'SA',
    'WA',
    'TAS',
    'NT',
    'ACT',
  ];

  return (
    <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl p-6 sm:p-8 md:p-12">
      <h2 className={`text-xl sm:text-2xl font-bold mb-1 sm:mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
        Your Profile
      </h2>
      <p className={`mb-4 sm:mb-6 text-sm sm:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        Tell us a bit about yourself
      </p>

      <div className="space-y-4 sm:space-y-6">
          <div className="flex justify-center mb-6 sm:mb-8">
            <div className="relative">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={`relative w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-4 transition-all ${
                  darkMode ? 'border-slate-700' : 'border-slate-200'
                } ${uploading ? 'opacity-50' : 'hover:border-blue-500'} group`}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center ${
                    darkMode ? 'bg-slate-800' : 'bg-slate-100'
                  }`}>
                    <User size={36} className={`sm:w-12 sm:h-12 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
                  </div>
                )}

                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploading ? (
                    <Loader className="animate-spin text-white w-5 h-5 sm:w-6 sm:h-6" />
                  ) : (
                    <Upload className="text-white w-5 h-5 sm:w-6 sm:h-6" />
                  )}
                </div>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>
          </div>

          <p className={`text-center text-xs sm:text-sm -mt-3 sm:-mt-4 mb-4 sm:mb-6 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Click to upload a profile photo (optional)
          </p>

          <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg ${
                  darkMode
                    ? 'bg-slate-700 text-white border-slate-600'
                    : 'bg-white text-slate-900 border-slate-300'
                } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                placeholder="John"
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={`w-full px-4 py-3 rounded-lg ${
                  darkMode
                    ? 'bg-slate-700 text-white border-slate-600'
                    : 'bg-white text-slate-900 border-slate-300'
                } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                placeholder="Smith"
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              className={`w-full px-4 py-3 rounded-lg ${
                darkMode
                  ? 'bg-slate-700 text-white border-slate-600'
                  : 'bg-white text-slate-900 border-slate-300'
              } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              placeholder="0412 345 678"
              maxLength={12}
            />
          </div>

          <div>
            <h3 className={`font-medium mb-2 text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
              Address <span className="text-red-500">*</span>
            </h3>

            <div className="space-y-2 sm:space-y-3">
              <div>
                <label className={`block text-xs mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Start typing your address
                </label>
                <input
                  ref={addressInputRef}
                  type="text"
                  placeholder="Start typing your address..."
                  className={`w-full px-4 py-3 rounded-lg ${
                    darkMode
                      ? 'bg-slate-700 text-white border-slate-600'
                      : 'bg-white text-slate-900 border-slate-300'
                  } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                />
              </div>

              {addressSelected && (
                <>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className={`w-full px-4 py-3 rounded-lg ${
                      darkMode
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-white text-slate-900 border-slate-300'
                    } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="Street Address"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className={`w-full px-4 py-3 rounded-lg ${
                        darkMode
                          ? 'bg-slate-700 text-white border-slate-600'
                          : 'bg-white text-slate-900 border-slate-300'
                      } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                      placeholder="City"
                    />

                    <select
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className={`w-full px-4 py-3 rounded-lg ${
                        darkMode
                          ? 'bg-slate-700 text-white border-slate-600'
                          : 'bg-white text-slate-900 border-slate-300'
                      } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    >
                      {australianStates.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <input
                    type="text"
                    value={postcode}
                    onChange={(e) => setPostcode(e.target.value)}
                    className={`w-full px-4 py-3 rounded-lg ${
                      darkMode
                        ? 'bg-slate-700 text-white border-slate-600'
                        : 'bg-white text-slate-900 border-slate-300'
                    } border focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                    placeholder="Postcode"
                    maxLength={4}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:justify-between">
          <button
            onClick={onBack}
            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium transition-colors text-sm sm:text-base ${
              darkMode
                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
            Back
          </button>

          <button
            onClick={handleContinue}
            className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-green-700 transition-all shadow-lg text-sm sm:text-base"
          >
            Continue
            <ArrowRight size={18} className="sm:w-5 sm:h-5" />
          </button>
        </div>

      {selectedImageFile && (
        <AvatarCropModal
          isOpen={showCropModal}
          imageFile={selectedImageFile}
          onClose={() => {
            setShowCropModal(false);
            setSelectedImageFile(null);
          }}
          onCrop={handleCroppedImage}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};

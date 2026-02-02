import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Mail, Phone, MapPin } from 'lucide-react';

interface ClubContactStepProps {
  data: {
    email: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    website?: string;
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  onUpdate: (data: any) => void;
  onNext: () => void;
  onBack: () => void;
}

export const ClubContactStep: React.FC<ClubContactStepProps> = ({
  data,
  onUpdate,
  onNext,
  onBack,
}) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!data.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!validateEmail(data.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Contact Information</h2>
      <p className="text-slate-300 mb-6">
        How can members and visitors reach your club? This information will be
        displayed publicly on your website.
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            <Mail className="w-4 h-4 inline mr-1" />
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={data.email}
            onChange={(e) => onUpdate({ email: e.target.value })}
            placeholder="contact@yourclub.com"
            className={`w-full px-4 py-3 bg-slate-800 text-white border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent ${
              errors.email ? 'border-red-500' : 'border-slate-700'
            }`}
          />
          {errors.email && (
            <p className="text-red-500 text-sm mt-1">{errors.email}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            <Phone className="w-4 h-4 inline mr-1" />
            Phone Number
          </label>
          <input
            type="tel"
            value={data.phone || ''}
            onChange={(e) => onUpdate({ phone: e.target.value })}
            placeholder="+61 2 1234 5678"
            className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            <MapPin className="w-4 h-4 inline mr-1" />
            Street Address
          </label>
          <input
            type="text"
            value={data.address || ''}
            onChange={(e) => onUpdate({ address: e.target.value })}
            placeholder="123 Marina Drive"
            className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              City
            </label>
            <input
              type="text"
              value={data.city || ''}
              onChange={(e) => onUpdate({ city: e.target.value })}
              placeholder="Newcastle"
              className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              State/Province
            </label>
            <input
              type="text"
              value={data.state || ''}
              onChange={(e) => onUpdate({ state: e.target.value })}
              placeholder="NSW"
              className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Postcode
            </label>
            <input
              type="text"
              value={data.postcode || ''}
              onChange={(e) => onUpdate({ postcode: e.target.value })}
              placeholder="2300"
              className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Country
            </label>
            <input
              type="text"
              value={data.country || ''}
              onChange={(e) => onUpdate({ country: e.target.value })}
              placeholder="Australia"
              className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="border-t border-slate-700 pt-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Online Presence (Optional)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Facebook
              </label>
              <input
                type="text"
                value={data.facebook || ''}
                onChange={(e) => onUpdate({ facebook: e.target.value })}
                placeholder="@yourclub"
                className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Instagram
              </label>
              <input
                type="text"
                value={data.instagram || ''}
                onChange={(e) => onUpdate({ instagram: e.target.value })}
                placeholder="@yourclub"
                className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Twitter/X
              </label>
              <input
                type="text"
                value={data.twitter || ''}
                onChange={(e) => onUpdate({ twitter: e.target.value })}
                placeholder="@yourclub"
                className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 hover:text-white transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-lg"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { ArrowRight, ArrowLeft, DollarSign, FileText } from 'lucide-react';

interface ClubFinancialStepProps {
  data: {
    taxType?: string;
    taxId?: string;
    currency?: string;
  };
  onUpdate: (data: any) => void;
  onNext: () => void;
  onBack: () => void;
}

const TAX_TYPES = [
  { value: 'gst', label: 'GST (Australia)' },
  { value: 'vat', label: 'VAT (UK/Europe)' },
  { value: 'sales_tax', label: 'Sales Tax (US)' },
  { value: 'none', label: 'No Tax' },
];

const CURRENCIES = [
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'NZD', label: 'NZD - New Zealand Dollar' },
];

export const ClubFinancialStep: React.FC<ClubFinancialStepProps> = ({
  data,
  onUpdate,
  onNext,
  onBack,
}) => {
  const handleSkip = () => {
    onNext();
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Financial Information</h2>
      <p className="text-slate-300 mb-6">
        Set up your club's financial details for invoicing and payment collection.
        You can configure more detailed settings later.
      </p>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            <DollarSign className="w-4 h-4 inline mr-1" />
            Currency
          </label>
          <select
            value={data.currency || 'AUD'}
            onChange={(e) => onUpdate({ currency: e.target.value })}
            className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.value} value={currency.value}>
                {currency.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-200 mb-2">
            <FileText className="w-4 h-4 inline mr-1" />
            Tax Type
          </label>
          <select
            value={data.taxType || ''}
            onChange={(e) => onUpdate({ taxType: e.target.value })}
            className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">Select tax type</option>
            {TAX_TYPES.map((tax) => (
              <option key={tax.value} value={tax.value}>
                {tax.label}
              </option>
            ))}
          </select>
        </div>

        {data.taxType && data.taxType !== 'none' && (
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-2">
              Tax ID / ABN / Registration Number
            </label>
            <input
              type="text"
              value={data.taxId || ''}
              onChange={(e) => onUpdate({ taxId: e.target.value })}
              placeholder={
                data.taxType === 'gst'
                  ? 'e.g., 12 345 678 901'
                  : 'Enter your tax registration number'
              }
              className="w-full px-4 py-3 bg-slate-800 text-white border border-slate-700 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-slate-400 text-sm mt-1">
              {data.taxType === 'gst' && 'Your 11-digit Australian Business Number'}
              {data.taxType === 'vat' && 'Your VAT registration number'}
              {data.taxType === 'sales_tax' && 'Your tax identification number'}
            </p>
          </div>
        )}

        <div className="bg-blue-50/10 border border-blue-200/20 rounded-lg p-4">
          <h4 className="font-semibold text-blue-300 mb-2">About Payment Processing</h4>
          <p className="text-sm text-slate-300 mb-2">
            AlfiePro uses Stripe to securely process membership payments and fees.
            After completing setup, you'll connect your Stripe account to:
          </p>
          <ul className="text-sm text-slate-300 space-y-1 ml-4">
            <li>• Collect membership dues automatically</li>
            <li>• Process event registration fees</li>
            <li>• Track all financial transactions</li>
            <li>• Generate financial reports</li>
          </ul>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <p className="text-sm text-slate-300">
            <strong>Note:</strong> These settings can be updated anytime from your
            Finance Settings page. You can also configure invoice templates,
            payment terms, and other financial preferences later.
          </p>
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
        <div className="flex gap-3">
          <button
            onClick={handleSkip}
            className="px-6 py-2 text-slate-400 hover:text-slate-200 font-medium transition-colors"
          >
            Skip for now
          </button>
          <button
            onClick={onNext}
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-lg"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

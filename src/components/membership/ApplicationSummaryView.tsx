import React from 'react';
import { User, MapPin, Award, Anchor, AlertCircle, CreditCard, CheckCircle } from 'lucide-react';
import { Avatar } from '../ui/Avatar';

interface ApplicationData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street?: string;
  city?: string;
  state?: string;
  postcode?: string;
  avatar_url?: string;
  membership_type_name?: string;
  membership_amount?: string | number;
  boats?: Array<{ type: string; sailNumber: string; hullName?: string }>;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  payment_method: string;
  code_of_conduct_accepted?: boolean;
}

interface ClubData {
  name: string;
  logo?: string;
  bank_name?: string;
  bsb?: string;
  account_number?: string;
}

interface ApplicationSummaryViewProps {
  darkMode: boolean;
  application: ApplicationData;
  club?: ClubData;
  mode?: 'review' | 'admin';
  onApprove?: () => void;
  onReject?: () => void;
  processing?: boolean;
}

export const ApplicationSummaryView: React.FC<ApplicationSummaryViewProps> = ({
  darkMode,
  application,
  club,
  mode = 'review',
  onApprove,
  onReject,
  processing = false,
}) => {
  const InfoSection = ({ icon: Icon, title, children, iconColor, rightContent }: any) => (
    <div className="p-4 sm:p-5 md:p-6 rounded-xl bg-slate-700/30 backdrop-blur-sm border border-slate-600/30">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg ${iconColor} flex items-center justify-center flex-shrink-0`}>
            <Icon className="text-white w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <h3 className={`font-semibold text-base sm:text-lg ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            {title}
          </h3>
        </div>
        {rightContent && <div className="sm:ml-auto">{rightContent}</div>}
      </div>
      {children}
    </div>
  );

  const InfoRow = ({ label, value }: { label: string; value: string | undefined }) => (
    <div className="flex flex-col sm:flex-row sm:justify-between py-2 border-b border-slate-700/30 last:border-0 gap-1 sm:gap-2">
      <span className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{label}:</span>
      <span className={`font-medium text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
        {value || 'Not specified'}
      </span>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {club && (
        <InfoSection
          icon={MapPin}
          title="Club"
          iconColor="bg-green-500"
          rightContent={
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                {club.logo ? (
                  <img
                    src={club.logo}
                    alt={club.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent) {
                        parent.innerHTML = `<span class="text-white font-semibold text-base sm:text-xl">${club.name?.charAt(0) || 'C'}</span>`;
                      }
                    }}
                  />
                ) : (
                  <span className="text-white font-semibold text-base sm:text-xl">{club.name?.charAt(0) || 'C'}</span>
                )}
              </div>
              <div className={`font-medium text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                {club.name || 'Not selected'}
              </div>
            </div>
          }
        >
          <div className="text-xs sm:text-sm text-slate-400">
            Selected sailing club
          </div>
        </InfoSection>
      )}

      <InfoSection
        icon={User}
        title="Personal Information"
        iconColor="bg-blue-500"
        rightContent={
          <div className="flex items-center gap-2 sm:gap-3">
            <Avatar
              firstName={application.first_name}
              lastName={application.last_name}
              imageUrl={application.avatar_url}
              size="md"
            />
            <div className={`font-medium text-sm sm:text-lg ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
              {application.first_name} {application.last_name}
            </div>
          </div>
        }
      >
        <InfoRow label="Email" value={application.email} />
        <InfoRow label="Phone" value={application.phone} />
        {application.street && (
          <InfoRow
            label="Address"
            value={`${application.street}, ${application.city} ${application.state} ${application.postcode}`}
          />
        )}
      </InfoSection>

      <InfoSection icon={Award} title="Membership" iconColor="bg-green-500">
        <InfoRow label="Type" value={application.membership_type_name} />
        <InfoRow
          label="Amount"
          value={application.membership_amount ? `$${application.membership_amount} AUD/year` : undefined}
        />
      </InfoSection>

      {application.boats && application.boats.length > 0 && (
        <InfoSection icon={Anchor} title="Boat(s)" iconColor="bg-cyan-500">
          <div className="space-y-2 sm:space-y-3">
            {application.boats.map((boat, index) => (
              <div
                key={index}
                className="p-2.5 sm:p-3 rounded-lg bg-slate-700/30 backdrop-blur-sm border border-slate-600/30"
              >
                <div className={`font-medium mb-0.5 sm:mb-1 text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                  {boat.type} - #{boat.sailNumber}
                </div>
                {boat.hullName && (
                  <div className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {boat.hullName}
                  </div>
                )}
              </div>
            ))}
          </div>
        </InfoSection>
      )}

      <InfoSection icon={AlertCircle} title="Emergency Contact" iconColor="bg-red-500">
        <InfoRow label="Name" value={application.emergency_contact_name} />
        <InfoRow label="Phone" value={application.emergency_contact_phone} />
        <InfoRow label="Relationship" value={application.emergency_contact_relationship} />
      </InfoSection>

      <InfoSection icon={CreditCard} title="Payment Method" iconColor="bg-amber-500">
        <InfoRow
          label="Method"
          value={application.payment_method === 'card' ? 'Online Card Payment' : 'Bank Transfer'}
        />
        {application.payment_method === 'bank_transfer' && (
          <>
            <div className={`mt-2 sm:mt-3 p-2.5 sm:p-3 rounded-lg text-xs sm:text-sm ${
              darkMode ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'
            }`}>
              Please transfer the membership fee to the club's bank account using your name as the reference.
            </div>
            {club && (club.bank_name || club.bsb || club.account_number) && (
              <div className={`mt-2 sm:mt-3 p-3 sm:p-4 rounded-lg border ${
                darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-white border-slate-200'
              }`}>
                <div className={`font-semibold mb-2 sm:mb-3 text-sm sm:text-base ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                  Bank Details
                </div>
                {club.bank_name && (
                  <div className="mb-1.5 sm:mb-2">
                    <span className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Bank Name: </span>
                    <span className={`font-medium text-xs sm:text-sm ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      {club.bank_name}
                    </span>
                  </div>
                )}
                {club.bsb && (
                  <div className="mb-1.5 sm:mb-2">
                    <span className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>BSB: </span>
                    <span className={`font-medium text-xs sm:text-sm ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      {club.bsb}
                    </span>
                  </div>
                )}
                {club.account_number && (
                  <div>
                    <span className={`text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>Account Number: </span>
                    <span className={`font-medium text-xs sm:text-sm ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      {club.account_number}
                    </span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </InfoSection>

      {application.code_of_conduct_accepted && (
        <div className={`p-3 sm:p-4 rounded-lg ${darkMode ? 'bg-green-500/10 border border-green-500/20' : 'bg-green-50 border border-green-200'}`}>
          <div className="flex items-start gap-2 sm:gap-3">
            <CheckCircle className="text-green-500 flex-shrink-0 mt-0.5 w-4 h-4 sm:w-5 sm:h-5" />
            <div>
              <p className={`font-medium mb-0.5 sm:mb-1 text-sm sm:text-base ${darkMode ? 'text-green-300' : 'text-green-800'}`}>
                Code of Conduct Accepted
              </p>
              <p className={`text-xs sm:text-sm ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                Agreed to abide by the club's code of conduct
              </p>
            </div>
          </div>
        </div>
      )}

      {mode === 'admin' && onApprove && onReject && (
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            onClick={onApprove}
            disabled={processing}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-all shadow-lg hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            <CheckCircle size={20} />
            {processing ? 'Processing...' : 'Approve Application'}
          </button>

          <button
            onClick={onReject}
            disabled={processing}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-all shadow-lg hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
          >
            <AlertCircle size={20} />
            {processing ? 'Processing...' : 'Reject Application'}
          </button>
        </div>
      )}
    </div>
  );
};

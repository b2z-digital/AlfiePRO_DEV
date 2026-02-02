import React, { useState, useEffect } from 'react';
import { LogOut, DollarSign, Calendar, FileText, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import {
  recordAssociationPayment,
  markRemittancesAsPaid,
  getRemittancesWithMembers,
  MembershipRemittance
} from '../../utils/remittanceStorage';

interface RecordPaymentModalProps {
  darkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  paymentDirection: 'club_to_state' | 'state_to_national';
  fromEntityId: string;
  toEntityId: string;
  onPaymentRecorded?: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  darkMode,
  isOpen,
  onClose,
  paymentDirection,
  fromEntityId,
  toEntityId,
  onPaymentRecorded
}) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [pendingRemittances, setPendingRemittances] = useState<MembershipRemittance[]>([]);
  const [formData, setFormData] = useState({
    paymentType: 'bulk' as 'bulk' | 'individual',
    paymentMethod: 'eft' as 'eft' | 'credit_card' | 'cheque' | 'cash' | 'other',
    paymentDate: new Date().toISOString().split('T')[0],
    amount: '',
    paymentReference: '',
    externalReference: '',
    membershipYear: new Date().getFullYear(),
    notes: ''
  });

  useEffect(() => {
    if (isOpen && paymentDirection === 'club_to_state') {
      loadPendingRemittances();
    }
  }, [isOpen, paymentDirection]);

  const loadPendingRemittances = async () => {
    try {
      const remittances = await getRemittancesWithMembers(fromEntityId, {
        status: 'pending',
        year: formData.membershipYear
      });
      setPendingRemittances(remittances);

      // Calculate suggested amount
      const totalOwed = remittances.reduce(
        (sum, r) => sum + (paymentDirection === 'club_to_state'
          ? r.state_contribution_amount
          : r.national_contribution_amount),
        0
      );
      setFormData(prev => ({ ...prev, amount: totalOwed.toFixed(2) }));
    } catch (error) {
      console.error('Error loading pending remittances:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Determine entity types based on payment direction
      const fromType = paymentDirection === 'club_to_state' ? 'club' : 'state_association';
      const toType = paymentDirection === 'club_to_state' ? 'state_association' : 'national_association';

      // Record the payment
      const payment = await recordAssociationPayment({
        from_entity_type: fromType,
        from_entity_id: fromEntityId,
        to_entity_type: toType,
        to_entity_id: toEntityId,
        payment_type: formData.paymentType,
        payment_method: formData.paymentMethod,
        payment_date: formData.paymentDate,
        amount: parseFloat(formData.amount),
        payment_reference: formData.paymentReference || null,
        external_reference: formData.externalReference || null,
        membership_year: formData.membershipYear,
        notes: formData.notes || null,
        reconciliation_status: 'unreconciled'
      });

      if (!payment) {
        throw new Error('Failed to record payment');
      }

      // If bulk payment, auto-reconcile with pending remittances
      if (formData.paymentType === 'bulk' && pendingRemittances.length > 0) {
        const remittanceIds = pendingRemittances.map(r => r.id);
        const reconciledCount = await markRemittancesAsPaid(
          remittanceIds,
          payment.id,
          paymentDirection
        );

        addNotification({
          type: 'success',
          message: `Payment recorded and ${reconciledCount} remittances marked as paid`,
          duration: 5000
        });
      } else {
        addNotification({
          type: 'success',
          message: 'Payment recorded successfully',
          duration: 3000
        });
      }

      if (onPaymentRecorded) {
        onPaymentRecorded();
      }

      onClose();
    } catch (error) {
      console.error('Error recording payment:', error);
      addNotification({
        type: 'error',
        message: 'Failed to record payment. Please try again.',
        duration: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  const paymentTitle = paymentDirection === 'club_to_state'
    ? 'Record Payment to State Association'
    : 'Record Payment to National Association';

  const totalOwed = pendingRemittances.reduce(
    (sum, r) => sum + (paymentDirection === 'club_to_state'
      ? r.state_contribution_amount
      : r.national_contribution_amount),
    0
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto ${
        darkMode ? 'bg-gray-800' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`sticky top-0 px-6 py-4 border-b flex items-center justify-between ${
          darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        } z-10`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                {paymentTitle}
              </h2>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Record membership fee payment
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Outstanding Summary */}
          {paymentDirection === 'club_to_state' && pendingRemittances.length > 0 && (
            <div className={`p-4 rounded-lg border ${
              darkMode ? 'bg-blue-900 bg-opacity-20 border-blue-800' : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className={`font-medium ${darkMode ? 'text-blue-400' : 'text-blue-900'}`}>
                    Outstanding Remittances
                  </p>
                  <p className={`text-sm mt-1 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                    {pendingRemittances.length} pending members for {formData.membershipYear}
                  </p>
                  <p className={`text-lg font-bold mt-2 ${darkMode ? 'text-blue-400' : 'text-blue-900'}`}>
                    Total Owed: ${totalOwed.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Payment Type */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Payment Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleChange('paymentType', 'bulk')}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  formData.paymentType === 'bulk'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20'
                    : darkMode
                    ? 'border-gray-600 hover:border-gray-500'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <p className={`font-medium ${
                  formData.paymentType === 'bulk'
                    ? 'text-blue-600 dark:text-blue-400'
                    : darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Bulk Payment
                </p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Annual or lump sum
                </p>
              </button>
              <button
                type="button"
                onClick={() => handleChange('paymentType', 'individual')}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  formData.paymentType === 'individual'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20'
                    : darkMode
                    ? 'border-gray-600 hover:border-gray-500'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <p className={`font-medium ${
                  formData.paymentType === 'individual'
                    ? 'text-blue-600 dark:text-blue-400'
                    : darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Individual Payment
                </p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Single member
                </p>
              </button>
            </div>
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Amount ($)
              </label>
              <div className="relative">
                <DollarSign className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                  darkMode ? 'text-gray-400' : 'text-gray-500'
                }`} />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => handleChange('amount', e.target.value)}
                  required
                  className={`w-full pl-10 pr-3 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Payment Date
              </label>
              <div className="relative">
                <Calendar className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                  darkMode ? 'text-gray-400' : 'text-gray-500'
                }`} />
                <input
                  type="date"
                  value={formData.paymentDate}
                  onChange={(e) => handleChange('paymentDate', e.target.value)}
                  required
                  className={`w-full pl-10 pr-3 py-2 rounded-lg border ${
                    darkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-white border-gray-300 text-gray-900'
                  } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                />
              </div>
            </div>
          </div>

          {/* Payment Method and Year */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Payment Method
              </label>
              <select
                value={formData.paymentMethod}
                onChange={(e) => handleChange('paymentMethod', e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              >
                <option value="eft">EFT / Bank Transfer</option>
                <option value="credit_card">Credit Card</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Membership Year
              </label>
              <input
                type="number"
                min="2020"
                max="2100"
                value={formData.membershipYear}
                onChange={(e) => handleChange('membershipYear', parseInt(e.target.value))}
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-white border-gray-300 text-gray-900'
                } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
            </div>
          </div>

          {/* Payment References */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Internal Reference
              </label>
              <input
                type="text"
                value={formData.paymentReference}
                onChange={(e) => handleChange('paymentReference', e.target.value)}
                placeholder="e.g., Payment-2025-001"
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Bank Reference
              </label>
              <input
                type="text"
                value={formData.externalReference}
                onChange={(e) => handleChange('externalReference', e.target.value)}
                placeholder="e.g., EFT-12345"
                className={`w-full px-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Notes (Optional)
            </label>
            <div className="relative">
              <FileText className={`absolute left-3 top-3 w-4 h-4 ${
                darkMode ? 'text-gray-400' : 'text-gray-500'
              }`} />
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={3}
                placeholder="Add any additional notes about this payment..."
                className={`w-full pl-10 pr-3 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                } focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
              />
            </div>
          </div>

          {/* Auto-reconciliation notice */}
          {formData.paymentType === 'bulk' && pendingRemittances.length > 0 && (
            <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
              <p className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <strong>Note:</strong> This bulk payment will automatically reconcile {pendingRemittances.length} pending remittances for {formData.membershipYear}.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                darkMode
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              } ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.amount || parseFloat(formData.amount) <= 0}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                loading || !formData.amount || parseFloat(formData.amount) <= 0
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              } text-white`}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4" />
                  Record Payment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

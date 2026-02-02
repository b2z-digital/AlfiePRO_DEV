import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { DollarSign, TrendingUp, Receipt, FileText, BarChart3 } from 'lucide-react';
import { FinancesOverview } from '../components/finances/FinancesOverview';
import { FinancesTransactions } from '../components/finances/FinancesTransactions';
import { FinancesInvoices } from '../components/finances/FinancesInvoices';
import { FinancesBudget } from '../components/finances/FinancesBudget';
import { FinancesReports } from '../components/finances/FinancesReports';
import { NewTransactionModal } from '../components/finances/NewTransactionModal';

interface FinancesPageProps {
  darkMode: boolean;
}

export const FinancesPage: React.FC<FinancesPageProps> = ({ darkMode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showNewTransactionModal, setShowNewTransactionModal] = useState(false);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: DollarSign, path: '/finances' },
    { id: 'transactions', label: 'Transactions', icon: TrendingUp, path: '/finances/transactions' },
    { id: 'invoices', label: 'Invoices', icon: Receipt, path: '/finances/invoices' },
    { id: 'budget', label: 'Budget', icon: BarChart3, path: '/finances/budget' },
    { id: 'reports', label: 'Reports', icon: FileText, path: '/finances/reports' }
  ];

  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/finances') return 'overview';
    if (path.includes('/transactions')) return 'transactions';
    if (path.includes('/invoices')) return 'invoices';
    if (path.includes('/budget')) return 'budget';
    if (path.includes('/reports')) return 'reports';
    return 'overview';
  };

  const activeTab = getActiveTab();

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <DollarSign className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Financial Management</h1>
            <p className="text-slate-400">Manage your club's finances, invoices, and budgets</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-8 border-b border-slate-700">
          <div className="flex space-x-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => navigate(tab.path)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap
                    ${isActive
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-300'
                    }
                  `}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-8">
          <Routes>
            <Route path="/" element={
              <FinancesOverview
                darkMode={darkMode}
                onNewTransaction={() => setShowNewTransactionModal(true)}
                onTabChange={(tab) => navigate(`/finances/${tab}`)}
              />} />
            <Route path="/transactions" element={<FinancesTransactions darkMode={darkMode} />} />
            <Route path="/invoices/*" element={<FinancesInvoices darkMode={darkMode} />} />
            <Route path="/budget" element={<FinancesBudget darkMode={darkMode} />} />
            <Route path="/reports" element={<FinancesReports darkMode={darkMode} />} />
          </Routes>
        </div>
      </div>

      {/* New Transaction Modal */}
      {showNewTransactionModal && (
        <NewTransactionModal
          isOpen={showNewTransactionModal}
          onClose={() => setShowNewTransactionModal(false)}
          darkMode={darkMode}
        />
      )}
    </div>
  );
};
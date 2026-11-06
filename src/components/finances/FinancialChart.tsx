import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ChartOptions,
  TooltipItem,
  InteractionItem
} from 'chart.js';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatCurrency } from '../../utils/formatCurrency';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface FinancialChartProps {
  darkMode?: boolean;
  period?: PeriodType;
  onPeriodChange?: (period: PeriodType) => void;
  associationId?: string;
  associationType?: 'state' | 'national';
  className?: string;
}

interface TransactionData {
  date: string;
  income: number;
  expenses: number;
  net: number;
}

type PeriodType = '7d' | '30d' | '90d' | '1y';
type ViewType = 'daily' | 'cumulative';

export const FinancialChart: React.FC<FinancialChartProps> = ({
  darkMode,
  period: externalPeriod,
  onPeriodChange,
  associationId,
  associationType,
  className = ''
}) => {
  const { currentClub } = useAuth();
  const [internalPeriod, setInternalPeriod] = useState<PeriodType>('30d');
  const period = externalPeriod || internalPeriod;
  const [viewType, setViewType] = useState<ViewType>('daily');

  const handlePeriodChange = (newPeriod: PeriodType) => {
    if (onPeriodChange) {
      onPeriodChange(newPeriod);
    } else {
      setInternalPeriod(newPeriod);
    }
  };
  const [data, setData] = useState<TransactionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState<{ value: number; direction: 'up' | 'down' | 'neutral' }>({
    value: 0,
    direction: 'neutral'
  });

  useEffect(() => {
    if (associationId || currentClub?.clubId) {
      fetchFinancialData();
    }
  }, [currentClub, period, associationId, associationType]);

  const fetchFinancialData = async () => {
    if (!associationId && !currentClub?.clubId) return;

    try {
      setLoading(true);

      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      let query;
      if (associationId && associationType) {
        query = supabase
          .from('association_transactions')
          .select('date, type, amount, payment_status')
          .eq('association_id', associationId)
          .eq('association_type', associationType);
      } else if (currentClub?.clubId) {
        query = supabase
          .from('transactions')
          .select('date, type, amount')
          .eq('club_id', currentClub.clubId);
      } else {
        return;
      }

      const { data: transactions, error } = await query
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;

      // Process data by date
      const dailyData: { [key: string]: { income: number; expenses: number } } = {};
      
      // Initialize all dates in range with zero values
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        dailyData[dateStr] = { income: 0, expenses: 0 };
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Aggregate transactions by date
      transactions?.forEach((transaction: any) => {
        // Skip pending transactions for associations
        if (transaction.payment_status && transaction.payment_status !== 'completed') {
          return;
        }

        const dateStr = transaction.date;
        if (!dailyData[dateStr]) {
          dailyData[dateStr] = { income: 0, expenses: 0 };
        }

        if (transaction.type === 'deposit' || transaction.type === 'income') {
          dailyData[dateStr].income += Number(transaction.amount);
        } else if (transaction.type === 'expense') {
          dailyData[dateStr].expenses += Number(transaction.amount);
        }
      });

      // Convert to array format
      const processedData: TransactionData[] = Object.entries(dailyData)
        .map(([date, values]) => ({
          date,
          income: values.income,
          expenses: values.expenses,
          net: values.income - values.expenses
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setData(processedData);

      // Calculate trend
      const currentPeriodNet = processedData.reduce((sum, d) => sum + d.net, 0);
      const previousPeriodStart = new Date(startDate);
      const previousPeriodEnd = new Date(startDate);
      const periodLength = endDate.getTime() - startDate.getTime();
      previousPeriodStart.setTime(startDate.getTime() - periodLength);

      let prevQuery;
      if (associationId && associationType) {
        prevQuery = supabase
          .from('association_transactions')
          .select('amount, type, payment_status')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('payment_status', 'completed');
      } else if (currentClub?.clubId) {
        prevQuery = supabase
          .from('transactions')
          .select('type, amount')
          .eq('club_id', currentClub.clubId);
      }

      const { data: previousTransactions } = prevQuery
        ? await prevQuery
            .gte('date', previousPeriodStart.toISOString().split('T')[0])
            .lt('date', startDate.toISOString().split('T')[0])
        : { data: [] };

      let previousPeriodNet = 0;
      previousTransactions?.forEach((transaction: any) => {
        if (transaction.type === 'deposit' || transaction.type === 'income') {
          previousPeriodNet += Number(transaction.amount);
        } else if (transaction.type === 'expense') {
          previousPeriodNet -= Number(transaction.amount);
        }
      });

      const trendValue = previousPeriodNet === 0 ? 0 : 
        ((currentPeriodNet - previousPeriodNet) / Math.abs(previousPeriodNet)) * 100;
      
      setTrend({
        value: Math.abs(trendValue),
        direction: trendValue > 0 ? 'up' : trendValue < 0 ? 'down' : 'neutral'
      });

    } catch (error) {
      console.error('Error fetching financial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChartData = () => {
    if (!data.length) return { labels: [], datasets: [] };

    let processedData = [...data];
    
    if (viewType === 'cumulative') {
      let cumulativeIncome = 0;
      let cumulativeExpenses = 0;
      let cumulativeNet = 0;
      
      processedData = data.map(item => {
        cumulativeIncome += item.income;
        cumulativeExpenses += item.expenses;
        cumulativeNet += item.net;
        
        return {
          date: item.date,
          income: cumulativeIncome,
          expenses: cumulativeExpenses,
          net: cumulativeNet
        };
      });
    }

    const labels = processedData.map(item => {
      const date = new Date(item.date);
      if (period === '7d') {
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      } else if (period === '30d' || period === '90d') {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }
    });

    return {
      labels,
      datasets: [
        {
          label: viewType === 'daily' ? 'Daily Income' : 'Cumulative Income',
          data: processedData.map(item => item.income),
          borderColor: 'rgba(34, 197, 94, 1)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: false,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 8,
          pointBackgroundColor: 'rgba(34, 197, 94, 1)',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: 'rgba(34, 197, 94, 1)',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 3,
        },
        {
          label: viewType === 'daily' ? 'Daily Expenses' : 'Cumulative Expenses',
          data: processedData.map(item => item.expenses),
          borderColor: 'rgba(239, 68, 68, 1)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: false,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 8,
          pointBackgroundColor: 'rgba(239, 68, 68, 1)',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: 'rgba(239, 68, 68, 1)',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 3,
        },
        {
          label: viewType === 'daily' ? 'Net Daily' : 'Net Cumulative',
          data: processedData.map(item => item.net),
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 8,
          pointBackgroundColor: 'rgba(59, 130, 246, 1)',
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointHoverBackgroundColor: 'rgba(59, 130, 246, 1)',
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 3,
        }
      ]
    };
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    hover: {
      mode: 'index',
      intersect: false,
      animationDuration: 200,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          padding: 20,
          color: darkMode ? '#e2e8f0' : '#475569',
          font: {
            size: 12,
            weight: '500'
          }
        }
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: darkMode ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        titleColor: darkMode ? '#e2e8f0' : '#1e293b',
        bodyColor: darkMode ? '#e2e8f0' : '#1e293b',
        borderColor: darkMode ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.3)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        displayColors: true,
        callbacks: {
          title: (context: TooltipItem<'line'>[]) => {
            if (context.length > 0) {
              const dataIndex = context[0].dataIndex;
              const date = new Date(data[dataIndex]?.date);
              return date.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              });
            }
            return '';
          },
          label: (context: TooltipItem<'line'>) => {
            const value = context.parsed.y;
            const label = context.dataset.label || '';
            return `${label}: $${value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: true,
          color: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
          drawBorder: false,
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#64748b',
          font: {
            size: 11
          },
          maxTicksLimit: 8
        }
      },
      y: {
        display: true,
        grid: {
          display: true,
          color: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
          drawBorder: false,
        },
        ticks: {
          color: darkMode ? '#94a3b8' : '#64748b',
          font: {
            size: 11
          },
          callback: function(value: any) {
            return '$' + value.toLocaleString();
          }
        }
      }
    },
    elements: {
      point: {
        hoverRadius: 8,
        radius: 4,
      },
      line: {
        borderWidth: 2,
      }
    },
    animation: {
      duration: 750,
      easing: 'easeInOutQuart',
    },
    onHover: (event, activeElements) => {
      if (event.native?.target) {
        (event.native.target as HTMLElement).style.cursor = 
          activeElements.length > 0 ? 'pointer' : 'default';
      }
    },
    onClick: (event, activeElements) => {
      if (activeElements.length > 0) {
        const dataIndex = activeElements[0].index;
        const clickedData = data[dataIndex];
        console.log('Clicked data point:', clickedData);
        // You can add custom click behavior here
      }
    }
  };

  const periodTotals = {
    income: data.reduce((sum, item) => sum + item.income, 0),
    expenses: data.reduce((sum, item) => sum + item.expenses, 0),
    net: data.reduce((sum, item) => sum + item.net, 0)
  };

  const TrendIcon = trend.direction === 'up' ? TrendingUp : 
                   trend.direction === 'down' ? TrendingDown : Minus;

  return (
    <div className={`a-card flex flex-col gap-4 ${className}`} style={{ padding: 22 }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="a-tile a-tile-sm"><TrendingUp size={17} /></span>
        <div className="flex-1 min-w-[180px]">
          <h2 className="a-display a-ink m-0 text-lg font-semibold">Financial position</h2>
          <p className={`mt-0.5 mb-0 text-[12.5px] flex items-center gap-1 ${trend.direction === 'up' ? 'a-txt-g' : trend.direction === 'down' ? 'a-txt-r' : 'a-dim'}`}>
            {trend.value > 0 && <TrendIcon size={13} />}
            {trend.value > 0 ? `${trend.value.toFixed(1)}% ${trend.direction === 'down' ? 'down' : 'up'}` : 'No change'} in the last {({ '7d': '7 days', '30d': '30 days', '90d': '90 days', '1y': 'year' } as Record<string, string>)[period] || 'period'}
          </p>
        </div>
        <div className="a-seg" role="tablist" aria-label="Chart view">
          <button role="tab" aria-selected={viewType === 'daily'} onClick={() => setViewType('daily')} className={`a-seg-i ${viewType === 'daily' ? 'a-seg-on' : ''}`}>Daily</button>
          <button role="tab" aria-selected={viewType === 'cumulative'} onClick={() => setViewType('cumulative')} className={`a-seg-i ${viewType === 'cumulative' ? 'a-seg-on' : ''}`}>Cumulative</button>
        </div>
        <div className="a-seg" role="tablist" aria-label="Period">
          {([['7d', '7D'], ['30d', '30D'], ['90d', '90D'], ['1y', '1Y']] as [PeriodType, string][]).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={period === key} onClick={() => handlePeriodChange(key)} className={`a-seg-i ${period === key ? 'a-seg-on' : ''}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="h-80 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/10 border-t-[#0A84FF]"></div>
          </div>
        ) : (
          <>
            <Line data={getChartData()} options={chartOptions} />
            {periodTotals.income === 0 && periodTotals.expenses === 0 && (
              <div className="a-chart-empty"><span className="a-light" />No transactions in this period</div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="a-inset" style={{ padding: '14px 16px', borderRadius: 16 }}>
          <span className="a-st a-mute text-[12.5px]"><span className="a-light" style={{ background: '#30D158', boxShadow: 'none' }} />Period income</span>
          <div className="a-num a-ink text-2xl font-semibold mt-2 leading-none">${formatCurrency(periodTotals.income)}</div>
        </div>
        <div className="a-inset" style={{ padding: '14px 16px', borderRadius: 16 }}>
          <span className="a-st a-mute text-[12.5px]"><span className="a-light" style={{ background: '#FF6B6B', boxShadow: 'none' }} />Period expenses</span>
          <div className="a-num a-ink text-2xl font-semibold mt-2 leading-none">${formatCurrency(periodTotals.expenses)}</div>
        </div>
        <div className="a-inset" style={{ padding: '14px 16px', borderRadius: 16 }}>
          <span className="a-st a-mute text-[12.5px]"><span className="a-light" style={{ background: '#0A84FF', boxShadow: 'none' }} />Net position</span>
          <div className={`a-num text-2xl font-semibold mt-2 leading-none ${periodTotals.net < 0 ? 'a-txt-r' : 'a-ink'}`}>{periodTotals.net < 0 ? '−' : ''}${formatCurrency(Math.abs(periodTotals.net))}</div>
        </div>
      </div>
    </div>
  );
};

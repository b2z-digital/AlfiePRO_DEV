import React, { useState, useEffect, useRef } from 'react';
import { DollarSign, AlertTriangle, CheckCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useOrganizationContext } from '../../../hooks/useOrganizationContext';
import { supabase } from '../../../utils/supabase';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../../utils/formatCurrency';

interface RemittanceStatusWidgetProps {
  widgetId: string;
  isEditMode: boolean;
  onRemove: () => void;
  settings?: any;
  colorTheme?: string;
}

interface RemittanceStats {
  totalOwing: number;
  overdue: number;
  dueThisMonth: number;
  pending: number;
}

interface MonthlyDataPoint {
  month: string;
  amount: number;
}

function TrendSparkline({ data, width = 280, height = 60 }: { data: MonthlyDataPoint[]; width?: number; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const amounts = data.map(d => d.amount);
    const maxVal = Math.max(...amounts, 1);
    const minVal = Math.min(...amounts, 0);
    const range = maxVal - minVal || 1;

    const padX = 8;
    const padY = 8;
    const chartW = width - padX * 2;
    const chartH = height - padY * 2;

    const points = data.map((d, i) => ({
      x: padX + (i / (data.length - 1)) * chartW,
      y: padY + chartH - ((d.amount - minVal) / range) * chartH
    }));

    const gradient = ctx.createLinearGradient(0, padY, 0, height);
    gradient.addColorStop(0, 'rgba(52, 211, 153, 0.25)');
    gradient.addColorStop(1, 'rgba(52, 211, 153, 0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, height);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const cpx1 = points[i - 1].x + (points[i].x - points[i - 1].x) / 3;
      const cpy1 = points[i - 1].y;
      const cpx2 = points[i].x - (points[i].x - points[i - 1].x) / 3;
      const cpy2 = points[i].y;
      ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.stroke();

    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === points.length - 1 ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i === points.length - 1 ? '#34d399' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = i === points.length - 1 ? 2 : 1.5;
      ctx.stroke();
    });
  }, [data, width, height]);

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <span className="text-xs text-slate-500">Not enough data for trend</span>
      </div>
    );
  }

  return <canvas ref={canvasRef} style={{ width, height }} className="w-full" />;
}

export const RemittanceStatusWidget: React.FC<RemittanceStatusWidgetProps> = ({
  widgetId,
  isEditMode,
  onRemove,
  settings,
  colorTheme = 'default'
}) => {
  const { currentClub } = useAuth();
  const { currentOrganization } = useOrganizationContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<RemittanceStats>({
    totalOwing: 0,
    overdue: 0,
    dueThisMonth: 0,
    pending: 0
  });
  const [monthlyTrend, setMonthlyTrend] = useState<MonthlyDataPoint[]>([]);
  const [trendChange, setTrendChange] = useState<number>(0);

  useEffect(() => {
    loadRemittanceStats();
  }, [currentClub, currentOrganization]);

  const loadRemittanceStats = async () => {
    try {
      let remittances: any[] | null = null;

      if (currentOrganization?.type === 'state') {
        const { data: clubs, error: clubsError } = await supabase
          .from('clubs')
          .select('id')
          .eq('state_association_id', currentOrganization.id);

        if (clubsError) throw clubsError;

        if (!clubs || clubs.length === 0) {
          setStats({ totalOwing: 0, overdue: 0, dueThisMonth: 0, pending: 0 });
          return;
        }

        const clubIds = clubs.map(c => c.id);

        const { data, error } = await supabase
          .from('membership_remittances')
          .select('state_contribution_amount, membership_end_date, club_to_state_status, club_id, created_at')
          .in('club_id', clubIds);

        if (error) throw error;
        remittances = data;

      } else if (currentOrganization?.type === 'national') {
        const { data, error } = await supabase
          .from('membership_remittances')
          .select('national_contribution_amount, membership_end_date, state_to_national_status, club_id, created_at');

        if (error) throw error;
        remittances = data;

      } else if (currentClub?.clubId) {
        const { data, error } = await supabase
          .from('membership_remittances')
          .select('state_contribution_amount, membership_end_date, club_to_state_status, created_at')
          .eq('club_id', currentClub.clubId);

        if (error) throw error;
        remittances = data;

      } else {
        setStats({ totalOwing: 0, overdue: 0, dueThisMonth: 0, pending: 0 });
        return;
      }

      if (remittances) {
        const now = new Date();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        let totalOwing = 0;
        let overdue = 0;
        let dueThisMonth = 0;
        let pending = 0;

        const monthlyMap = new Map<string, number>();

        remittances.forEach((r: any) => {
          const amount = currentOrganization?.type === 'national'
            ? Number(r.national_contribution_amount) || 0
            : Number(r.state_contribution_amount) || 0;

          const paymentStatus = currentOrganization?.type === 'national'
            ? r.state_to_national_status
            : r.club_to_state_status;

          const isUnpaid = paymentStatus !== 'paid';

          if (isUnpaid) {
            totalOwing += amount;

            if (paymentStatus === 'pending') {
              pending += amount;
            }

            if (r.membership_end_date) {
              const dueDate = new Date(r.membership_end_date);
              if (dueDate < now) {
                overdue += amount;
              } else if (dueDate <= endOfMonth) {
                dueThisMonth += amount;
              }
            }
          }

          if (r.created_at && amount > 0) {
            const date = new Date(r.created_at);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthlyMap.set(key, (monthlyMap.get(key) || 0) + amount);
          }
        });

        const sortedMonths = Array.from(monthlyMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-6);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const trendData = sortedMonths.map(([key, amount]) => {
          const monthIdx = parseInt(key.split('-')[1]) - 1;
          return { month: monthNames[monthIdx], amount };
        });

        if (trendData.length >= 2) {
          const lastVal = trendData[trendData.length - 1].amount;
          const prevVal = trendData[trendData.length - 2].amount;
          const change = prevVal > 0 ? ((lastVal - prevVal) / prevVal) * 100 : 0;
          setTrendChange(Math.round(change));
        }

        setMonthlyTrend(trendData);
        setStats({ totalOwing, overdue, dueThisMonth, pending });
      }
    } catch (error) {
      console.error('Error loading remittance stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    if (!isEditMode) {
      if (currentOrganization?.type === 'state' || currentOrganization?.type === 'national') {
        navigate('/association-remittances');
      } else {
        navigate('/membership?tab=remittances');
      }
    }
  };

  const hasIssues = stats.overdue > 0 || stats.dueThisMonth > 0;

  return (
    <div className="h-full min-h-[32rem] rounded-xl border backdrop-blur-sm p-6 bg-slate-800/30 border-slate-700/50 relative flex flex-col">
      {isEditMode && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors z-10"
          title="Remove widget"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-emerald-600/20">
          <DollarSign className="text-emerald-400" size={20} />
        </div>
        <h3 className="text-lg font-semibold text-white">Association Remittances</h3>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3">
          <div className="rounded-lg bg-slate-800/50 border border-slate-700/30 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Monthly Trend</span>
              {trendChange !== 0 && (
                <div className={`flex items-center gap-1 text-xs font-medium ${
                  trendChange > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {trendChange > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {trendChange > 0 ? '+' : ''}{trendChange}%
                </div>
              )}
            </div>
            <TrendSparkline data={monthlyTrend} height={56} />
            {monthlyTrend.length >= 2 && (
              <div className="flex justify-between mt-1 px-1">
                <span className="text-[10px] text-slate-500">{monthlyTrend[0].month}</span>
                <span className="text-[10px] text-slate-500">{monthlyTrend[monthlyTrend.length - 1].month}</span>
              </div>
            )}
          </div>

          <div
            onClick={handleNavigate}
            className={`p-4 rounded-lg bg-slate-800/50 border border-slate-700/30 ${
              !isEditMode && stats.totalOwing > 0 ? 'hover:bg-slate-700/30 cursor-pointer' : ''
            } ${isEditMode ? 'cursor-default' : ''}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-slate-400">Total Owing</span>
              <DollarSign className="text-emerald-400" size={16} />
            </div>
            <div className="text-3xl font-bold text-white">
              ${formatCurrency(stats.totalOwing)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3 rounded-lg border ${
              stats.overdue > 0
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-slate-800/50 border-slate-700/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className={stats.overdue > 0 ? 'text-red-400' : 'text-slate-500'} size={16} />
                <span className="text-xs text-slate-400">Overdue</span>
              </div>
              <div className={`text-lg font-bold ${
                stats.overdue > 0 ? 'text-red-400' : 'text-slate-400'
              }`}>
                ${formatCurrency(stats.overdue)}
              </div>
            </div>

            <div className={`p-3 rounded-lg border ${
              stats.dueThisMonth > 0
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : 'bg-slate-800/50 border-slate-700/30'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <Clock className={stats.dueThisMonth > 0 ? 'text-yellow-400' : 'text-slate-500'} size={16} />
                <span className="text-xs text-slate-400">Due Soon</span>
              </div>
              <div className={`text-lg font-bold ${
                stats.dueThisMonth > 0 ? 'text-yellow-400' : 'text-slate-400'
              }`}>
                ${formatCurrency(stats.dueThisMonth)}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg border bg-slate-800/50 border-slate-700/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="text-blue-400" size={16} />
                <span className="text-xs text-slate-400">Pending Reconciliation</span>
              </div>
              <div className="text-lg font-bold text-blue-400">
                ${formatCurrency(stats.pending)}
              </div>
            </div>
          </div>

          {!hasIssues && stats.totalOwing === 0 && (
            <div className="text-center py-2 text-sm text-green-400 flex items-center justify-center gap-2">
              <CheckCircle size={16} />
              All remittances paid
            </div>
          )}
        </div>
      )}
    </div>
  );
};

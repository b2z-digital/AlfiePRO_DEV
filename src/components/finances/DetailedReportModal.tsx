import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, FileText, Image as ImageIcon, Table, TrendingUp, TrendingDown, Calendar, DollarSign, Printer } from 'lucide-react';
import { Chart as ChartJS } from 'chart.js';
import { Line, Bar, Doughnut, Pie } from 'react-chartjs-2';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';
import Papa from 'papaparse';

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  type: string;
  payment_method?: string;
}

interface DetailedReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportType: 'income' | 'expenses' | 'cash-flow' | 'profit-margin' | 'burn-rate' | 'ytd';
  title: string;
  data: {
    transactions: Transaction[];
    summary: {
      total: number;
      previousPeriod: number;
      yearToDate: number;
      breakdown: { category: string; amount: number; count: number }[];
      monthlyData: { month: string; amount: number }[];
    };
    chartData?: any;
    dateRange: { start: string; end: string };
  };
}

export default function DetailedReportModal({
  isOpen,
  onClose,
  reportType,
  title,
  data
}: DetailedReportModalProps) {
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv' | 'jpg' | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const calculatePercentageChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPosition = 20;

      // Header
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth / 2, yPosition, { align: 'center' });

      yPosition += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date Range: ${formatDate(data.dateRange.start)} - ${formatDate(data.dateRange.end)}`, pageWidth / 2, yPosition, { align: 'center' });
      doc.text(`Generated: ${new Date().toLocaleString('en-AU')}`, pageWidth / 2, yPosition + 5, { align: 'center' });

      yPosition += 15;

      // Summary Section
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', 14, yPosition);
      yPosition += 7;

      const summaryData = [
        ['This Period', formatCurrency(data.summary.total)],
        ['Previous Period', formatCurrency(data.summary.previousPeriod)],
        ['Year to Date', formatCurrency(data.summary.yearToDate)],
        ['Change', `${calculatePercentageChange(data.summary.total, data.summary.previousPeriod).toFixed(1)}%`]
      ];

      (doc as any).autoTable({
        startY: yPosition,
        head: [['Metric', 'Value']],
        body: summaryData,
        theme: 'grid',
        headStyles: { fillColor: [6, 182, 212] },
        margin: { left: 14, right: 14 }
      });

      yPosition = (doc as any).lastAutoTable.finalY + 10;

      // Category Breakdown
      if (data.summary.breakdown.length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Category Breakdown', 14, yPosition);
        yPosition += 7;

        const breakdownData = data.summary.breakdown.map(item => [
          item.category,
          formatCurrency(item.amount),
          item.count.toString(),
          `${((item.amount / data.summary.total) * 100).toFixed(1)}%`
        ]);

        (doc as any).autoTable({
          startY: yPosition,
          head: [['Category', 'Amount', 'Count', 'Percentage']],
          body: breakdownData,
          theme: 'grid',
          headStyles: { fillColor: [6, 182, 212] },
          margin: { left: 14, right: 14 }
        });

        yPosition = (doc as any).lastAutoTable.finalY + 10;
      }

      // Check if we need a new page
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      // Transactions Table
      if (data.transactions.length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Transactions', 14, yPosition);
        yPosition += 7;

        const transactionData = data.transactions.slice(0, 50).map(tx => [
          formatDate(tx.date),
          tx.description,
          tx.category,
          formatCurrency(tx.amount)
        ]);

        (doc as any).autoTable({
          startY: yPosition,
          head: [['Date', 'Description', 'Category', 'Amount']],
          body: transactionData,
          theme: 'striped',
          headStyles: { fillColor: [6, 182, 212] },
          margin: { left: 14, right: 14 },
          styles: { fontSize: 8 }
        });
      }

      doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
      setExportFormat(null);
    }
  };

  const exportToCSV = () => {
    setIsExporting(true);
    try {
      const csvData = data.transactions.map(tx => ({
        Date: formatDate(tx.date),
        Description: tx.description,
        Category: tx.category?.name || 'Uncategorized',
        Amount: tx.amount,
        Type: tx.type,
        'Payment Method': tx.payment_method || 'N/A'
      }));

      const csv = Papa.unparse(csvData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting CSV:', error);
    } finally {
      setIsExporting(false);
      setExportFormat(null);
    }
  };

  const exportToImage = async () => {
    setIsExporting(true);
    try {
      if (contentRef.current) {
        const canvas = await html2canvas(contentRef.current, {
          backgroundColor: '#0f172a',
          scale: 2,
          logging: false
        });

        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.jpg`;
            link.click();
            URL.revokeObjectURL(url);
          }
        }, 'image/jpeg', 0.95);
      }
    } catch (error) {
      console.error('Error exporting image:', error);
    } finally {
      setIsExporting(false);
      setExportFormat(null);
    }
  };

  const handleExport = () => {
    if (exportFormat === 'pdf') exportToPDF();
    else if (exportFormat === 'csv') exportToCSV();
    else if (exportFormat === 'jpg') exportToImage();
  };

  const chartColors = reportType === 'income'
    ? ['#10b981', '#059669', '#047857', '#065f46', '#064e3b']
    : reportType === 'expenses'
    ? ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d']
    : ['#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63'];

  const categoryChartData = {
    labels: data.summary.breakdown.map(b => b.category),
    datasets: [{
      data: data.summary.breakdown.map(b => b.amount),
      backgroundColor: chartColors,
      borderColor: '#0f172a',
      borderWidth: 2
    }]
  };

  const trendChartData = {
    labels: data.summary.monthlyData.map(m => m.month),
    datasets: [{
      label: title,
      data: data.summary.monthlyData.map(m => m.amount),
      borderColor: chartColors[0],
      backgroundColor: `${chartColors[0]}20`,
      fill: true,
      tension: 0.4
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: 'rgb(203, 213, 225)',
          padding: 12,
          font: { size: 11 }
        }
      },
      tooltip: {
        backgroundColor: 'rgb(30, 41, 59)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgb(51, 65, 85)',
        borderWidth: 1,
        padding: 10
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(71, 85, 105, 0.3)' },
        ticks: { color: 'rgb(148, 163, 184)' }
      },
      y: {
        grid: { color: 'rgba(71, 85, 105, 0.3)' },
        ticks: { color: 'rgb(148, 163, 184)' }
      }
    }
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right' as const,
        labels: {
          color: 'rgb(203, 213, 225)',
          padding: 10,
          font: { size: 10 }
        }
      },
      tooltip: {
        backgroundColor: 'rgb(30, 41, 59)',
        titleColor: 'rgb(226, 232, 240)',
        bodyColor: 'rgb(203, 213, 225)',
        borderColor: 'rgb(51, 65, 85)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: function(context: any) {
            const value = formatCurrency(context.parsed);
            const percentage = ((context.parsed / context.dataset.data.reduce((a: number, b: number) => a + b, 0)) * 100).toFixed(1);
            return `${context.label}: ${value} (${percentage}%)`;
          }
        }
      }
    }
  };

  const percentageChange = calculatePercentageChange(data.summary.total, data.summary.previousPeriod);

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-7xl max-h-[90vh] bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-slate-800 to-slate-900 border-b border-slate-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                {reportType === 'income' && <TrendingUp className="text-emerald-400" size={28} />}
                {reportType === 'expenses' && <TrendingDown className="text-red-400" size={28} />}
                {reportType === 'cash-flow' && <DollarSign className="text-cyan-400" size={28} />}
                {title}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                {formatDate(data.dateRange.start)} - {formatDate(data.dateRange.end)}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Export Menu */}
              <div className="relative">
                <button
                  onClick={() => setExportFormat(exportFormat ? null : 'pdf')}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg transition-all shadow-lg shadow-cyan-500/20"
                >
                  <Download size={18} />
                  Export
                </button>

                {exportFormat && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-800 rounded-lg shadow-xl border border-slate-700 overflow-hidden z-20">
                    <button
                      onClick={() => { setExportFormat('pdf'); handleExport(); }}
                      disabled={isExporting}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 text-slate-200 transition-colors text-left"
                    >
                      <FileText size={18} className="text-red-400" />
                      <span>Export as PDF</span>
                    </button>
                    <button
                      onClick={() => { setExportFormat('csv'); handleExport(); }}
                      disabled={isExporting}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 text-slate-200 transition-colors text-left border-t border-slate-700"
                    >
                      <Table size={18} className="text-green-400" />
                      <span>Export as CSV</span>
                    </button>
                    <button
                      onClick={() => { setExportFormat('jpg'); handleExport(); }}
                      disabled={isExporting}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-700 text-slate-200 transition-colors text-left border-t border-slate-700"
                    >
                      <ImageIcon size={18} className="text-blue-400" />
                      <span>Export as Image</span>
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div ref={contentRef} className="overflow-y-auto max-h-[calc(90vh-100px)] p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-xl border border-slate-700/50 p-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-400 font-medium">This Period</p>
                <div className={`flex items-center gap-1 text-sm ${percentageChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {percentageChange >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {Math.abs(percentageChange).toFixed(1)}%
                </div>
              </div>
              <p className="text-3xl font-bold text-white">{formatCurrency(data.summary.total)}</p>
              <p className="text-xs text-slate-500 mt-2">{data.transactions.length} transactions</p>
            </div>

            <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-xl border border-slate-700/50 p-6">
              <p className="text-sm text-slate-400 font-medium mb-2">Previous Period</p>
              <p className="text-3xl font-bold text-slate-300">{formatCurrency(data.summary.previousPeriod)}</p>
              <p className="text-xs text-slate-500 mt-2">Comparison baseline</p>
            </div>

            <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-xl border border-slate-700/50 p-6">
              <p className="text-sm text-slate-400 font-medium mb-2">Year to Date</p>
              <p className="text-3xl font-bold text-cyan-400">{formatCurrency(data.summary.yearToDate)}</p>
              <p className="text-xs text-slate-500 mt-2">{new Date().getFullYear()}</p>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trend Chart */}
            {data.summary.monthlyData.length > 0 && (
              <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-xl border border-slate-700/50 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Monthly Trend</h3>
                <div className="h-[300px]">
                  <Line data={trendChartData} options={chartOptions} />
                </div>
              </div>
            )}

            {/* Category Breakdown Chart */}
            {data.summary.breakdown.length > 0 && (
              <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-xl border border-slate-700/50 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Category Distribution</h3>
                <div className="h-[300px]">
                  <Doughnut data={categoryChartData} options={pieOptions} />
                </div>
              </div>
            )}
          </div>

          {/* Category Breakdown Table */}
          {data.summary.breakdown.length > 0 && (
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700">
                <h3 className="text-lg font-semibold text-white">Category Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">Category</th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-slate-300">Amount</th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-slate-300">Transactions</th>
                      <th className="px-6 py-3 text-right text-sm font-medium text-slate-300">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {data.summary.breakdown.map((item, index) => (
                      <tr key={index} className="hover:bg-slate-700/30 transition-colors">
                        <td className="px-6 py-3 text-sm text-white">{item.category}</td>
                        <td className="px-6 py-3 text-sm text-right font-semibold text-cyan-400">
                          {formatCurrency(item.amount)}
                        </td>
                        <td className="px-6 py-3 text-sm text-right text-slate-300">{item.count}</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-300">
                          {((item.amount / data.summary.total) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transactions Table */}
          <div className="bg-gradient-to-br from-slate-800/60 to-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-700">
              <h3 className="text-lg font-semibold text-white">Recent Transactions</h3>
              <p className="text-sm text-slate-400 mt-1">Showing {Math.min(data.transactions.length, 100)} of {data.transactions.length} transactions</p>
            </div>
            <div className="overflow-x-auto max-h-[400px]">
              <table className="w-full">
                <thead className="bg-slate-700/50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">Date</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">Description</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-slate-300">Category</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-slate-300">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {data.transactions.slice(0, 100).map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="px-6 py-3 text-sm text-slate-300">{formatDate(tx.date)}</td>
                      <td className="px-6 py-3 text-sm text-white">{tx.description}</td>
                      <td className="px-6 py-3 text-sm text-slate-400">{tx.category?.name || 'Uncategorized'}</td>
                      <td className="px-6 py-3 text-sm text-right font-semibold text-cyan-400">
                        {formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Loading Overlay */}
        {isExporting && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 rounded-xl p-6 flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
              <p className="text-white font-medium">Exporting report...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

import React, { useState, useEffect, useRef } from 'react';
import { FileDown, Printer, LogOut, Calendar, Clock, User, Users, Flag } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface TaskMember {
  id: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignee: TaskMember | null;
  supporting_members: TaskMember[];
  due_date: string;
  due_time: string;
  priority: 'low' | 'medium' | 'high';
  agenda_item_name: string;
  agenda_item_number: number;
}

interface ActionItemsSummaryProps {
  meetingId: string;
  meetingName: string;
  meetingDate: string;
  isOpen: boolean;
  onClose: () => void;
  darkMode?: boolean;
}

export const ActionItemsSummary: React.FC<ActionItemsSummaryProps> = ({
  meetingId,
  meetingName,
  meetingDate,
  isOpen,
  onClose,
  darkMode = false
}) => {
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchActionItems();
    }
  }, [isOpen, meetingId]);

  const fetchActionItems = async () => {
    try {
      setLoading(true);

      // Fetch all tasks linked to this meeting's agenda items
      const { data: tasks, error: tasksError } = await supabase
        .from('club_tasks')
        .select(`
          id,
          title,
          description,
          assignee_id,
          supporting_members,
          due_date,
          due_time,
          priority,
          meeting_agendas!inner (
            item_name,
            item_number,
            meeting_id
          )
        `)
        .eq('meeting_agendas.meeting_id', meetingId)
        .order('meeting_agendas.item_number', { ascending: true });

      if (tasksError) throw tasksError;

      // Fetch member details for all assignees and supporters
      const allMemberIds = new Set<string>();
      tasks?.forEach(task => {
        if (task.assignee_id) allMemberIds.add(task.assignee_id);
        if (task.supporting_members) {
          task.supporting_members.forEach((id: string) => allMemberIds.add(id));
        }
      });

      const { data: members, error: membersError } = await supabase
        .from('members')
        .select('id, first_name, last_name, avatar_url')
        .in('id', Array.from(allMemberIds));

      if (membersError) throw membersError;

      const memberMap = new Map(members?.map(m => [m.id, m]) || []);

      // Transform data
      const items: ActionItem[] = (tasks || []).map(task => ({
        id: task.id,
        title: task.title,
        description: task.description || '',
        assignee: task.assignee_id ? memberMap.get(task.assignee_id) || null : null,
        supporting_members: (task.supporting_members || [])
          .map((id: string) => memberMap.get(id))
          .filter(Boolean) as TaskMember[],
        due_date: task.due_date || '',
        due_time: task.due_time || '',
        priority: task.priority || 'medium',
        agenda_item_name: task.meeting_agendas?.item_name || '',
        agenda_item_number: task.meeting_agendas?.item_number || 0
      }));

      setActionItems(items);
    } catch (error) {
      console.error('Error fetching action items:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return { text: 'High', color: 'text-red-600', bg: 'bg-red-100' };
      case 'medium':
        return { text: 'Medium', color: 'text-yellow-600', bg: 'bg-yellow-100' };
      case 'low':
        return { text: 'Low', color: 'text-green-600', bg: 'bg-green-100' };
      default:
        return { text: 'Medium', color: 'text-gray-600', bg: 'bg-gray-100' };
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'No due date';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    return ` at ${timeStr}`;
  };

  const exportAsPDF = async () => {
    if (!summaryRef.current) return;

    try {
      setExporting(true);

      const canvas = await html2canvas(summaryRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const pdf = new jsPDF('p', 'mm', 'a4');
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if needed
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`${meetingName.replace(/\s+/g, '_')}_Action_Items.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setExporting(false);
    }
  };

  const exportAsJPG = async () => {
    if (!summaryRef.current) return;

    try {
      setExporting(true);

      const canvas = await html2canvas(summaryRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false
      });

      canvas.toBlob(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${meetingName.replace(/\s+/g, '_')}_Action_Items.jpg`;
          link.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/jpeg', 0.95);
    } catch (error) {
      console.error('Error exporting JPG:', error);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Action Items Summary</h2>
            <p className="text-cyan-100 text-sm">{meetingName} - {formatDate(meetingDate)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex gap-3 flex-wrap">
          <button
            onClick={exportAsPDF}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-700 text-white rounded-lg hover:from-cyan-700 hover:to-blue-800 font-medium transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            Export as PDF
          </button>
          <button
            onClick={exportAsJPG}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-cyan-600 text-cyan-700 rounded-lg hover:bg-cyan-50 font-medium transition-all disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            Export as JPG
          </button>
          <button
            onClick={handlePrint}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-all disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600"></div>
            </div>
          ) : (
            <div ref={summaryRef} className="bg-white p-8" id="action-items-summary">
              {/* Header for export */}
              <div className="mb-8 pb-6 border-b-2 border-cyan-600">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Action Items Summary</h1>
                <p className="text-lg text-gray-600">{meetingName}</p>
                <p className="text-sm text-gray-500">{formatDate(meetingDate)}</p>
              </div>

              {/* Action Items */}
              {actionItems.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">No action items assigned for this meeting</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {actionItems.map((item, index) => {
                    const priorityInfo = getPriorityLabel(item.priority);
                    return (
                      <div
                        key={item.id}
                        className="border-2 border-gray-200 rounded-lg p-5 hover:border-cyan-300 transition-colors bg-gray-50"
                      >
                        {/* Task Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-gray-500 bg-gray-200 px-2 py-1 rounded">
                                #{item.agenda_item_number}
                              </span>
                              <span className="text-xs text-gray-600">{item.agenda_item_name}</span>
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">
                              {index + 1}. {item.title}
                            </h3>
                            {item.description && (
                              <p className="text-sm text-gray-600 mt-2">{item.description}</p>
                            )}
                          </div>
                          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${priorityInfo.bg} ${priorityInfo.color}`}>
                            <Flag className="w-3 h-3 inline mr-1" />
                            {priorityInfo.text}
                          </div>
                        </div>

                        {/* Task Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
                          {/* Assignee */}
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Assigned To
                            </div>
                            {item.assignee ? (
                              <div className="flex items-center gap-2">
                                {item.assignee.avatar_url && (
                                  <img
                                    src={item.assignee.avatar_url}
                                    alt=""
                                    className="w-8 h-8 rounded-full"
                                  />
                                )}
                                <span className="font-medium text-gray-900">
                                  {item.assignee.first_name} {item.assignee.last_name}
                                </span>
                              </div>
                            ) : (
                              <span className="text-gray-400 italic">Unassigned</span>
                            )}
                          </div>

                          {/* Due Date */}
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Due Date
                            </div>
                            <div className="font-medium text-gray-900">
                              {formatDate(item.due_date)}
                              {item.due_time && (
                                <span className="text-gray-600 text-sm ml-1">
                                  <Clock className="w-3 h-3 inline" /> {item.due_time}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Supporting Members */}
                        {item.supporting_members.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Supporting Members
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {item.supporting_members.map(member => (
                                <div
                                  key={member.id}
                                  className="flex items-center gap-2 px-3 py-1 bg-cyan-50 border border-cyan-200 rounded-full"
                                >
                                  {member.avatar_url && (
                                    <img
                                      src={member.avatar_url}
                                      alt=""
                                      className="w-5 h-5 rounded-full"
                                    />
                                  )}
                                  <span className="text-sm text-cyan-900">
                                    {member.first_name} {member.last_name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-gray-300 text-center text-sm text-gray-500">
                Generated on {new Date().toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #action-items-summary, #action-items-summary * {
            visibility: visible;
          }
          #action-items-summary {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

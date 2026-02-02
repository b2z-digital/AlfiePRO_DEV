import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Send, Plus, Edit2, Trash2, DollarSign, Calendar, User, FileText, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';

interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email?: string;
  date: string;
  due_date?: string;
  reference?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  created_at: string;
  updated_at: string;
}

interface InvoiceLineItem {
  id: string;
  description: string;
  unit_price: number;
  quantity: number;
  category?: string;
  tax_type: 'included' | 'excluded' | 'none';
  line_total: number;
}

interface InvoiceNote {
  id: string;
  content: string;
  created_at: string;
  created_by_user_id?: string;
  created_by?: {
    first_name?: string;
    last_name?: string;
  };
}

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [notes, setNotes] = useState<InvoiceNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    if (id && currentClub?.clubId) {
      loadInvoiceData();
    }
  }, [id, currentClub]);

  const loadInvoiceData = async () => {
    if (!id || !currentClub?.clubId) return;

    try {
      setLoading(true);
      setError(null);

      // Load invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', id)
        .eq('club_id', currentClub.clubId)
        .single();

      if (invoiceError) {
        if (invoiceError.code === 'PGRST116') {
          setError('Invoice not found');
        } else {
          throw invoiceError;
        }
        return;
      }

      setInvoice(invoiceData);

      // Load line items
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('invoice_line_items')
        .select('*')
        .eq('invoice_id', id)
        .order('created_at');

      if (lineItemsError) throw lineItemsError;
      setLineItems(lineItemsData || []);

      // Load notes - simplified approach without joins
      await loadInvoiceNotes();

    } catch (err) {
      console.error('Error loading invoice data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load invoice data');
    } finally {
      setLoading(false);
    }
  };

  const loadInvoiceNotes = async () => {
    if (!id) return;

    try {
      // First, get the notes without user details
      const { data: notesData, error: notesError } = await supabase
        .from('invoice_notes')
        .select('*')
        .eq('invoice_id', id)
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;

      if (!notesData || notesData.length === 0) {
        setNotes([]);
        return;
      }

      // Then, try to get user details for each note
      const notesWithUserDetails = await Promise.all(
        notesData.map(async (note) => {
          if (!note.created_by_user_id) {
            return {
              ...note,
              created_by: { first_name: 'Unknown', last_name: 'User' }
            };
          }

          try {
            // Try to get user details from profiles table
            const { data: profileData } = await supabase
              .from('profiles')
              .select('first_name, last_name')
              .eq('id', note.created_by_user_id)
              .single();

            return {
              ...note,
              created_by: profileData || { first_name: 'Unknown', last_name: 'User' }
            };
          } catch (profileError) {
            console.warn('Could not load profile for note:', profileError);
            return {
              ...note,
              created_by: { first_name: 'Unknown', last_name: 'User' }
            };
          }
        })
      );

      setNotes(notesWithUserDetails);
    } catch (err) {
      console.error('Error loading invoice notes:', err);
      // Don't fail the entire page if notes can't be loaded
      setNotes([]);
    }
  };

  const addNote = async () => {
    if (!newNote.trim() || !id || !currentClub?.clubId) return;

    try {
      setAddingNote(true);
      
      const { data, error } = await supabase
        .from('invoice_notes')
        .insert({
          invoice_id: id,
          content: newNote.trim(),
          created_by_user_id: (await supabase.auth.getUser()).data.user?.id
        })
        .select()
        .single();

      if (error) throw error;

      setNewNote('');
      await loadInvoiceNotes(); // Reload notes to get the new one with user details
    } catch (err) {
      console.error('Error adding note:', err);
      setError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      const { error } = await supabase
        .from('invoice_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;

      setNotes(notes.filter(note => note.id !== noteId));
    } catch (err) {
      console.error('Error deleting note:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete note');
    }
  };

  const updateInvoiceStatus = async (newStatus: Invoice['status']) => {
    if (!invoice || !id) return;

    try {
      const { error } = await supabase
        .from('invoices')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;

      setInvoice({ ...invoice, status: newStatus });
    } catch (err) {
      console.error('Error updating invoice status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update invoice status');
    }
  };

  const getStatusColor = (status: Invoice['status']) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 'sent': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'overdue': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => navigate('/finances/invoices')}
            className="mt-4 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
          <p className="text-slate-400">Invoice not found</p>
          <button
            onClick={() => navigate('/finances/invoices')}
            className="mt-4 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
          >
            Back to Invoices
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/finances/invoices')}
            className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Invoices
          </button>
          <div>
            <h1 className="text-2xl font-semibold text-white">Invoice {invoice.invoice_number}</h1>
            <p className="text-slate-400">Created {formatDate(invoice.created_at)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(invoice.status)}`}>
            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
          </span>
          
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Download size={16} />
              Download PDF
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              <Send size={16} />
              Send Invoice
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Invoice Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice Info */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-4">Invoice Details</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <FileText size={16} className="text-slate-400" />
                    <div>
                      <p className="text-sm text-slate-400">Invoice Number</p>
                      <p className="text-white font-medium">{invoice.invoice_number}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Calendar size={16} className="text-slate-400" />
                    <div>
                      <p className="text-sm text-slate-400">Issue Date</p>
                      <p className="text-white">{formatDate(invoice.date)}</p>
                    </div>
                  </div>
                  {invoice.due_date && (
                    <div className="flex items-center gap-3">
                      <Calendar size={16} className="text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-400">Due Date</p>
                        <p className="text-white">{formatDate(invoice.due_date)}</p>
                      </div>
                    </div>
                  )}
                  {invoice.reference && (
                    <div className="flex items-center gap-3">
                      <FileText size={16} className="text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-400">Reference</p>
                        <p className="text-white">{invoice.reference}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium text-white mb-4">Customer</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <User size={16} className="text-slate-400" />
                    <div>
                      <p className="text-sm text-slate-400">Name</p>
                      <p className="text-white font-medium">{invoice.customer_name}</p>
                    </div>
                  </div>
                  {invoice.customer_email && (
                    <div className="flex items-center gap-3">
                      <User size={16} className="text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-400">Email</p>
                        <p className="text-white">{invoice.customer_email}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-medium text-white mb-4">Line Items</h3>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 text-slate-400 font-medium">Description</th>
                    <th className="text-right py-3 text-slate-400 font-medium">Qty</th>
                    <th className="text-right py-3 text-slate-400 font-medium">Unit Price</th>
                    <th className="text-right py-3 text-slate-400 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item) => (
                    <tr key={item.id} className="border-b border-slate-700/50">
                      <td className="py-3 text-white">
                        <div>
                          <p className="font-medium">{item.description}</p>
                          {item.category && (
                            <p className="text-sm text-slate-400">{item.category}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-right text-white">{item.quantity}</td>
                      <td className="py-3 text-right text-white">${item.unit_price.toFixed(2)}</td>
                      <td className="py-3 text-right text-white font-medium">${item.line_total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-6 border-t border-slate-700 pt-4">
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-slate-300">
                    <span>Subtotal:</span>
                    <span>${invoice.subtotal.toFixed(2)}</span>
                  </div>
                  {invoice.tax_amount > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Tax:</span>
                      <span>${invoice.tax_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-white font-semibold text-lg border-t border-slate-700 pt-2">
                    <span>Total:</span>
                    <span>${invoice.total_amount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Actions */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-medium text-white mb-4">Actions</h3>
            <div className="space-y-3">
              {invoice.status === 'draft' && (
                <button
                  onClick={() => updateInvoiceStatus('sent')}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Mark as Sent
                </button>
              )}
              {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                <button
                  onClick={() => updateInvoiceStatus('paid')}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Mark as Paid
                </button>
              )}
              <button
                onClick={() => navigate(`/finances/invoices/edit/${invoice.id}`)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
              >
                <Edit2 size={16} />
                Edit Invoice
              </button>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <MessageSquare size={18} />
              Notes
            </h3>
            
            {/* Add Note */}
            <div className="mb-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note..."
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 resize-none"
                rows={3}
              />
              <button
                onClick={addNote}
                disabled={!newNote.trim() || addingNote}
                className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                {addingNote ? 'Adding...' : 'Add Note'}
              </button>
            </div>

            {/* Notes List */}
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notes.length === 0 ? (
                <p className="text-slate-400 text-sm">No notes yet</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="p-3 bg-slate-700/50 rounded-lg">
                    <p className="text-white text-sm mb-2">{note.content}</p>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>
                        {note.created_by?.first_name && note.created_by?.last_name
                          ? `${note.created_by.first_name} ${note.created_by.last_name}`
                          : 'Unknown User'
                        }
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{formatDate(note.created_at)}</span>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
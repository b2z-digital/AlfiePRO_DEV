import { supabase } from './supabase';
import { Invoice, InvoiceLineItem, Transaction, InvoiceNote, TaxRate, BudgetCategory, FinanceSettings } from '../types/finance';

// Invoice functions
export const getInvoiceById = async (invoiceId: string): Promise<Invoice | null> => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching invoice:', error);
    throw error;
  }
};

export const getInvoiceLineItems = async (invoiceId: string): Promise<InvoiceLineItem[]> => {
  try {
    const { data, error } = await supabase
      .from('invoice_line_items')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching invoice line items:', error);
    throw error;
  }
};

export const getInvoicePayments = async (invoiceId: string): Promise<Transaction[]> => {
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('invoice_id', invoiceId)
      .eq('type', 'deposit')
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching invoice payments:', error);
    throw error;
  }
};

export const getInvoiceNotes = async (invoiceId: string): Promise<InvoiceNote[]> => {
  try {
    const { data, error } = await supabase
      .from('invoice_notes')
      .select(`
        *,
        created_by:profiles!created_by_user_id(
          first_name,
          last_name
        )
      `)
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching invoice notes:', error);
    throw error;
  }
};

export const addInvoiceNote = async (
  invoiceId: string,
  content: string,
  createdByUserId: string
): Promise<InvoiceNote> => {
  try {
    const { data, error } = await supabase
      .from('invoice_notes')
      .insert({
        invoice_id: invoiceId,
        content,
        created_by_user_id: createdByUserId
      })
      .select(`
        *,
        created_by:created_by_user_id (
          first_name:user_metadata->first_name,
          last_name:user_metadata->last_name,
          email
        )
      `)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding invoice note:', error);
    throw error;
  }
};

export const addInvoicePayment = async (
  invoiceId: string,
  clubId: string,
  amount: number,
  paymentMethod: string,
  transactionReference?: string,
  date?: string
): Promise<Transaction> => {
  try {
    // Get the invoice to update its status
    const invoice = await getInvoiceById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Get existing payments to calculate total paid
    const existingPayments = await getInvoicePayments(invoiceId);
    const totalPaid = existingPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const newTotalPaid = totalPaid + amount;

    // Create the payment transaction
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert({
        club_id: clubId,
        invoice_id: invoiceId,
        type: 'deposit',
        description: `Payment for Invoice ${invoice.invoice_number}`,
        amount,
        date: date || new Date().toISOString().split('T')[0],
        payment_method: paymentMethod,
        transaction_reference: transactionReference,
        payment_status: 'paid'
      })
      .select('*')
      .single();

    if (transactionError) throw transactionError;

    // Update invoice status if fully paid
    if (newTotalPaid >= invoice.total_amount) {
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('id', invoiceId);

      if (updateError) throw updateError;
    }

    return transaction;
  } catch (error) {
    console.error('Error adding invoice payment:', error);
    throw error;
  }
};

export const deleteInvoice = async (invoiceId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', invoiceId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting invoice:', error);
    throw error;
  }
};

export const getStoredTaxRates = async (clubId: string): Promise<TaxRate[]> => {
  try {
    const { data, error } = await supabase
      .from('tax_rates')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching tax rates:', error);
    throw error;
  }
};

export const getStoredBudgetCategories = async (clubId: string): Promise<BudgetCategory[]> => {
  try {
    const { data, error } = await supabase
      .from('budget_categories')
      .select('*')
      .eq('club_id', clubId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching budget categories:', error);
    throw error;
  }
};

export const getFinanceSettings = async (clubId: string): Promise<FinanceSettings | null> => {
  try {
    const { data, error } = await supabase
      .from('club_finance_settings')
      .select('*')
      .eq('club_id', clubId)
      .maybeSingle();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching finance settings:', error);
    throw error;
  }
};

export const deleteInvoicePayment = async (transactionId: string): Promise<void> => {
  try {
    // Get the transaction to find the invoice
    const { data: transaction, error: fetchError } = await supabase
      .from('transactions')
      .select('invoice_id, amount')
      .eq('id', transactionId)
      .single();

    if (fetchError) throw fetchError;

    // Delete the transaction
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('id', transactionId);

    if (deleteError) throw deleteError;

    // Update invoice status if needed
    if (transaction.invoice_id) {
      const invoice = await getInvoiceById(transaction.invoice_id);
      const remainingPayments = await getInvoicePayments(transaction.invoice_id);
      const totalPaid = remainingPayments.reduce((sum, payment) => sum + payment.amount, 0);

      if (invoice && totalPaid < invoice.total_amount && invoice.status === 'paid') {
        await supabase
          .from('invoices')
          .update({ status: 'sent' })
          .eq('id', transaction.invoice_id);
      }
    }
  } catch (error) {
    console.error('Error deleting invoice payment:', error);
    throw error;
  }
};

export const getFinancialReports = async (clubId: string): Promise<any> => {
  try {
    // This is a placeholder implementation for the financial reports function
    // You may need to customize this based on your specific reporting requirements
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('club_id', clubId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching financial reports:', error);
    throw error;
  }
};
export interface Invoice {
  id: string;
  club_id: string;
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

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  unit_price: number;
  quantity: number;
  category?: string;
  tax_type: 'included' | 'excluded' | 'none';
  line_total: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  club_id: string;
  type: 'deposit' | 'expense';
  description: string;
  amount: number;
  date: string;
  category_id?: string;
  payer?: string;
  payee?: string;
  reference?: string;
  notes?: string;
  payment_method: 'cash' | 'card' | 'cheque' | 'bank' | 'other';
  transaction_reference?: string;
  due_date?: string;
  expense_number?: string;
  payment_status: 'paid' | 'awaiting_payment';
  invoice_id?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceNote {
  id: string;
  invoice_id: string;
  content: string;
  created_at: string;
  created_by_user_id: string;
  created_by?: {
    first_name?: string;
    last_name?: string;
    email: string;
  };
}

export interface TaxRate {
  id: string;
  club_id: string;
  name: string;
  rate: number;
  currency: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BudgetCategory {
  id: string;
  club_id: string;
  name: string;
  type: 'income' | 'expense';
  description?: string;
  is_active: boolean;
  tax_rate_id?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoicePayment extends Transaction {
  // This extends Transaction for payments linked to invoices
}

export interface FinanceSettings {
  id: string;
  club_id: string;
  invoice_title: string;
  organization_number: string;
  invoice_prefix: string;
  deposit_prefix: string;
  expense_prefix: string;
  invoice_next_number: number;
  deposit_next_number: number;
  expense_next_number: number;
  footer_information: string;
  payment_information: string;
  invoice_logo_url?: string;
  created_at: string;
  updated_at: string;
}
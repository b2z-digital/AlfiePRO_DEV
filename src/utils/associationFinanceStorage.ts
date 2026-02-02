import { supabase } from './supabase';

export interface AssociationTransaction {
  id: string;
  association_id: string;
  association_type: 'state' | 'national';
  type: 'income' | 'expense';
  category_id: string | null;
  description: string;
  amount: number;
  date: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
  payer: string | null;
  payee: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  batch_id: string | null;
  payment_status: 'pending' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  association_budget_categories?: {
    id: string;
    name: string;
    type: 'income' | 'expense';
  };
}

export interface AssociationBudgetCategory {
  id: string;
  association_id: string;
  association_type: 'state' | 'national';
  name: string;
  type: 'income' | 'expense';
  description: string | null;
  budget_amount: number;
  is_system: boolean;
  system_key: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const getAssociationTransactions = async (
  associationId: string,
  associationType: 'state' | 'national'
): Promise<AssociationTransaction[]> => {
  const { data, error } = await supabase
    .from('association_transactions')
    .select(`
      *,
      association_budget_categories (
        id,
        name,
        type
      )
    `)
    .eq('association_id', associationId)
    .eq('association_type', associationType)
    .order('date', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getAssociationTransaction = async (
  transactionId: string
): Promise<AssociationTransaction | null> => {
  const { data, error } = await supabase
    .from('association_transactions')
    .select(`
      *,
      association_budget_categories (
        id,
        name,
        type
      )
    `)
    .eq('id', transactionId)
    .single();

  if (error) throw error;
  return data;
};

export const createAssociationTransaction = async (
  transaction: Partial<AssociationTransaction>
): Promise<AssociationTransaction> => {
  const { data, error } = await supabase
    .from('association_transactions')
    .insert(transaction)
    .select(`
      *,
      association_budget_categories (
        id,
        name,
        type
      )
    `)
    .single();

  if (error) throw error;
  return data;
};

export const updateAssociationTransaction = async (
  transactionId: string,
  updates: Partial<AssociationTransaction>
): Promise<AssociationTransaction> => {
  const { data, error } = await supabase
    .from('association_transactions')
    .update(updates)
    .eq('id', transactionId)
    .select(`
      *,
      association_budget_categories (
        id,
        name,
        type
      )
    `)
    .single();

  if (error) throw error;
  return data;
};

export const deleteAssociationTransaction = async (
  transactionId: string
): Promise<void> => {
  const { error } = await supabase
    .from('association_transactions')
    .delete()
    .eq('id', transactionId);

  if (error) throw error;
};

export const getAssociationBudgetCategories = async (
  associationId: string,
  associationType: 'state' | 'national'
): Promise<AssociationBudgetCategory[]> => {
  const { data, error } = await supabase
    .from('association_budget_categories')
    .select('*')
    .eq('association_id', associationId)
    .eq('association_type', associationType)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data || [];
};

export const getAssociationBudgetCategory = async (
  categoryId: string
): Promise<AssociationBudgetCategory | null> => {
  const { data, error } = await supabase
    .from('association_budget_categories')
    .select('*')
    .eq('id', categoryId)
    .single();

  if (error) throw error;
  return data;
};

export const createAssociationBudgetCategory = async (
  category: Partial<AssociationBudgetCategory>
): Promise<AssociationBudgetCategory> => {
  const { data, error } = await supabase
    .from('association_budget_categories')
    .insert(category)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateAssociationBudgetCategory = async (
  categoryId: string,
  updates: Partial<AssociationBudgetCategory>
): Promise<AssociationBudgetCategory> => {
  const { data, error } = await supabase
    .from('association_budget_categories')
    .update(updates)
    .eq('id', categoryId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const deleteAssociationBudgetCategory = async (
  categoryId: string
): Promise<void> => {
  const { error } = await supabase
    .from('association_budget_categories')
    .delete()
    .eq('id', categoryId);

  if (error) throw error;
};

export const getAssociationFinancialSummary = async (
  associationId: string,
  associationType: 'state' | 'national',
  startDate?: string,
  endDate?: string
) => {
  let query = supabase
    .from('association_transactions')
    .select('type, amount, payment_status')
    .eq('association_id', associationId)
    .eq('association_type', associationType);

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, error } = await query;

  if (error) throw error;

  const completedTransactions = data?.filter(t => t.payment_status === 'completed') || [];

  const totalIncome = completedTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpenses = completedTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return {
    totalIncome,
    totalExpenses,
    netIncome: totalIncome - totalExpenses,
    transactionCount: completedTransactions.length
  };
};

export const getCategorySpending = async (
  associationId: string,
  associationType: 'state' | 'national',
  startDate?: string,
  endDate?: string
) => {
  let query = supabase
    .from('association_transactions')
    .select(`
      amount,
      type,
      category_id,
      payment_status,
      association_budget_categories (
        id,
        name,
        type,
        budget_amount
      )
    `)
    .eq('association_id', associationId)
    .eq('association_type', associationType)
    .eq('payment_status', 'completed');

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, error } = await query;

  if (error) throw error;

  const categoryTotals = new Map<string, { name: string; amount: number; budget: number; type: string }>();

  data?.forEach(transaction => {
    const category = transaction.association_budget_categories;
    if (category) {
      const current = categoryTotals.get(category.id) || {
        name: category.name,
        amount: 0,
        budget: category.budget_amount || 0,
        type: category.type
      };
      current.amount += Number(transaction.amount);
      categoryTotals.set(category.id, current);
    }
  });

  return Array.from(categoryTotals.values());
};
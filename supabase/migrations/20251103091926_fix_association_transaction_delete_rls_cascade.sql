/*
  # Fix Association Transaction Delete Issue

  1. Problem
    - RLS policies use is_association_admin(association_id, association_type)
    - But function signature uses (assoc_id, assoc_type)
    - Parameter name mismatch causes delete to fail

  2. Solution
    - Drop function with CASCADE (will drop dependent policies)
    - Recreate function with correct parameter names
    - Recreate all dependent RLS policies
*/

-- Drop the existing function and its dependencies
DROP FUNCTION IF EXISTS public.is_association_admin(uuid, text) CASCADE;

-- Recreate with correct parameter names matching RLS policies
CREATE OR REPLACE FUNCTION public.is_association_admin(association_id uuid, association_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF association_type = 'state' THEN
    RETURN EXISTS (
      SELECT 1 FROM user_state_associations
      WHERE state_association_id = association_id
      AND user_id = auth.uid()
      AND role IN ('state_admin', 'admin')
    );
  ELSIF association_type = 'national' THEN
    RETURN EXISTS (
      SELECT 1 FROM user_national_associations
      WHERE national_association_id = association_id
      AND user_id = auth.uid()
      AND role IN ('national_admin', 'admin')
    );
  END IF;
  
  RETURN false;
END;
$function$;

-- Recreate RLS policies for association_budget_categories
CREATE POLICY "Admins can insert association categories"
  ON association_budget_categories FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can update association categories"
  ON association_budget_categories FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can delete association categories"
  ON association_budget_categories FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));

-- Recreate RLS policies for association_transactions
CREATE POLICY "Admins can insert association transactions"
  ON association_transactions FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can update association transactions"
  ON association_transactions FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can delete association transactions"
  ON association_transactions FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));

-- Recreate RLS policies for association_invoices
CREATE POLICY "Association admins can view invoices"
  ON association_invoices FOR SELECT
  TO authenticated
  USING (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can insert invoices"
  ON association_invoices FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can update invoices"
  ON association_invoices FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can delete invoices"
  ON association_invoices FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));

-- Recreate RLS policies for association_invoice_line_items
CREATE POLICY "Association admins can view invoice line items"
  ON association_invoice_line_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM association_invoices
      WHERE association_invoices.id = association_invoice_line_items.invoice_id
      AND is_association_admin(association_invoices.association_id, association_invoices.association_type)
    )
  );

CREATE POLICY "Association admins can insert invoice line items"
  ON association_invoice_line_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM association_invoices
      WHERE association_invoices.id = association_invoice_line_items.invoice_id
      AND is_association_admin(association_invoices.association_id, association_invoices.association_type)
    )
  );

CREATE POLICY "Association admins can update invoice line items"
  ON association_invoice_line_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM association_invoices
      WHERE association_invoices.id = association_invoice_line_items.invoice_id
      AND is_association_admin(association_invoices.association_id, association_invoices.association_type)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM association_invoices
      WHERE association_invoices.id = association_invoice_line_items.invoice_id
      AND is_association_admin(association_invoices.association_id, association_invoices.association_type)
    )
  );

CREATE POLICY "Association admins can delete invoice line items"
  ON association_invoice_line_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM association_invoices
      WHERE association_invoices.id = association_invoice_line_items.invoice_id
      AND is_association_admin(association_invoices.association_id, association_invoices.association_type)
    )
  );

-- Recreate RLS policies for association_finance_settings
CREATE POLICY "Association admins can view finance settings"
  ON association_finance_settings FOR SELECT
  TO authenticated
  USING (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can insert finance settings"
  ON association_finance_settings FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can update finance settings"
  ON association_finance_settings FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Association admins can delete finance settings"
  ON association_finance_settings FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));

-- Recreate RLS policies for association_tax_rates
CREATE POLICY "Admins can insert association tax rates"
  ON association_tax_rates FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can update association tax rates"
  ON association_tax_rates FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can delete association tax rates"
  ON association_tax_rates FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));

-- Recreate RLS policies for association_budget_entries
CREATE POLICY "Admins can insert association budget entries"
  ON association_budget_entries FOR INSERT
  TO authenticated
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can update association budget entries"
  ON association_budget_entries FOR UPDATE
  TO authenticated
  USING (is_association_admin(association_id, association_type))
  WITH CHECK (is_association_admin(association_id, association_type));

CREATE POLICY "Admins can delete association budget entries"
  ON association_budget_entries FOR DELETE
  TO authenticated
  USING (is_association_admin(association_id, association_type));
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Paperclip, Send, Download, FileText, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { InvoiceEmailModal } from './InvoiceEmailModal';
import jsPDF from 'jspdf';

interface InvoiceLineItem {
  id: string;
  description: string;
  unit_price: number;
  quantity: number;
  category: string;
  tax_type: 'included' | 'excluded' | 'none';
  line_total: number;
}

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
}

interface InvoiceCreationPageProps {
  darkMode: boolean;
  onBack: () => void;
  editingInvoice?: Invoice | null;
  associationId?: string;
  associationType?: 'state' | 'national';
}

export const InvoiceCreationPage: React.FC<InvoiceCreationPageProps> = ({
  darkMode,
  onBack,
  editingInvoice,
  associationId,
  associationType
}) => {
  const { currentClub } = useAuth();
  const isAssociation = !!associationId && !!associationType;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Invoice form data
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [reference, setReference] = useState('');
  const [status, setStatus] = useState<'draft' | 'sent' | 'paid' | 'overdue'>('draft');
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([
    {
      id: '1',
      description: '',
      unit_price: 0,
      quantity: 1,
      category: '',
      tax_type: 'included',
      line_total: 0
    }
  ]);

  // Settings and categories
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [taxRates, setTaxRates] = useState<any[]>([]);
  const [taxEnabled, setTaxEnabled] = useState(false);

  // Quick add category
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryType, setNewCategoryType] = useState<'income' | 'expense'>('income');
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    if (isAssociation || currentClub?.clubId) {
      loadInitialData();
    }
  }, [currentClub, associationId, associationType]);

  // Load invoice data when editing
  useEffect(() => {
    if (editingInvoice) {
      loadInvoiceData(editingInvoice.id);
    }
  }, [editingInvoice]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      let financeSettings = null;
      let settingsError = null;

      // Load finance settings to get next invoice number
      if (isAssociation) {
        const { data, error } = await supabase
          .from('association_finance_settings')
          .select('invoice_prefix, invoice_next_number')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .maybeSingle();
        financeSettings = data;
        settingsError = error;
      } else {
        const { data, error } = await supabase
          .from('club_finance_settings')
          .select('invoice_prefix, invoice_next_number')
          .eq('club_id', currentClub?.clubId)
          .maybeSingle();
        financeSettings = data;
        settingsError = error;
      }

      if (settingsError && settingsError.code !== 'PGRST116') {
        throw settingsError;
      }

      // Generate next invoice number
      const prefix = financeSettings?.invoice_prefix || 'INV-';
      const nextNumber = financeSettings?.invoice_next_number || 1;
      const paddedNumber = nextNumber.toString().padStart(3, '0');
      setInvoiceNumber(`${prefix}${paddedNumber}`);

      // Load categories
      let categoriesData = [];
      let categoriesError = null;

      if (isAssociation) {
        const { data, error } = await supabase
          .from('association_budget_categories')
          .select('*')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('is_active', true)
          .order('name');
        categoriesData = data;
        categoriesError = error;
      } else {
        const { data, error } = await supabase
          .from('budget_categories')
          .select('*')
          .eq('club_id', currentClub?.clubId)
          .eq('is_active', true)
          .order('name');
        categoriesData = data;
        categoriesError = error;
      }

      if (categoriesError) throw categoriesError;
      setCategories(categoriesData || []);

      // Load tax rates
      let taxRatesData: any[] = [];
      let taxRatesError = null;

      if (isAssociation) {
        setTaxEnabled(true);
        const { data, error } = await supabase
          .from('association_tax_rates')
          .select('*')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('is_active', true)
          .order('name');
        taxRatesData = data || [];
        taxRatesError = error;
      } else {
        const { data: clubData } = await supabase
          .from('clubs')
          .select('tax_enabled')
          .eq('id', currentClub?.clubId)
          .maybeSingle();

        const isTaxEnabled = clubData?.tax_enabled || false;
        setTaxEnabled(isTaxEnabled);

        if (isTaxEnabled) {
          const { data, error } = await supabase
            .from('tax_rates')
            .select('*')
            .eq('club_id', currentClub?.clubId)
            .eq('is_active', true)
            .order('name');
          taxRatesData = data || [];
          taxRatesError = error;
        }
      }

      if (taxRatesError) throw taxRatesError;
      setTaxRates(taxRatesData);

    } catch (err) {
      console.error('Error loading initial data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load initial data');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    setSavingCategory(true);
    try {
      if (isAssociation) {
        const { data, error: insertError } = await supabase
          .from('association_budget_categories')
          .insert({
            association_id: associationId,
            association_type: associationType,
            name: newCategoryName.trim(),
            type: newCategoryType,
            is_active: true
          })
          .select('id, name, type')
          .single();
        if (insertError) throw insertError;
        if (data) setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        const { data, error: insertError } = await supabase
          .from('budget_categories')
          .insert({
            club_id: currentClub?.clubId,
            name: newCategoryName.trim(),
            type: newCategoryType,
            is_active: true
          })
          .select('id, name, type')
          .single();
        if (insertError) throw insertError;
        if (data) setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setNewCategoryName('');
      setShowAddCategory(false);
    } catch (err) {
      console.error('Error creating category:', err);
    } finally {
      setSavingCategory(false);
    }
  };

  const loadInvoiceData = async (invoiceId: string) => {
    try {
      setLoading(true);
      setError(null);

      // Determine table names based on context
      const invoiceTable = isAssociation ? 'association_invoices' : 'invoices';
      const lineItemsTable = isAssociation ? 'association_invoice_line_items' : 'invoice_line_items';

      // Load invoice details
      const { data: invoiceData, error: invoiceError } = await supabase
        .from(invoiceTable)
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (invoiceError) throw invoiceError;

      // Populate form with invoice data
      setInvoiceNumber(invoiceData.invoice_number);
      setCustomerName(invoiceData.customer_name);
      setCustomerEmail(invoiceData.customer_email || '');
      setDate(invoiceData.date);
      setDueDate(invoiceData.due_date || '');
      setReference(invoiceData.reference || '');
      setStatus(invoiceData.status || 'draft');

      // Load line items
      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from(lineItemsTable)
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: true });

      if (lineItemsError) throw lineItemsError;

      if (lineItemsData && lineItemsData.length > 0) {
        const formattedLineItems = lineItemsData.map((item: any) => ({
          id: item.id,
          description: item.description,
          unit_price: parseFloat(item.unit_price),
          quantity: item.quantity,
          category: item.category || '',
          tax_type: item.tax_type || 'included',
          line_total: parseFloat(item.line_total)
        }));
        setLineItems(formattedLineItems);
      }

    } catch (err) {
      console.error('Error loading invoice data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load invoice data');
    } finally {
      setLoading(false);
    }
  };

  const addLineItem = () => {
    const newItem: InvoiceLineItem = {
      id: Date.now().toString(),
      description: '',
      unit_price: 0,
      quantity: 1,
      category: '',
      tax_type: 'included',
      line_total: 0
    };
    setLineItems([...lineItems, newItem]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter(item => item.id !== id));
    }
  };

  const updateLineItem = (id: string, field: keyof InvoiceLineItem, value: any) => {
    setLineItems(lineItems.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        
        // Recalculate line total when price or quantity changes
        if (field === 'unit_price' || field === 'quantity') {
          updatedItem.line_total = updatedItem.unit_price * updatedItem.quantity;
        }
        
        return updatedItem;
      }
      return item;
    }));
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let taxAmount = 0;
    let taxExcludedAmount = 0;

    lineItems.forEach(item => {
      const lineTotal = item.line_total;

      // Find the budget category for this line item
      // Note: category field stores category name (text), not UUID
      const category = categories.find(cat => cat.name === item.category || cat.id === item.category);

      if (item.tax_type === 'excluded' && category?.tax_rate_id) {
        // Tax is added on top of the line total
        const taxRate = taxRates.find(rate => rate.id === category.tax_rate_id);
        if (taxRate) {
          // Tax rate is stored as decimal (0.10 = 10%)
          const taxForLine = lineTotal * Number(taxRate.rate);
          taxAmount += taxForLine;
          taxExcludedAmount += taxForLine;
        }
        subtotal += lineTotal;
      } else if (item.tax_type === 'included' && category?.tax_rate_id) {
        // Tax is included in the line total
        const taxRate = taxRates.find(rate => rate.id === category.tax_rate_id);
        if (taxRate) {
          // Extract tax from the line total: tax = lineTotal - (lineTotal / (1 + rate))
          // Tax rate is stored as decimal (0.10 = 10%)
          const taxForLine = lineTotal - (lineTotal / (1 + Number(taxRate.rate)));
          taxAmount += taxForLine;
        }
        subtotal += lineTotal;
      } else {
        // No tax
        subtotal += lineTotal;
      }
    });

    // Total = subtotal + any tax that was excluded (tax included items already have tax in subtotal)
    const total = subtotal + taxExcludedAmount;

    return { subtotal, taxAmount, total };
  };

  const saveInvoiceForAssociation = async (invoiceData: any, lineItemsData: any[], isUpdate: boolean, invoiceId?: string) => {
    if (isUpdate && invoiceId) {
      // Update existing invoice
      const { error: invoiceError } = await supabase
        .from('association_invoices')
        .update(invoiceData)
        .eq('id', invoiceId);

      if (invoiceError) throw invoiceError;

      // Delete and recreate line items
      await supabase.from('association_invoice_line_items').delete().eq('invoice_id', invoiceId);

      const { error: lineItemsError } = await supabase
        .from('association_invoice_line_items')
        .insert(lineItemsData);

      if (lineItemsError) throw lineItemsError;

      return invoiceId;
    } else {
      // Create new invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('association_invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create line items
      const lineItems = lineItemsData.map(item => ({ ...item, invoice_id: invoice.id }));
      const { error: lineItemsError } = await supabase
        .from('association_invoice_line_items')
        .insert(lineItems);

      if (lineItemsError) throw lineItemsError;

      // Update next invoice number
      await supabase
        .from('association_finance_settings')
        .upsert({
          association_id: associationId,
          association_type: associationType,
          invoice_next_number: parseInt(invoiceNumber.replace(/\D/g, '')) + 1
        }, {
          onConflict: 'association_id,association_type'
        });

      return invoice.id;
    }
  };

  const saveInvoiceForClub = async (invoiceData: any, lineItemsData: any[], isUpdate: boolean, invoiceId?: string) => {
    if (isUpdate && invoiceId) {
      // Update existing invoice
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update(invoiceData)
        .eq('id', invoiceId);

      if (invoiceError) throw invoiceError;

      // Delete and recreate line items
      await supabase.from('invoice_line_items').delete().eq('invoice_id', invoiceId);

      const { error: lineItemsError } = await supabase
        .from('invoice_line_items')
        .insert(lineItemsData);

      if (lineItemsError) throw lineItemsError;

      return invoiceId;
    } else {
      // Create new invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create line items
      const lineItems = lineItemsData.map(item => ({ ...item, invoice_id: invoice.id }));
      const { error: lineItemsError } = await supabase
        .from('invoice_line_items')
        .insert(lineItems);

      if (lineItemsError) throw lineItemsError;

      // Update next invoice number
      await supabase
        .from('club_finance_settings')
        .upsert({
          club_id: currentClub!.clubId,
          invoice_next_number: parseInt(invoiceNumber.replace(/\D/g, '')) + 1
        }, {
          onConflict: 'club_id'
        });

      return invoice.id;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAssociation && !currentClub?.clubId) {
      setError('No club or association selected');
      return;
    }

    if (isAssociation && (!associationId || !associationType)) {
      setError('Association information is missing');
      return;
    }

    if (!customerName.trim()) {
      setError('Customer name is required');
      return;
    }

    if (lineItems.some(item => !item.description.trim())) {
      setError('All line items must have a description');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { subtotal, taxAmount, total } = calculateTotals();

      const invoiceBaseData: any = {
        customer_name: customerName,
        customer_email: customerEmail || null,
        date,
        due_date: dueDate || null,
        reference: reference || null,
        subtotal,
        tax_amount: taxAmount,
        total_amount: total,
        status: editingInvoice ? status : 'draft',
        updated_at: new Date().toISOString()
      };

      if (isAssociation) {
        invoiceBaseData.association_id = associationId;
        invoiceBaseData.association_type = associationType;
        if (!editingInvoice) {
          invoiceBaseData.invoice_number = invoiceNumber;
        }
      } else {
        invoiceBaseData.club_id = currentClub!.clubId;
        if (!editingInvoice) {
          invoiceBaseData.invoice_number = invoiceNumber;
        }
      }

      const lineItemsData = lineItems.map(item => ({
        invoice_id: editingInvoice?.id,
        description: item.description,
        unit_price: item.unit_price,
        quantity: item.quantity,
        category: item.category || null,
        tax_type: item.tax_type,
        line_total: item.line_total
      }));

      if (editingInvoice) {
        // Update existing invoice
        if (isAssociation) {
          await saveInvoiceForAssociation(invoiceBaseData, lineItemsData, true, editingInvoice.id);
        } else {
          await saveInvoiceForClub(invoiceBaseData, lineItemsData, true, editingInvoice.id);
        }
        setSuccess('Invoice updated successfully!');
      } else {
        // Create new invoice
        if (isAssociation) {
          await saveInvoiceForAssociation(invoiceBaseData, lineItemsData, false);
        } else {
          await saveInvoiceForClub(invoiceBaseData, lineItemsData, false);
        }
        setSuccess('Invoice created successfully!');
      }
      
      // Reset form or redirect
      setTimeout(() => {
        onBack();
      }, 1500);

    } catch (err) {
      console.error('Error saving invoice:', err);
      console.error('Association context:', { isAssociation, associationId, associationType });
      console.error('Invoice data:', { customerName, invoiceNumber, lineItems });

      // Get more specific error message
      let errorMessage = 'Failed to save invoice';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null && 'message' in err) {
        errorMessage = String((err as any).message);
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!editingInvoice) return;
    if (!isAssociation && !currentClub?.clubId) return;

    try {
      const invoiceTable = isAssociation ? 'association_invoices' : 'invoices';
      const lineItemsTable = isAssociation ? 'association_invoice_line_items' : 'invoice_line_items';

      const { data: invoiceData, error: invoiceError } = await supabase
        .from(invoiceTable)
        .select('*')
        .eq('id', editingInvoice.id)
        .single();

      if (invoiceError) throw invoiceError;

      let orgName = '';
      let orgDetails: any = {};

      if (isAssociation) {
        const assocTable = associationType === 'state' ? 'state_associations' : 'national_associations';
        const { data: assocData, error: assocError } = await supabase
          .from(assocTable)
          .select('name, logo, address')
          .eq('id', associationId)
          .single();

        if (assocError) throw assocError;
        orgName = assocData?.name || 'Association';
        orgDetails = assocData || {};
      } else {
        const { data: clubData, error: clubError } = await supabase
          .from('clubs')
          .select('name, bank_name, bsb, account_number, logo, address')
          .eq('id', currentClub!.clubId)
          .single();

        if (clubError) throw clubError;
        orgName = clubData?.name || 'Club Name';
        orgDetails = clubData || {};
      }

      const invoice: any = {
        ...invoiceData,
        clubs: { name: orgName, ...orgDetails }
      };

      const { data: lineItems, error: lineItemsError } = await supabase
        .from(lineItemsTable)
        .select('*')
        .eq('invoice_id', editingInvoice.id)
        .order('created_at', { ascending: true });

      if (lineItemsError) throw lineItemsError;

      // Generate PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      let yPos = 20;

      // Header Section - Club Name (left) and INVOICE label (right)
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 58, 138); // Dark blue
      doc.text(invoice.clubs?.name || 'Club Name', 20, yPos);

      doc.setFontSize(24);
      doc.setTextColor(0, 0, 0);
      doc.text('INVOICE', pageWidth - 20, yPos, { align: 'right' });

      yPos += 10;

      // Horizontal line under header
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.5);
      doc.line(20, yPos, pageWidth - 20, yPos);

      yPos += 15;

      // Two column layout: Club details (left) and Invoice details (right)
      const leftColX = 20;
      const rightColX = pageWidth / 2 + 10;

      // Left column - Club details
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('From:', leftColX, yPos);

      yPos += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(invoice.clubs?.name || '', leftColX, yPos);

      if (invoice.clubs?.address) {
        yPos += 5;
        doc.text(invoice.clubs.address, leftColX, yPos);
      }

      // Right column - Invoice details
      let rightYPos = yPos - 11;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Invoice Number:', rightColX, rightYPos);
      doc.setFont('helvetica', 'normal');
      doc.text(invoice.invoice_number, rightColX + 35, rightYPos);

      rightYPos += 6;
      doc.setFont('helvetica', 'bold');
      doc.text('Invoice Date:', rightColX, rightYPos);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date(invoice.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }), rightColX + 35, rightYPos);

      if (invoice.due_date) {
        rightYPos += 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Due Date:', rightColX, rightYPos);
        doc.setFont('helvetica', 'normal');
        doc.text(new Date(invoice.due_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }), rightColX + 35, rightYPos);
      }

      yPos += 15;

      // Bill To section
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Bill To:', leftColX, yPos);

      yPos += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(invoice.customer_name, leftColX, yPos);

      yPos += 15;

      // Line items table
      const tableTop = yPos;
      const colX = {
        description: 20,
        quantity: 110,
        unitPrice: 135,
        tax: 160,
        amount: pageWidth - 20
      };

      // Table header
      doc.setFillColor(240, 240, 240);
      doc.rect(20, yPos - 5, pageWidth - 40, 8, 'F');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Description', colX.description, yPos);
      doc.text('Qty', colX.quantity, yPos);
      doc.text('Unit Price', colX.unitPrice, yPos);
      doc.text('Tax', colX.tax, yPos);
      doc.text('Amount', colX.amount, yPos, { align: 'right' });

      yPos += 8;

      // Table items
      doc.setFont('helvetica', 'normal');
      lineItems.forEach((item: any) => {
        if (yPos > pageHeight - 60) {
          doc.addPage();
          yPos = 20;
        }

        const gstLabel = invoice.tax_amount > 0 ? 'Tax' : '-';

        doc.text(item.description, colX.description, yPos);
        doc.text(String(item.quantity), colX.quantity, yPos);
        doc.text(`$${parseFloat(item.unit_price).toFixed(2)}`, colX.unitPrice, yPos);
        doc.text(gstLabel, colX.tax, yPos);
        doc.text(`$${parseFloat(item.line_total).toFixed(2)}`, colX.amount, yPos, { align: 'right' });
        yPos += 6;
      });

      yPos += 5;

      // Totals section
      const totalsX = pageWidth - 20;
      const totalsLabelX = pageWidth - 70;

      // Subtotal
      doc.setFont('helvetica', 'normal');
      doc.text('Subtotal:', totalsLabelX, yPos);
      doc.text(`$${parseFloat(invoice.subtotal).toFixed(2)}`, totalsX, yPos, { align: 'right' });

      yPos += 6;

      // Tax
      const taxLabel = invoice.tax_amount > 0 ? `Tax (${invoice.tax_rate || 10}%):` : 'Tax:';
      doc.text(taxLabel, totalsLabelX, yPos);
      doc.text(`$${parseFloat(invoice.tax_amount).toFixed(2)}`, totalsX, yPos, { align: 'right' });

      yPos += 2;
      doc.setDrawColor(200, 200, 200);
      doc.line(totalsLabelX, yPos, totalsX, yPos);
      yPos += 6;

      // Total
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Total:', totalsLabelX, yPos);
      doc.text(`$${parseFloat(invoice.total_amount).toFixed(2)}`, totalsX, yPos, { align: 'right' });

      yPos += 10;

      // Payment Details section
      if (invoice.clubs?.bank_name || invoice.clubs?.bsb || invoice.clubs?.account_number) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 58, 138);
        doc.text('Payment Details', 20, yPos);
        yPos += 7;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        if (invoice.clubs?.bank_name) {
          doc.text(`Bank: ${invoice.clubs.bank_name}`, 20, yPos);
          yPos += 5;
        }

        if (invoice.clubs?.bsb) {
          doc.text(`BSB: ${invoice.clubs.bsb}`, 20, yPos);
          yPos += 5;
        }

        if (invoice.clubs?.account_number) {
          doc.text(`Account: ${invoice.clubs.account_number}`, 20, yPos);
        }
      }

      // Download the PDF
      doc.save(`invoice-${invoice.invoice_number}.pdf`);

    } catch (err) {
      console.error('Error exporting PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to export PDF');
    }
  };

  const { subtotal, taxAmount, total } = calculateTotals();

  if (loading && !invoiceNumber) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const LCOLS = taxEnabled ? 'minmax(0,1fr) 190px 150px 130px 40px' : 'minmax(0,1fr) 210px 130px 40px';
  const statusLight = status === 'paid' ? 'a-light-g' : status === 'overdue' ? 'a-light-r' : status === 'sent' ? 'a-light-b' : '';

  return (
    <div className="flex justify-center">
      <form onSubmit={handleSubmit} className="a-msheet a-msheet-page" style={{ width: 760 }} aria-label={editingInvoice ? 'Edit invoice' : 'Create invoice'}>
        <div className="flex items-center gap-3 a-grp-head" style={{ padding: '20px 18px 16px 22px' }}>
          <button type="button" onClick={onBack} className="a-ib" aria-label="Back to finances" title="Back to finances"><ArrowLeft size={20} /></button>
          <span className="a-tile a-tile-rim"><FileText size={19} /></span>
          <div className="flex-1 min-w-0">
            <p className="a-cap">{editingInvoice ? 'Edit invoice' : 'New invoice'}</p>
            <div className="a-display a-ink text-[21px] font-semibold mt-0.5 truncate">{invoiceNumber || 'Invoice'}</div>
          </div>
          <div className="relative inline-flex">
            <span className={`a-light ${statusLight} absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none`} />
            <label className="sr-only" htmlFor="inv-status">Status</label>
            <select id="inv-status" value={status} onChange={(e) => setStatus(e.target.value as 'draft' | 'sent' | 'paid' | 'overdue')} className="a-pick" style={{ height: 36, borderRadius: 11, paddingLeft: 30 }}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-5" style={{ padding: '20px 22px' }}>
          {error && <div className="a-note"><span className="a-txt-r text-sm">{error}</span></div>}
          {success && <div className="a-note"><span className="a-txt-g text-sm">{success}</span></div>}

          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr] gap-3">
            <label>
              <span className="a-flab">Customer <span className="a-txt-r">*</span></span>
              <input type="text" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="a-inp" placeholder="Who is this invoice for?" />
            </label>
            <label>
              <span className="a-flab">Date <span className="a-txt-r">*</span></span>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="a-inp a-inp-date" />
            </label>
            <label>
              <span className="a-flab">Invoice number</span>
              <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="a-inp" placeholder="INV-001" />
            </label>
          </div>

          <label>
            <span className="a-flab">Reference <span className="a-dim font-normal">· optional</span></span>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} className="a-inp" placeholder="PO number or note" />
          </label>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="a-flab" style={{ margin: 0 }}>Line items</span>
              <button type="button" onClick={addLineItem} className="a-btn a-btn-q a-txt-b" style={{ height: 30, padding: '0 8px', fontSize: 13 }}><Plus size={15} />Add line</button>
            </div>
            <div className="a-grp">
              {lineItems.map((item, i) => (
                <div key={item.id} className={`grid items-center ${i > 0 ? 'a-grp-rule' : ''}`} style={{ gridTemplateColumns: LCOLS }}>
                  <label className="a-cell" style={{ display: 'block' }}>
                    <span className="a-cell-l">Description</span>
                    <input type="text" value={item.description} onChange={(e) => updateLineItem(item.id, 'description', e.target.value)} placeholder="What is this for?" />
                  </label>
                  <div className="pr-2">
                    <label className="sr-only" htmlFor={`cat-${item.id}`}>Category</label>
                    <select
                      id={`cat-${item.id}`}
                      value={item.category}
                      onChange={(e) => {
                        if (e.target.value === '__add_new__') { e.target.value = item.category; setShowAddCategory(true); return; }
                        updateLineItem(item.id, 'category', e.target.value);
                      }}
                      className="a-pick a-pick-soft w-full"
                      style={{ height: 38 }}
                    >
                      <option value="">Select category</option>
                      {categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}
                      <option value="__add_new__">+ Add a category…</option>
                    </select>
                  </div>
                  {taxEnabled && (
                    <div className="pr-2">
                      <label className="sr-only" htmlFor={`tax-${item.id}`}>Tax</label>
                      <select id={`tax-${item.id}`} value={item.tax_type} onChange={(e) => updateLineItem(item.id, 'tax_type', e.target.value)} className="a-pick a-pick-soft w-full" style={{ height: 38 }}>
                        <option value="none">No tax</option>
                        {taxRates.map(rate => (
                          <optgroup key={rate.id} label={rate.name}>
                            <option value="included">Tax included</option>
                            <option value="excluded">Tax excluded</option>
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                  <label className="text-right" style={{ padding: '0 14px' }}>
                    <span className="a-dim text-xs block">AUD</span>
                    <span className="inline-flex items-baseline justify-end">
                      <span className={`a-num text-base font-semibold ${item.line_total ? 'a-ink' : 'a-dim'}`}>$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        aria-label="Amount"
                        value={item.line_total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        onChange={(e) => updateLineItem(item.id, 'line_total', parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0)}
                        className={`a-num a-bare text-right text-base font-semibold ${item.line_total ? 'a-ink' : 'a-dim'}`}
                        style={{ width: 90 }}
                      />
                    </span>
                  </label>
                  <span className="flex justify-center">
                    {lineItems.length > 1 && (
                      <button type="button" onClick={() => removeLineItem(item.id)} className="a-ib a-ib-d" style={{ width: 32, height: 32 }} aria-label="Remove line"><Trash2 size={15} /></button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3.5 items-stretch">
            <label>
              <span className="a-flab">Notes</span>
              <textarea rows={3} className="a-inp" placeholder="Add any notes for the customer" style={{ resize: 'none', minHeight: 82 }} />
            </label>
            <div className="flex flex-col justify-end gap-2.5">
              <button type="button" className="a-btn"><Paperclip size={16} />Attach file</button>
            </div>
          </div>
        </div>

        <div className="a-panel-foot flex-wrap items-center" style={{ padding: '16px 22px' }}>
          <div className="flex-1 min-w-[180px]">
            <p className="a-cap">Total</p>
            <div className="a-big a-ink mt-1" style={{ fontSize: 30 }}>${total.toFixed(2)} <span className="a-dim text-sm" style={{ fontFamily: 'Instrument Sans, sans-serif', letterSpacing: 0 }}>AUD</span></div>
            {taxEnabled && <div className="a-dim text-xs mt-1">Sub total ${subtotal.toFixed(2)} · Tax ${taxAmount.toFixed(2)}</div>}
          </div>
          {editingInvoice && (
            <>
              <button type="button" onClick={() => setShowEmailModal(true)} className="a-btn" style={{ height: 46 }}><Send size={16} />Send email</button>
              <button type="button" onClick={handleExportPDF} className="a-btn" style={{ height: 46 }}><Download size={16} />Export PDF</button>
            </>
          )}
          <button type="button" onClick={onBack} className="a-btn" style={{ height: 46 }}>Cancel</button>
          <button type="submit" disabled={loading} className="a-btn a-btn-p" style={{ height: 46 }}><Check size={16} />{loading ? 'Saving…' : editingInvoice ? 'Update invoice' : 'Save invoice'}</button>
        </div>
      </form>

      {editingInvoice && (
        <InvoiceEmailModal invoice={editingInvoice} isOpen={showEmailModal} onClose={() => setShowEmailModal(false)} darkMode={darkMode} />
      )}

      {showAddCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="a-msheet" style={{ width: 420 }} role="dialog" aria-modal="true" aria-label="Add category">
            <div className="flex items-center gap-3" style={{ padding: '20px 18px 12px 22px' }}>
              <span className="a-tile a-tile-rim"><Plus size={18} /></span>
              <h3 className="a-display a-ink flex-1 m-0 text-xl font-semibold">New category</h3>
            </div>
            <div className="flex flex-col gap-4" style={{ padding: '4px 22px 20px' }}>
              <label><span className="a-flab">Name</span>
                <input type="text" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleQuickAddCategory()} className="a-inp" placeholder="Category name" autoFocus />
              </label>
              <div>
                <span className="a-flab">Type</span>
                <div className="a-seg flex w-full">
                  <button type="button" onClick={() => setNewCategoryType('income')} className={`a-seg-i flex-1 justify-center ${newCategoryType === 'income' ? 'a-seg-on' : ''}`}><span className="a-light" style={{ background: '#30D158', boxShadow: 'none' }} />Income</button>
                  <button type="button" onClick={() => setNewCategoryType('expense')} className={`a-seg-i flex-1 justify-center ${newCategoryType === 'expense' ? 'a-seg-on' : ''}`}><span className="a-light" style={{ background: '#FF6B6B', boxShadow: 'none' }} />Expense</button>
                </div>
              </div>
            </div>
            <div className="a-panel-foot" style={{ padding: '14px 22px' }}>
              <button onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }} className="a-btn">Cancel</button>
              <button onClick={handleQuickAddCategory} disabled={savingCategory || !newCategoryName.trim()} className="a-btn a-btn-p">{savingCategory ? 'Adding…' : 'Add category'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

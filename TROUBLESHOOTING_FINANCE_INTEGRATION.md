# Troubleshooting Finance Integration

## Issue: Membership payments not appearing in Finance section

### Step 1: Check Configuration

**IMPORTANT:** You must configure the system first before transactions will appear correctly!

1. **Navigate to:** Settings → Finance → Membership Integration tab

2. **Create Income Category:**
   - Click on "Categories" tab
   - Click "+ New Category"
   - Name: "Membership Income"
   - Type: Select "Income"
   - Click "Save"

3. **Configure Membership Integration:**
   - Go back to "Membership Integration" tab
   - Select "Membership Income" from the dropdown
   - Enable tax if needed (e.g., 10% for GST)
   - Click "Save Configuration"

### Step 2: Test the Flow

1. **Approve a NEW membership application** (do this AFTER configuration)
   - Go to Membership → Applications
   - Approve an application with "Bank Transfer" payment method

2. **Check Finance Transactions:**
   - Open browser console (F12)
   - Go to Finances → Transactions
   - You should see a transaction with:
     - Description: "Membership: [Name] - [Type]"
     - Type: Deposit
     - Status: Pending
     - Category: Membership Income

3. **Confirm Payment:**
   - Go to Membership → Payment Reconciliation (or click "Pending Payments" banner)
   - Find the member
   - Click "Confirm Payment"
   - Check console for logs: "Updating finance transaction for member: [id]"

4. **Verify in Finance:**
   - Go to Finances → Overview
   - Check "Membership Income" widget (cyan colored)
   - Go to Finances → Transactions
   - The transaction should now show Status: "Paid"

### Step 3: Check Browser Console

Open browser console (F12) and look for:

**When approving application:**
```
Creating membership finance transaction: {club_id, type: "deposit", ...}
Transaction created successfully: [transaction_id]
```

**When confirming payment:**
```
Updating finance transaction for member: [member_id]
Finance transaction updated successfully
```

**If you see errors:**
- "Club finance configuration not found" → Go configure the settings (Step 1)
- "No pending transaction found" → The transaction wasn't created when application was approved
- "Failed to update finance transaction" → Check the detailed error in console

### Step 4: Check Database

If transactions still don't appear, check the database directly:

```sql
-- Check if transaction was created
SELECT * FROM transactions
WHERE club_id = '[your-club-id]'
AND linked_entity_type = 'membership'
ORDER BY created_at DESC;

-- Check membership_transactions link
SELECT * FROM membership_transactions
WHERE club_id = '[your-club-id]'
ORDER BY created_at DESC;
```

### Common Issues & Solutions

#### Issue: "No transactions appearing at all"
**Solution:**
- Configure default membership category first (Step 1)
- The system will create transactions even without category, but it's better to set it up

#### Issue: "Transaction created but not showing in dashboard"
**Solution:**
- Check if the transaction date is in the current month
- Finance dashboard only shows current month by default
- Go to Finances → Transactions to see all transactions

#### Issue: "Payment confirmed but status not updating"
**Solution:**
- Check console for error messages
- Ensure the member has a pending transaction linked to them
- Try refreshing the page

#### Issue: "Stripe payments not creating transactions"
**Solution:**
- Check if Stripe webhook is properly configured
- Check Stripe webhook logs in Supabase dashboard
- Ensure you've saved the membership integration configuration

### What Transactions Include

When working correctly, each membership transaction records:
- **Amount:** Total paid by member
- **Tax Amount:** If tax is enabled (e.g., $10 on $110 with 10% GST)
- **Gateway Fee:** For Stripe payments (1.75% + $0.30)
- **Net Amount:** What you actually receive
- **Payment Method:** bank_transfer, credit_card, or cash
- **Status:** pending or paid
- **Category:** Your configured membership income category
- **Link:** Connected to the member record

### Expected Behavior

**Bank Transfer Flow:**
1. Application approved → Transaction created with status "pending"
2. Payment confirmed → Transaction updated to status "paid"
3. Finance dashboard updates immediately

**Stripe Card Flow:**
1. Application approved → Redirect to Stripe
2. Payment succeeds → Webhook fires
3. Transaction created automatically with status "paid"
4. Member marked as financial
5. Finance dashboard updates immediately

### Still Not Working?

1. **Check RLS Policies:**
   - Ensure you're logged in as club admin
   - RLS policies require admin role to create/view transactions

2. **Check for JavaScript Errors:**
   - Open console (F12) → Console tab
   - Look for red errors
   - Screenshot and report any errors

3. **Verify Data:**
   - Go to Supabase dashboard
   - Check `transactions` table manually
   - Check `membership_transactions` table manually
   - Verify `club_id` matches your current club

4. **Clear Cache:**
   - Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
   - Or clear browser cache completely

5. **Check Configuration:**
   - Settings → Finance → Membership Integration
   - Verify category is selected
   - Click "Save Configuration" again

## Testing Checklist

- [ ] Created "Membership Income" category (Income type)
- [ ] Configured default membership category in Membership Integration
- [ ] Approved a NEW application (after configuration)
- [ ] Checked console for "Transaction created successfully" message
- [ ] Confirmed payment in Payment Reconciliation
- [ ] Checked console for "Finance transaction updated successfully"
- [ ] Verified transaction appears in Finances → Transactions
- [ ] Verified amount shows in Finance Dashboard "Membership Income" widget
- [ ] Transaction shows correct status (Paid)
- [ ] Transaction is linked to correct member

# Member's Guide to Multi-Club Memberships

## Overview

Alfie allows you to be a member of multiple yacht clubs! You only pay state and national association fees once per year, regardless of how many clubs you join.

## How It Works

### Primary Membership
Your **first club** is your primary membership. You pay:
- ✅ Club membership fee
- ✅ State association fee
- ✅ National association fee

### Associate Memberships
**Additional clubs** you join are associate memberships. You only pay:
- ✅ Club membership fee (often at a reduced rate)
- ❌ State association fee (already paid)
- ❌ National association fee (already paid)

### Example
**John joins Lake Macquarie RC (primary):**
- Club Fee: $50
- State Fee (NSW): $15
- National Fee (AUS): $10
- **Total: $75**

**John then joins Port Stephens RC (associate):**
- Club Fee: $40 (associate rate)
- State Fee: $0 (already paid to NSW)
- National Fee: $0 (already paid to AUS)
- **Total: $40**

**John's annual total: $115 instead of $150!**

## How to Join Another Club

### Step 1: Navigate to Your Membership Page
1. Log in to Alfie
2. Go to **Dashboard** → **Membership**
3. You'll see a "My Club Memberships" widget

### Step 2: Click "Join Another Club"
The widget shows:
- All your current club memberships
- Primary vs Associate status for each club
- Fee breakdown for each membership
- A prominent **"Join Another Club"** button

### Step 3: Search for Clubs
1. Click the "Join Another Club" button
2. A modal opens showing all available clubs
3. Use the search bar to find clubs by name
4. Clubs you're already a member of show a green checkmark

### Step 4: Review Fees & Apply
1. Select a club from the list
2. Review the fee breakdown:
   - See if you'll be a primary or associate member
   - View club, state, and national fees
   - See your total cost
3. Select your membership type
4. Click "Submit Application"

### Step 5: Wait for Approval
1. The club administrator receives your application
2. They review and approve your membership
3. You receive a notification when approved
4. Your new membership appears in "My Club Memberships"

## Fee Logic Explained

### Same State, Different Clubs
If you join clubs in the same state:
- **First club:** Pay all fees (club + state + national)
- **Additional clubs:** Pay club fee only

### Different States
If you join a club in a different state:
- **Different state association:** You pay that state's fee
- **Same national association:** No additional national fee

Example:
- **NSW Club (primary):** $50 club + $15 NSW + $10 national = $75
- **VIC Club (associate):** $45 club + $18 VIC + $0 national = $63
- **Total:** $138/year for two clubs in different states

## Benefits of Multi-Club Membership

### For Members
- ✨ Race at multiple locations
- 🏆 More competition opportunities
- 🌊 Experience different sailing conditions
- 🤝 Larger sailing community
- 💰 Save on association fees

### For Clubs
- 📈 Increased participation
- 🎯 Attract interstate sailors
- 🔄 Cross-club events become easier
- 💪 Stronger sailing community

## Frequently Asked Questions

### Q: Can I join clubs in different states?
**A:** Yes! You can join clubs anywhere in Australia. You'll pay each state's fee (since they're different associations), but you won't pay multiple national fees.

### Q: What if I move to a different state?
**A:** You can change your primary club to one in your new state. The system will automatically adjust your fee obligations.

### Q: Can I have multiple primary memberships?
**A:** No, you can only have one primary membership at a time. All others are associate memberships.

### Q: Do I get full racing privileges at associate clubs?
**A:** Yes! Associate members can race, participate in club events, and access all club facilities. Some clubs may have specific rules for committee voting rights.

### Q: How do renewals work with multiple clubs?
**A:** Each club membership renews independently. You'll be notified when each membership is due for renewal.

### Q: Can I switch my primary club?
**A:** Yes, contact a club administrator to designate a different club as your primary membership. This may affect your fee structure.

### Q: What happens if I let one membership lapse?
**A:** If your primary membership lapses, one of your associate memberships may need to become primary (and you'd pay state/national fees through that club).

### Q: Can family members have associate memberships?
**A:** Yes! Family memberships are a type of associate membership with even more reduced fees. Check with your club for family membership options.

## Technical Details

### Automatic Fee Detection
The system automatically:
- ✅ Detects your existing memberships
- ✅ Checks if you've paid state/national fees this year
- ✅ Calculates correct fees for new memberships
- ✅ Prevents duplicate association fee charges
- ✅ Updates when you pay fees or join clubs

### Database Structure
Each club membership is tracked separately:
- **member_id:** Your user account
- **club_id:** The club you've joined
- **relationship_type:** primary, associate, social, or family
- **pays_association_fees:** true/false (auto-calculated)
- **payment_status:** paid, unpaid, partial, overdue

### Remittance Tracking
Association fees are tracked per member per year:
- State associations see all members paying fees to them
- National associations see all members paying fees to them
- No duplicate remittances are created for associate memberships

## Support

If you have questions or issues:
1. **Check your club memberships:** Dashboard → Membership
2. **Review fee breakdown:** Click on any membership to see details
3. **Contact your club admin:** They can help with membership questions
4. **Email support:** support@alfie.com

## Tips for Success

### Before Joining
- ✅ Check the club's website and sailing schedule
- ✅ Review the fee breakdown carefully
- ✅ Contact the club if you have questions
- ✅ Ensure your profile information is up to date

### After Joining
- ✅ Introduce yourself to club members
- ✅ Attend a few race days to get familiar
- ✅ Keep your contact details current
- ✅ Stay on top of fee payments

### Best Practices
- 📅 Plan your racing calendar across multiple clubs
- 💬 Communicate with both club committees
- 🔔 Enable notifications for important updates
- 📊 Track your results across all clubs
- 🤝 Be an active member of each community

---

**Happy sailing across multiple clubs!** 🎉⛵

/*
  # Create Global Legal Pages Management System

  1. New Tables
    - `global_legal_pages`
      - `id` (uuid, primary key)
      - `page_type` (text enum: 'privacy_policy', 'terms_of_service')
      - `title` (text)
      - `content` (text) - Plain text version
      - `html_content` (text) - Rich HTML content from WYSIWYG editor
      - `last_updated` (timestamptz)
      - `updated_by` (uuid) - Reference to auth.users

  2. Security
    - Enable RLS on `global_legal_pages` table
    - Add policy for public read access (anyone can view legal pages)
    - Add policy for super admin write access (only super admins can edit)

  3. Initial Data
    - Insert default Privacy Policy
    - Insert default Terms of Service
*/

-- Create the global legal pages table
CREATE TABLE IF NOT EXISTS global_legal_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_type text NOT NULL UNIQUE CHECK (page_type IN ('privacy_policy', 'terms_of_service')),
  title text NOT NULL DEFAULT '',
  content text DEFAULT '',
  html_content text DEFAULT '',
  last_updated timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE global_legal_pages ENABLE ROW LEVEL SECURITY;

-- Public can read all legal pages
CREATE POLICY "Public can view legal pages"
  ON global_legal_pages
  FOR SELECT
  TO public
  USING (true);

-- Only super admins can update legal pages
CREATE POLICY "Super admins can update legal pages"
  ON global_legal_pages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Only super admins can insert legal pages
CREATE POLICY "Super admins can insert legal pages"
  ON global_legal_pages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_super_admin = true
    )
  );

-- Create an index on page_type for faster lookups
CREATE INDEX IF NOT EXISTS idx_global_legal_pages_page_type ON global_legal_pages(page_type);

-- Insert default Privacy Policy
INSERT INTO global_legal_pages (page_type, title, html_content, content) 
VALUES (
  'privacy_policy',
  'Privacy Policy',
  '<h1>Privacy Policy</h1>
<p><strong>Last Updated:</strong> January 2026</p>

<h2>1. Introduction</h2>
<p>Welcome to alfiePRO. We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you about how we handle your personal data when you use our platform.</p>

<h2>2. Information We Collect</h2>
<p>We collect and process the following types of information:</p>
<ul>
  <li><strong>Account Information:</strong> Name, email address, phone number, and club membership details</li>
  <li><strong>Sailing Data:</strong> Race results, handicaps, boat information, and performance statistics</li>
  <li><strong>Usage Information:</strong> How you interact with our platform, including pages visited and features used</li>
  <li><strong>Payment Information:</strong> Processed securely through our payment provider (Stripe)</li>
</ul>

<h2>3. How We Use Your Information</h2>
<p>We use your information to:</p>
<ul>
  <li>Provide and maintain our yacht club management services</li>
  <li>Process membership registrations and renewals</li>
  <li>Calculate and display race results and handicaps</li>
  <li>Send important updates about your club and events</li>
  <li>Improve our platform and develop new features</li>
  <li>Comply with legal obligations</li>
</ul>

<h2>4. Information Sharing</h2>
<p>We may share your information with:</p>
<ul>
  <li><strong>Your Yacht Club:</strong> Club administrators can access your membership and race data</li>
  <li><strong>Public Results:</strong> Race results may be displayed publicly on club websites</li>
  <li><strong>Service Providers:</strong> Third-party services that help us operate (e.g., payment processing, hosting)</li>
  <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
</ul>

<h2>5. Data Security</h2>
<p>We implement appropriate security measures to protect your personal data, including:</p>
<ul>
  <li>Encryption of data in transit and at rest</li>
  <li>Regular security assessments</li>
  <li>Access controls and authentication</li>
  <li>Secure hosting infrastructure</li>
</ul>

<h2>6. Your Rights</h2>
<p>You have the right to:</p>
<ul>
  <li>Access your personal data</li>
  <li>Correct inaccurate data</li>
  <li>Request deletion of your data</li>
  <li>Object to processing of your data</li>
  <li>Export your data</li>
  <li>Withdraw consent at any time</li>
</ul>

<h2>7. Cookies and Tracking</h2>
<p>We use cookies and similar technologies to:</p>
<ul>
  <li>Keep you signed in</li>
  <li>Remember your preferences</li>
  <li>Understand how you use our platform</li>
  <li>Improve our services</li>
</ul>

<h2>8. Children''s Privacy</h2>
<p>Our platform may be used by junior sailors under 18. Parental consent is required for junior memberships, and we take extra care to protect children''s data.</p>

<h2>9. Changes to This Policy</h2>
<p>We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last Updated" date.</p>

<h2>10. Contact Us</h2>
<p>If you have questions about this privacy policy or your personal data, please contact us at:</p>
<p><strong>Email:</strong> privacy@alfiepro.com.au<br>
<strong>Website:</strong> www.alfiepro.com.au</p>',
  'Privacy Policy - Last Updated: January 2026...'
)
ON CONFLICT (page_type) DO NOTHING;

-- Insert default Terms of Service
INSERT INTO global_legal_pages (page_type, title, html_content, content)
VALUES (
  'terms_of_service',
  'Terms of Service',
  '<h1>Terms of Service</h1>
<p><strong>Last Updated:</strong> January 2026</p>

<h2>1. Agreement to Terms</h2>
<p>By accessing and using alfiePRO, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using this platform.</p>

<h2>2. Description of Service</h2>
<p>alfiePRO provides yacht club management software including:</p>
<ul>
  <li>Membership management</li>
  <li>Race management and results tracking</li>
  <li>Event organization and registration</li>
  <li>Financial management and reporting</li>
  <li>Communication tools</li>
  <li>Public website hosting</li>
</ul>

<h2>3. User Accounts</h2>
<p>To use our platform, you must:</p>
<ul>
  <li>Provide accurate and complete registration information</li>
  <li>Maintain the security of your account credentials</li>
  <li>Notify us immediately of any unauthorized access</li>
  <li>Be responsible for all activities under your account</li>
  <li>Not share your account with others</li>
</ul>

<h2>4. Acceptable Use</h2>
<p>You agree not to:</p>
<ul>
  <li>Violate any laws or regulations</li>
  <li>Infringe on others'' intellectual property rights</li>
  <li>Transmit harmful code or malware</li>
  <li>Attempt to gain unauthorized access to our systems</li>
  <li>Harass, abuse, or harm other users</li>
  <li>Use the platform for any illegal purpose</li>
  <li>Scrape or mine data without permission</li>
</ul>

<h2>5. Club Administrator Responsibilities</h2>
<p>Club administrators agree to:</p>
<ul>
  <li>Manage their club''s data accurately and responsibly</li>
  <li>Respect members'' privacy and data protection rights</li>
  <li>Comply with applicable sailing regulations</li>
  <li>Maintain appropriate payment arrangements</li>
  <li>Ensure their club''s content is appropriate and legal</li>
</ul>

<h2>6. Payment Terms</h2>
<ul>
  <li>Subscription fees are billed monthly or annually as selected</li>
  <li>Prices may change with 30 days notice</li>
  <li>Refunds are provided according to our refund policy</li>
  <li>Payment processing is handled securely by Stripe</li>
  <li>You are responsible for all applicable taxes</li>
</ul>

<h2>7. Intellectual Property</h2>
<p>The alfiePRO platform, including all content, features, and functionality, is owned by alfiePRO and is protected by copyright, trademark, and other intellectual property laws.</p>
<p>You retain ownership of content you upload, but grant us a license to use it to provide our services.</p>

<h2>8. Data and Privacy</h2>
<p>Your use of the platform is also governed by our Privacy Policy. We collect, use, and protect your data as described in that policy.</p>

<h2>9. Termination</h2>
<p>We may terminate or suspend your access to the platform:</p>
<ul>
  <li>For violation of these terms</li>
  <li>For non-payment of fees</li>
  <li>If required by law</li>
  <li>At our discretion with notice</li>
</ul>
<p>You may cancel your subscription at any time through your account settings.</p>

<h2>10. Disclaimers</h2>
<p>The platform is provided "as is" without warranties of any kind. We do not guarantee:</p>
<ul>
  <li>Uninterrupted or error-free operation</li>
  <li>Accuracy of race calculations (though we strive for accuracy)</li>
  <li>That the platform will meet your specific requirements</li>
  <li>That all data will be preserved indefinitely</li>
</ul>

<h2>11. Limitation of Liability</h2>
<p>To the maximum extent permitted by law, alfiePRO shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the platform.</p>

<h2>12. Indemnification</h2>
<p>You agree to indemnify and hold alfiePRO harmless from any claims, damages, or expenses arising from your use of the platform or violation of these terms.</p>

<h2>13. Changes to Terms</h2>
<p>We reserve the right to modify these terms at any time. We will notify users of material changes. Your continued use of the platform after changes constitutes acceptance of the new terms.</p>

<h2>14. Governing Law</h2>
<p>These terms are governed by the laws of Australia. Any disputes shall be resolved in Australian courts.</p>

<h2>15. Contact Information</h2>
<p>For questions about these Terms of Service, please contact us at:</p>
<p><strong>Email:</strong> support@alfiepro.com.au<br>
<strong>Website:</strong> www.alfiepro.com.au</p>',
  'Terms of Service - Last Updated: January 2026...'
)
ON CONFLICT (page_type) DO NOTHING;

-- Create a function to update the last_updated timestamp
CREATE OR REPLACE FUNCTION update_legal_page_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-update timestamp
DROP TRIGGER IF EXISTS update_legal_page_timestamp_trigger ON global_legal_pages;
CREATE TRIGGER update_legal_page_timestamp_trigger
  BEFORE UPDATE ON global_legal_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_legal_page_timestamp();
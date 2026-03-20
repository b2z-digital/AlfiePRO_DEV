/*
  # Update Privacy Policy - Comprehensive Apple App Store Compliant Version

  ## Summary
  Updates the privacy policy content to be comprehensive and compliant with:
  - Apple App Store Review Guidelines
  - Australian Privacy Act 1988 / APPs
  - GDPR (European users)
  - CCPA (California users)

  ## Changes
  - Expands privacy policy to cover all alfiePRO features:
    - Community features (posts, groups, connections, direct messages)
    - Live race tracking and location data
    - Camera, microphone, and photo library access
    - Push notifications
    - AI assistant (AlfiePRO)
    - Livestreaming
    - Boat garage data
    - Third-party integrations (YouTube, Google, Facebook, Stripe, etc.)
    - Children's privacy (junior sailors under 18)
    - International data transfers
  - Updates last_updated timestamp to March 2026
*/

UPDATE global_legal_pages
SET 
  title = 'Privacy Policy',
  content = 'Privacy Policy for alfiePRO - Last Updated: March 2026',
  html_content = $html$
<h2>Privacy Policy</h2>
<p><strong>Last Updated: March 2026</strong></p>

<h3>1. Introduction</h3>
<p>Welcome to alfiePRO ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our alfiePRO mobile application and web platform (collectively, the "Service").</p>
<p>Please read this policy carefully. If you disagree with its terms, please discontinue use of the Service.</p>

<h3>2. Information We Collect</h3>
<p>We collect information that you provide directly to us, information collected automatically, and information from third parties.</p>

<h4>2.1 Information You Provide</h4>
<ul>
  <li><strong>Account Information:</strong> Name, email address, phone number, date of birth, and profile photo.</li>
  <li><strong>Membership Information:</strong> Club membership details, membership type, payment status, and membership history.</li>
  <li><strong>Sailing &amp; Racing Data:</strong> Race results, handicap ratings, boat information (name, class, sail number, certifications), performance statistics, and event registrations.</li>
  <li><strong>Community Content:</strong> Posts, comments, photos, videos, group memberships, connections, and direct messages you create or share within the platform.</li>
  <li><strong>Payment Information:</strong> Processed securely through Stripe. We do not store your full card details on our servers.</li>
  <li><strong>Communications:</strong> Messages you send to club administrators, event organisers, or other members.</li>
  <li><strong>Event Information:</strong> Event registrations, attendance records, and emergency contact details provided during registration.</li>
  <li><strong>Boat &amp; Garage Data:</strong> Boat specifications, maintenance records, tuning guides, and performance logs you voluntarily enter.</li>
  <li><strong>Profile Preferences:</strong> Dashboard customisation, notification preferences, scoring preferences, and app settings.</li>
</ul>

<h4>2.2 Information Collected Automatically</h4>
<ul>
  <li><strong>Usage Data:</strong> Pages visited, features used, time spent, and interactions within the app.</li>
  <li><strong>Device Information:</strong> Device type, operating system, unique device identifiers, and mobile network information.</li>
  <li><strong>Location Data:</strong> With your explicit permission, we may collect location data for live race tracking features. You can disable this at any time through your device settings.</li>
  <li><strong>Log Data:</strong> IP address, browser type, and activity timestamps.</li>
  <li><strong>Cookies &amp; Similar Technologies:</strong> We use cookies and local storage to maintain your session and remember your preferences.</li>
</ul>

<h4>2.3 Information from Third Parties</h4>
<ul>
  <li><strong>Club Administrators:</strong> Your club may provide us with your member details when setting up your account.</li>
  <li><strong>Payment Processors:</strong> We receive transaction confirmations from Stripe.</li>
  <li><strong>Social Integrations:</strong> If you connect YouTube, Google, Facebook, or Instagram accounts, we receive basic profile information as permitted by those platforms.</li>
</ul>

<h3>3. How We Use Your Information</h3>
<p>We use the information we collect to:</p>
<ul>
  <li>Create and manage your account and club membership</li>
  <li>Process membership registrations, renewals, and payments</li>
  <li>Calculate and display race results, handicaps, and performance statistics</li>
  <li>Enable community features including posts, groups, connections, and direct messaging</li>
  <li>Facilitate live race tracking and event management</li>
  <li>Send transactional communications (membership confirmations, payment receipts, event updates)</li>
  <li>Send marketing communications where you have consented</li>
  <li>Enable club administrators to manage memberships and events</li>
  <li>Display public race results and club information on event websites</li>
  <li>Provide live streaming and video content features</li>
  <li>Power the AlfiePRO AI assistant with relevant sailing knowledge</li>
  <li>Improve our platform and develop new features</li>
  <li>Comply with legal obligations and enforce our Terms of Service</li>
  <li>Detect, prevent, and address fraud, abuse, and security issues</li>
</ul>

<h3>4. Community Features &amp; User-Generated Content</h3>
<p>alfiePRO includes community features that allow members to interact with each other. Please be aware of the following:</p>
<ul>
  <li><strong>Social Posts &amp; Groups:</strong> Content you post to community feeds, groups, or public areas of the platform may be visible to other members of your club or the broader alfiePRO community depending on your privacy settings.</li>
  <li><strong>Direct Messages:</strong> Private messages are only visible to the sender and recipients. We do not read your private messages except where required for safety or legal compliance.</li>
  <li><strong>Connections:</strong> Your connections list and profile information may be visible to other members based on your settings.</li>
  <li><strong>User Responsibility:</strong> You are responsible for the content you post. Do not share content that is unlawful, abusive, harassing, defamatory, or violates the rights of others.</li>
  <li><strong>Content Moderation:</strong> Club administrators and platform moderators may review and remove content that violates our Community Guidelines.</li>
  <li><strong>Reporting:</strong> Members can report inappropriate posts or content. Reports are reviewed by our moderation team.</li>
</ul>

<h3>5. Information Sharing and Disclosure</h3>
<p>We do not sell your personal information. We may share your information in the following circumstances:</p>
<ul>
  <li><strong>Your Yacht Club:</strong> Club administrators can access your membership profile, race history, and contact details relevant to club management.</li>
  <li><strong>State &amp; National Associations:</strong> Where your club is affiliated with a sailing association, aggregated membership data and remittance information may be shared with that association.</li>
  <li><strong>Public Race Results:</strong> Race results and handicaps may be displayed publicly on club and event websites. You may contact your club administrator to discuss result visibility.</li>
  <li><strong>Service Providers:</strong> We work with trusted third-party providers including Stripe (payments), Supabase (database and hosting), Cloudflare (infrastructure and streaming), and email delivery services. These providers are contractually obligated to protect your data.</li>
  <li><strong>Legal Requirements:</strong> We may disclose information when required by law, court order, or to protect the rights, property, or safety of alfiePRO, our users, or the public.</li>
  <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your data may be transferred as part of that transaction, with prior notice provided to you.</li>
</ul>

<h3>6. Data Retention</h3>
<p>We retain your personal information for as long as your account is active or as needed to provide you with our services. If you close your account, we will retain certain information as required by law or for legitimate business purposes, such as resolving disputes or enforcing agreements. Race results and historical data may be retained in anonymised form for statistical purposes.</p>

<h3>7. Data Security</h3>
<p>We implement industry-standard security measures to protect your personal data, including:</p>
<ul>
  <li>Encryption of data in transit (TLS/HTTPS) and at rest</li>
  <li>Row-level security controls on our database</li>
  <li>Access controls and role-based authentication</li>
  <li>Regular security assessments</li>
  <li>Secure, hosted infrastructure through Supabase and Cloudflare</li>
</ul>
<p>While we take reasonable precautions, no method of transmission over the internet is 100% secure. We cannot guarantee absolute security of your data.</p>

<h3>8. Your Rights and Choices</h3>
<p>Depending on your location, you may have the following rights:</p>
<ul>
  <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
  <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data.</li>
  <li><strong>Deletion:</strong> Request deletion of your personal data, subject to certain legal obligations.</li>
  <li><strong>Portability:</strong> Request an export of your data in a machine-readable format.</li>
  <li><strong>Objection:</strong> Object to certain types of processing, including direct marketing.</li>
  <li><strong>Withdraw Consent:</strong> Where processing is based on consent, you may withdraw it at any time.</li>
  <li><strong>Notification Preferences:</strong> Manage your communication preferences within the app under Settings.</li>
</ul>
<p>To exercise any of these rights, please contact us at <a href="mailto:privacy@alfiepro.com">privacy@alfiepro.com</a>. We will respond within 30 days.</p>

<h3>9. Cookies and Tracking Technologies</h3>
<p>We use cookies and similar technologies to:</p>
<ul>
  <li>Keep you signed in to your account</li>
  <li>Remember your preferences and settings</li>
  <li>Understand how you use our platform</li>
  <li>Measure the effectiveness of features and communications</li>
  <li>Improve our services</li>
</ul>
<p>You can control cookie settings through your browser. Disabling cookies may affect the functionality of the Service.</p>

<h3>10. Location Data</h3>
<p>The alfiePRO app may request access to your device location for live race tracking features. Location data is only collected when the live tracking feature is active and with your explicit permission. You can revoke location access at any time through your device settings. We do not use location data for advertising purposes.</p>

<h3>11. Push Notifications</h3>
<p>We may send push notifications to your device for membership updates, race results, event reminders, and community activity. You can manage notification preferences within the app or through your device settings at any time.</p>

<h3>12. Camera, Photos, and Microphone Access</h3>
<p>alfiePRO may request access to your device camera, photo library, and microphone for the following purposes:</p>
<ul>
  <li><strong>Camera:</strong> To capture and upload profile photos, boat images, community posts, and livestream video.</li>
  <li><strong>Photo Library:</strong> To select and upload images to your profile, boat garage, community posts, or event pages.</li>
  <li><strong>Microphone:</strong> For livestreaming features where audio capture is required.</li>
</ul>
<p>We only access these device features when you actively use them. You can revoke these permissions at any time through your device settings.</p>

<h3>13. Children's Privacy</h3>
<p>Our platform may be used by junior sailors under the age of 18 as part of a club membership. For members under 18, parental or guardian consent is required and must be provided through the club membership application process. We do not knowingly collect personal information from children under 13 without verifiable parental consent. If you believe we have inadvertently collected information from a child under 13 without proper consent, please contact us immediately at <a href="mailto:privacy@alfiepro.com">privacy@alfiepro.com</a> and we will take immediate steps to delete that information.</p>

<h3>14. Third-Party Links and Integrations</h3>
<p>Our platform may contain links to third-party websites or integrate with third-party services (e.g., YouTube, Google Maps, Stripe, Facebook). We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before providing any personal information to them.</p>

<h3>15. International Data Transfers</h3>
<p>Your information may be transferred to and processed in countries other than your country of residence. We ensure appropriate safeguards are in place for such transfers in accordance with applicable data protection laws.</p>

<h3>16. Australian Privacy Law Compliance</h3>
<p>For users in Australia, we comply with the Australian Privacy Act 1988 and the Australian Privacy Principles (APPs). You have the right to make a complaint to the Office of the Australian Information Commissioner (OAIC) if you believe we have breached your privacy rights.</p>

<h3>17. GDPR — European Users</h3>
<p>If you are located in the European Economic Area (EEA), our legal basis for processing your personal information includes: (a) performance of a contract with you; (b) your consent; (c) our legitimate interests; and (d) compliance with legal obligations. You have the right to lodge a complaint with your local data protection authority.</p>

<h3>18. California Privacy Rights (CCPA)</h3>
<p>California residents have specific rights regarding their personal information under the California Consumer Privacy Act. These include the right to know, the right to delete, and the right to opt-out of the sale of personal information. We do not sell personal information. To exercise your rights, contact us at <a href="mailto:privacy@alfiepro.com">privacy@alfiepro.com</a>.</p>

<h3>19. Changes to This Policy</h3>
<p>We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice within the app or by sending you an email. The "Last Updated" date at the top of this page indicates when this policy was last revised. Your continued use of the Service after changes are posted constitutes acceptance of the updated policy.</p>

<h3>20. Contact Us</h3>
<p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:</p>
<ul>
  <li><strong>Email:</strong> <a href="mailto:privacy@alfiepro.com">privacy@alfiepro.com</a></li>
  <li><strong>Website:</strong> <a href="https://alfiepro.com">alfiepro.com</a></li>
</ul>
<p>We are committed to resolving any complaints about our collection or use of your personal information promptly and fairly.</p>
$html$,
  last_updated = now()
WHERE page_type = 'privacy_policy';
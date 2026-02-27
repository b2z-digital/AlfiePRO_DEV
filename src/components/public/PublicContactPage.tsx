import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Send, CheckCircle, User } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { GoogleAnalytics } from '../GoogleAnalytics';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';

const getClubInitials = (clubName: string): string => {
  return clubName.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 3);
};

interface CommitteeMember {
  position_name: string;
  member_name: string | null;
  email: string | null;
  phone: string | null;
}

export const PublicContactPage: React.FC = () => {
  const { clubId: paramClubId } = useParams<{ clubId: string }>();
  const { clubId: contextClubId } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [club, setClub] = useState<Club | null>(null);
  const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([]);
  const [secretaryEmail, setSecretaryEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId]);

  const loadData = async () => {
    try {
      setLoading(true);

      const [clubResult, committeeResult] = await Promise.all([
        supabase.from('clubs').select('*').eq('id', clubId).maybeSingle(),
        supabase
          .from('committee_position_definitions')
          .select(`
            position_name,
            show_on_website,
            committee_positions (
              name,
              email,
              phone,
              members (first_name, last_name, email)
            )
          `)
          .eq('club_id', clubId)
          .eq('show_on_website', true)
          .order('display_order')
      ]);

      if (clubResult.data) setClub(clubResult.data as any);

      if (committeeResult.data) {
        const members: CommitteeMember[] = [];
        let foundSecretaryEmail: string | null = null;

        for (const posDef of committeeResult.data) {
          const assignments: any[] = Array.isArray(posDef.committee_positions)
            ? posDef.committee_positions
            : posDef.committee_positions
              ? [posDef.committee_positions]
              : [];

          for (const assignment of assignments) {
            const memberEmail = assignment.members?.email || assignment.email || null;
            const memberName = assignment.members
              ? `${assignment.members.first_name} ${assignment.members.last_name}`
              : assignment.name || null;

            members.push({
              position_name: posDef.position_name,
              member_name: memberName,
              email: memberEmail,
              phone: assignment.phone || null,
            });

            if (/secretary/i.test(posDef.position_name) && memberEmail && !foundSecretaryEmail) {
              foundSecretaryEmail = memberEmail;
            }
          }
        }

        setCommitteeMembers(members);
        setSecretaryEmail(foundSecretaryEmail);
      }
    } catch (err) {
      console.error('Error loading contact page data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const recipient = secretaryEmail || (club as any)?.contact_email || (club as any)?.email;

      if (!recipient) {
        setError('No contact email configured for this club. Please try again later.');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/send-contact-form`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          recipient_email: recipient,
          recipient_name: club?.name || 'Club Secretary',
          sender_name: formData.name,
          sender_email: formData.email,
          subject: formData.subject,
          message: formData.message,
          phone: formData.phone || undefined,
          club_name: club?.name,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to send message');
      }

      setSubmitted(true);
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err: any) {
      setError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen bg-white">
      <GoogleAnalytics measurementId={club?.google_analytics_id} />
      <PublicHeader club={club} activePage="contact" />

      <div className="pt-20">
        <div className="relative h-64 bg-gradient-to-br from-blue-900 to-blue-700">
          <div className="absolute inset-0 bg-black/30"></div>
          <div className="relative h-full flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-wider">CONTACT US</h1>
              <p className="text-gray-200 text-lg">Get in touch with our club</p>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">

            {/* Left: Get In Touch + Committee contacts */}
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4 tracking-wider uppercase">Get In Touch</h2>
              <p className="text-gray-600 mb-8">
                Have a question or want to learn more about joining our club? We'd love to hear from you. Fill out the form and we'll get back to you as soon as possible.
              </p>

              {committeeMembers.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4">Committee Contacts</h3>
                  <div className="space-y-4">
                    {committeeMembers.map((member, index) => (
                      <div key={index} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-10 h-10 rounded-full bg-blue-900 flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-0.5">
                            {member.position_name}
                          </p>
                          {member.member_name && (
                            <p className="font-semibold text-gray-900 text-sm">{member.member_name}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Send us a message form */}
            <div>
              <div className="bg-gray-50 rounded-sm p-8 shadow-md">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 tracking-wider uppercase">Send Us A Message</h2>

                {submitted ? (
                  <div className="text-center py-8">
                    <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                    <p className="text-gray-600">Thank you for contacting us. We'll get back to you soon.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                      <input type="text" id="name" name="name" required value={formData.name} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email *</label>
                      <input type="email" id="email" name="email" required value={formData.email} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                      <input type="tel" id="phone" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent" />
                    </div>

                    <div>
                      <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-2">Subject *</label>
                      <select id="subject" name="subject" required value={formData.subject} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent">
                        <option value="">Select a subject</option>
                        <option value="membership">Membership Inquiry</option>
                        <option value="events">Events &amp; Racing</option>
                        <option value="general">General Question</option>
                        <option value="technical">Technical Support</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">Message *</label>
                      <textarea id="message" name="message" required rows={6} value={formData.message} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none" />
                    </div>

                    {error && (
                      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
                    )}

                    <button type="submit" disabled={submitting} className="w-full flex items-center justify-center px-6 py-3 bg-gray-900 text-white font-semibold rounded hover:bg-gray-800 transition-colors uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed">
                      {submitting ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-5 w-5 mr-2" />
                          Send Message
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>

        <PublicFooter club={club} clubId={clubId} />
      </div>
    </div>
  );
};

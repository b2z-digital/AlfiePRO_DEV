import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Mail, Phone, Send, CheckCircle } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { GoogleAnalytics } from '../GoogleAnalytics';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';

const getClubInitials = (clubName: string): string => {
  return clubName.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 3);
};

export const PublicContactPage: React.FC = () => {
  const { clubId: paramClubId } = useParams<{ clubId: string }>();
  const { clubId: contextClubId } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [club, setClub] = useState<Club | null>(null);
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
      loadClubData();
    }
  }, [clubId]);

  const loadClubData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .maybeSingle();

      if (error) throw error;
      if (data) setClub(data as any);
    } catch (error) {
      console.error('Error loading club:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      setSubmitted(true);
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: ''
      });
      setTimeout(() => setSubmitted(false), 5000);
    } catch (err) {
      setError('Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const clubInitials = club?.name ? getClubInitials(club.name) : '';
  const clubName = club?.name || 'Loading...';

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
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 tracking-wider uppercase">Get In Touch</h2>
            <p className="text-gray-600 mb-8">Have a question or want to learn more about joining our club? We'd love to hear from you. Fill out the form and we'll get back to you as soon as possible.</p>

            <div className="space-y-6">
              {club?.committeePositions && club.committeePositions.length > 0 && club.committeePositions[0]?.email && (
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-gray-900 rounded flex items-center justify-center">
                      <Mail className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-1">Email</h3>
                    <a href={`mailto:${club.committeePositions[0].email}`} className="text-gray-600 hover:text-gray-900">{club.committeePositions[0].email}</a>
                  </div>
                </div>
              )}

              {club?.committeePositions && club.committeePositions.length > 0 && club.committeePositions[0]?.phone && (
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-gray-900 rounded flex items-center justify-center">
                      <Phone className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-4">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-1">Phone</h3>
                    <a href={`tel:${club.committeePositions[0].phone}`} className="text-gray-600 hover:text-gray-900">{club.committeePositions[0].phone}</a>
                  </div>
                </div>
              )}
            </div>

            {club?.committeePositions && club.committeePositions.length > 0 && (
              <div className="mt-12">
                <h3 className="text-xl font-bold text-gray-900 mb-6 tracking-wider uppercase">Committee Members</h3>
                <div className="space-y-4">
                  {club.committeePositions.slice(0, 3).map((position: any, index: number) => (
                    <div key={index} className="border-l-4 border-gray-900 pl-4">
                      <p className="font-semibold text-gray-900">{position.title}</p>
                      <p className="text-gray-600">{position.name}</p>
                      {position.email && (
                        <a href={`mailto:${position.email}`} className="text-sm text-gray-600 hover:text-gray-900">{position.email}</a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

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
                      <option value="events">Events & Racing</option>
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

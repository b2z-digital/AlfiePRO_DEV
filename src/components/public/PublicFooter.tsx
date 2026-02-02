import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Club } from '../../types/club';
import { supabase } from '../../utils/supabase';

interface PublicFooterProps {
  club?: Club | null;
  clubId?: string | null;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({ club: propClub, clubId }) => {
  const [defaultVenueAddress, setDefaultVenueAddress] = useState<string>('');
  const [club, setClub] = useState<Club | null>(propClub || null);

  useEffect(() => {
    if (clubId && !propClub) {
      loadClub();
    }
  }, [clubId, propClub]);

  useEffect(() => {
    if (club?.id) {
      loadDefaultVenue();
    }
  }, [club?.id]);

  const loadClub = async () => {
    if (!clubId) return;
    try {
      const { data } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .maybeSingle();

      if (data) {
        setClub(data as Club);
      }
    } catch (error) {
      console.error('Error loading club:', error);
    }
  };

  const loadDefaultVenue = async () => {
    try {
      const { data } = await supabase
        .from('venues')
        .select('address, city, state, postcode')
        .eq('club_id', club?.id)
        .eq('isDefault', true)
        .maybeSingle();

      if (data) {
        setDefaultVenueAddress(`${data.address}, ${data.city}, ${data.state} ${data.postcode}`);
      }
    } catch (error) {
      console.error('Error loading default venue:', error);
    }
  };

  if (!club) return null;

  return (
    <footer className="bg-gray-900 text-white py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="text-lg font-bold mb-4">{club.name}</h3>
            <p className="text-gray-400 text-sm mb-4 line-clamp-3">
              {(club as any).club_introduction || (club as any).description || `Welcome to ${club.name}`}
            </p>
            <Link
              to="/login"
              className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors text-sm"
            >
              Become a Member
            </Link>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-gray-400 text-sm">
              <li><a href="#" className="hover:text-white transition-colors">Membership</a></li>
              <li><a href="#" className="hover:text-white transition-colors">Racing</a></li>
              <li><a href="#news" className="hover:text-white transition-colors">News</a></li>
              <li><a href="#contact" className="hover:text-white transition-colors">Contact</a></li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-bold mb-4">Contact</h3>
            <ul className="space-y-2 text-gray-400 text-sm">
              {defaultVenueAddress && (
                <li className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{defaultVenueAddress}</span>
                </li>
              )}
              {(club as any).contact_email && (
                <li>
                  <a href={`mailto:${(club as any).contact_email}`} className="hover:text-white transition-colors">
                    {(club as any).contact_email}
                  </a>
                </li>
              )}
              {(club as any).contact_phone && (
                <li>
                  <a href={`tel:${(club as any).contact_phone}`} className="hover:text-white transition-colors">
                    {(club as any).contact_phone}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-gray-800">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-gray-400 text-xs">
            <p>
              © {new Date().getFullYear()} {club.name}. All rights reserved. Powered by Alfie
            </p>
            <div className="flex gap-4">
              <Link
                to={`/club/${club.id}/public/privacy`}
                className="hover:text-white transition-colors"
              >
                Privacy Policy
              </Link>
              <Link
                to={`/club/${club.id}/public/terms`}
                className="hover:text-white transition-colors"
              >
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

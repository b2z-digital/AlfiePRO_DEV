import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Calendar, Eye, Heart, MessageCircle, DollarSign, Edit, Trash2, Check, ChevronLeft, ChevronRight, ZoomIn, Share2, Mail, Users, ChevronDown, Phone, ExternalLink } from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import type { Classified, ClassifiedInquiry } from '../../types/classified';
import { deleteClassified, markClassifiedAsSold, toggleClassifiedFavorite, getClassifiedInquiries, createClassifiedInquiry, isClassifiedFavorited } from '../../utils/classifiedStorage';
import { supabase } from '../../utils/supabase';
import ClassifiedFormModal from './ClassifiedFormModal';

interface Props {
  classified: Classified;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ClassifiedDetailModal({ classified, onClose, onUpdate }: Props) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showInquiryForm, setShowInquiryForm] = useState(false);
  const [inquiryType, setInquiryType] = useState<'question' | 'offer' | 'interest'>('question');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [offerAmount, setOfferAmount] = useState('');
  const [inquiries, setInquiries] = useState<ClassifiedInquiry[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showEnquiries, setShowEnquiries] = useState(false);
  const viewCountedRef = useRef(false);

  const isOwner = user?.id === classified.user_id || user?.id === classified.created_by_user_id;

  useEffect(() => {
    if (isOwner) {
      loadInquiries();
    }
    checkIfFavorited();

    // Only increment view count once per modal mount
    if (!viewCountedRef.current) {
      viewCountedRef.current = true;
      incrementViewCount();
    }
  }, []);

  const incrementViewCount = async () => {
    try {
      // Call database function to increment view count
      const { data, error } = await supabase
        .rpc('increment_classified_view_count', {
          classified_id: classified.id
        });

      if (error) {
        console.error('Error incrementing view count:', error);
      } else if (data !== null) {
        // Update local state with new view count
        classified.views_count = data;
      }
    } catch (error) {
      console.error('Error incrementing view count:', error);
    }
  };

  const loadInquiries = async () => {
    try {
      const data = await getClassifiedInquiries(classified.id);
      setInquiries(data);
    } catch (error) {
      console.error('Error loading inquiries:', error);
    }
  };

  const checkIfFavorited = async () => {
    if (user) {
      const favorited = await isClassifiedFavorited(classified.id, user.id);
      setIsFavorited(favorited);
    }
  };

  const handleToggleFavorite = async () => {
    if (!user) return;
    try {
      const result = await toggleClassifiedFavorite(classified.id, user.id);
      setIsFavorited(result);
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const handleSendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await createClassifiedInquiry(
        classified.id,
        user.id,
        inquiryMessage,
        inquiryType,
        offerAmount ? parseFloat(offerAmount) : undefined
      );

      setShowInquiryForm(false);
      setInquiryMessage('');
      setOfferAmount('');
      addNotification('success', 'Your inquiry has been sent to the seller!');
    } catch (error) {
      console.error('Error sending inquiry:', error);
      addNotification('error', 'Failed to send inquiry. Please try again.');
    }
  };

  const handleMarkAsSold = async () => {
    if (!confirm('Mark this listing as sold?')) return;

    try {
      await markClassifiedAsSold(classified.id);
      addNotification('success', 'Listing marked as sold!');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error marking as sold:', error);
      addNotification('error', 'Failed to mark as sold. Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this listing?')) return;

    try {
      await deleteClassified(classified.id);
      addNotification('success', 'Listing deleted successfully!');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error deleting listing:', error);
      addNotification('error', 'Failed to delete listing. Please try again.');
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % (classified.images?.length || 1));
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + (classified.images?.length || 1)) % (classified.images?.length || 1));
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden border border-slate-700">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Listing Details</h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="overflow-y-auto max-h-[calc(90vh-88px)]">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-6">
              {/* Left Column - Details (2/5 width) */}
              <div className="lg:col-span-2 space-y-4">
                <div>
                  <h1 className="text-3xl font-bold text-white mb-2">{classified.title}</h1>
                  <div className="text-4xl font-bold text-blue-400 mb-4">
                    {formatPrice(classified.price)}
                  </div>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-300 text-sm font-medium rounded-full capitalize">
                      {classified.category}
                    </span>
                    <span className="px-3 py-1 bg-green-500/20 text-green-300 text-sm font-medium rounded-full capitalize">
                      {classified.condition}
                    </span>
                    {classified.is_public && (
                      <span className="px-3 py-1 bg-teal-500/20 text-teal-300 text-sm font-medium rounded-full">
                        Public Listing
                      </span>
                    )}
                    {classified.is_external && (
                      <span className="px-3 py-1 bg-amber-500/20 text-amber-300 text-sm font-medium rounded-full flex items-center gap-1">
                        <ExternalLink size={14} />
                        External Listing
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 text-blue-100 mb-6">
                    <div className="flex items-center gap-2">
                      <MapPin size={18} className="text-blue-400" />
                      <span>{classified.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar size={18} className="text-blue-400" />
                      <span>Listed on {formatDate(classified.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Eye size={18} className="text-blue-400" />
                      <span>{classified.views_count || 0} views</span>
                    </div>
                  </div>

                  <div className="bg-slate-800/50 rounded-xl p-4 mb-4">
                    <h3 className="text-lg font-semibold text-white mb-2">Description</h3>
                    <p className="text-blue-100 whitespace-pre-wrap">{classified.description}</p>
                  </div>
                </div>

                {classified.is_external ? (
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-lg font-semibold text-white">Seller Information</h3>
                      <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 text-xs font-medium rounded-full flex items-center gap-1">
                        <ExternalLink size={12} />
                        External
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300 font-bold text-lg">
                        {classified.external_contact_name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {classified.external_contact_name}
                        </div>
                        <div className="text-xs text-slate-400">Non-member seller</div>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      {classified.external_contact_email && (
                        <a
                          href={`mailto:${classified.external_contact_email}`}
                          className="flex items-center gap-2 text-blue-300 hover:text-blue-200 transition-colors"
                        >
                          <Mail size={16} />
                          {classified.external_contact_email}
                        </a>
                      )}
                      {classified.external_contact_phone && (
                        <a
                          href={`tel:${classified.external_contact_phone}`}
                          className="flex items-center gap-2 text-blue-300 hover:text-blue-200 transition-colors"
                        >
                          <Phone size={16} />
                          {classified.external_contact_phone}
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-800/50 rounded-xl p-4">
                    <h3 className="text-lg font-semibold text-white mb-3">Seller Information</h3>
                    <div className="flex items-center gap-3 mb-3">
                      {classified.user?.avatar_url ? (
                        <img
                          src={classified.user.avatar_url}
                          alt={`${classified.user.first_name} ${classified.user.last_name}`}
                          className="w-12 h-12 rounded-full object-cover bg-slate-700"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg"
                        style={{ display: classified.user?.avatar_url ? 'none' : 'flex' }}
                      >
                        {classified.user?.first_name?.[0]}{classified.user?.last_name?.[0]}
                      </div>
                      <div>
                        <div className="font-semibold text-white">
                          {classified.user?.first_name} {classified.user?.last_name}
                        </div>
                        {classified.club && (
                          <div className="text-sm text-blue-300">{classified.club.name}</div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-blue-100">
                      <div>Email: {classified.contact_email}</div>
                      {classified.contact_phone && (
                        <div>Phone: {classified.contact_phone}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-3">
                  {!isOwner && !classified.is_external && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setInquiryType('question');
                            setShowInquiryForm(true);
                          }}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <MessageCircle size={16} />
                          Ask Question
                        </button>
                        <button
                          onClick={() => {
                            setInquiryType('offer');
                            setShowInquiryForm(true);
                          }}
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <DollarSign size={16} />
                          Make Offer
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleToggleFavorite}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Heart size={16} className={isFavorited ? 'fill-red-500 text-red-500' : ''} />
                          {isFavorited ? 'Unfavorite' : 'Favorite'}
                        </button>
                        <button
                          onClick={() => setShowShareModal(true)}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Share2 size={16} />
                          Share
                        </button>
                      </div>
                    </>
                  )}

                  {!isOwner && classified.is_external && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        {classified.external_contact_email && (
                          <a
                            href={`mailto:${classified.external_contact_email}?subject=Enquiry: ${encodeURIComponent(classified.title)}`}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <Mail size={16} />
                            Email Seller
                          </a>
                        )}
                        {classified.external_contact_phone && (
                          <a
                            href={`tel:${classified.external_contact_phone}`}
                            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                          >
                            <Phone size={16} />
                            Call Seller
                          </a>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleToggleFavorite}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Heart size={16} className={isFavorited ? 'fill-red-500 text-red-500' : ''} />
                          {isFavorited ? 'Unfavorite' : 'Favorite'}
                        </button>
                        <button
                          onClick={() => setShowShareModal(true)}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Share2 size={16} />
                          Share
                        </button>
                      </div>
                    </>
                  )}

                  {isOwner && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setShowEditModal(true)}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Edit size={16} />
                          Edit
                        </button>
                        <button
                          onClick={handleMarkAsSold}
                          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Check size={16} />
                          Mark Sold
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={handleDelete}
                          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                        <button
                          onClick={() => setShowShareModal(true)}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                        >
                          <Share2 size={16} />
                          Share
                        </button>
                      </div>

                      {inquiries.length > 0 && (
                        <div className="mt-4">
                          <button
                            onClick={() => setShowEnquiries(!showEnquiries)}
                            className="w-full flex items-center justify-between px-4 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-white transition-colors"
                          >
                            <span className="flex items-center gap-2">
                              <MessageCircle size={18} className="text-blue-400" />
                              <span className="font-medium">Enquiries ({inquiries.length})</span>
                            </span>
                            <span className={`transform transition-transform ${showEnquiries ? 'rotate-180' : ''}`}>
                              ▼
                            </span>
                          </button>

                          {showEnquiries && (
                            <div className="mt-2 bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                            <div className="max-h-96 overflow-y-auto custom-scrollbar">
                              {inquiries.map((inquiry, idx) => (
                                <div
                                  key={inquiry.id}
                                  className={`p-4 hover:bg-slate-700/30 transition-colors ${
                                    idx !== inquiries.length - 1 ? 'border-b border-slate-700' : ''
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    {inquiry.sender?.avatar_url ? (
                                      <img
                                        src={inquiry.sender.avatar_url}
                                        alt=""
                                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium flex-shrink-0">
                                        {inquiry.sender?.first_name?.[0]}
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="text-white font-medium">
                                          {inquiry.sender?.first_name} {inquiry.sender?.last_name}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                                          inquiry.inquiry_type === 'offer'
                                            ? 'bg-green-500/20 text-green-300'
                                            : inquiry.inquiry_type === 'question'
                                            ? 'bg-blue-500/20 text-blue-300'
                                            : 'bg-slate-500/20 text-slate-300'
                                        }`}>
                                          {inquiry.inquiry_type}
                                        </span>
                                      </div>
                                      {inquiry.offer_amount && (
                                        <div className="mb-2 text-lg font-bold text-green-400">
                                          Offer: {formatPrice(inquiry.offer_amount)}
                                        </div>
                                      )}
                                      <p className="text-slate-300 text-sm leading-relaxed break-words">
                                        {inquiry.message}
                                      </p>
                                      <div className="text-xs text-slate-400 mt-2">
                                        {formatDate(inquiry.created_at)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Right Column - Images (3/5 width) */}
              <div className="lg:col-span-3">
                {classified.images && classified.images.length > 0 ? (
                  <div className="relative">
                    <div className="aspect-[4/3] rounded-xl overflow-hidden bg-slate-800 cursor-pointer group" onClick={() => {
                      setLightboxIndex(currentImageIndex);
                      setLightboxOpen(true);
                    }}>
                      <img
                        src={classified.images[currentImageIndex]}
                        alt={classified.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-3">
                          <ZoomIn size={32} className="text-slate-800" />
                        </div>
                      </div>
                    </div>

                    {classified.images.length > 1 && (
                      <>
                        <button
                          onClick={prevImage}
                          className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          onClick={nextImage}
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors"
                        >
                          <ChevronRight size={20} />
                        </button>
                        <div className="absolute bottom-2 right-2 px-3 py-1 bg-black/50 text-white text-sm rounded-full">
                          {currentImageIndex + 1} / {classified.images.length}
                        </div>
                      </>
                    )}

                    {/* Thumbnail Grid */}
                    {classified.images.length > 1 && (
                      <div className="grid grid-cols-5 gap-2 mt-3">
                        {classified.images.map((img, idx) => (
                          <button
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              setLightboxIndex(idx);
                              setLightboxOpen(true);
                            }}
                            className={`aspect-square rounded-lg overflow-hidden border-2 transition-all hover:border-blue-400 ${
                              idx === currentImageIndex ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-slate-600'
                            }`}
                          >
                            <img src={img} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="aspect-[4/3] rounded-xl bg-slate-800 flex items-center justify-center">
                    <span className="text-slate-500 text-xl">No images</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inquiry Form Modal */}
      {showInquiryForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white">
                {inquiryType === 'offer' ? 'Make an Offer' : 'Ask a Question'}
              </h3>
              <button
                onClick={() => setShowInquiryForm(false)}
                className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSendInquiry} className="space-y-4">
              {inquiryType === 'offer' && (
                <div>
                  <label className="block text-sm font-medium text-blue-200 mb-2">
                    Offer Amount
                  </label>
                  <input
                    type="number"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-blue-200 mb-2">
                  Message
                </label>
                <textarea
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  placeholder="Write your message here..."
                  rows={4}
                  required
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowInquiryForm(false)}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <ClassifiedFormModal
          classified={classified}
          onClose={() => setShowEditModal(false)}
          onSave={() => {
            setShowEditModal(false);
            onUpdate();
            onClose();
          }}
        />
      )}

      {/* Lightbox Gallery */}
      {classified.images && classified.images.length > 0 && lightboxOpen && (
        <Lightbox
          key={`lightbox-${lightboxIndex}`}
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          slides={classified.images.map(img => ({ src: img }))}
          index={lightboxIndex}
          on={{
            view: ({ index }) => setLightboxIndex(index)
          }}
        />
      )}

      {/* Share Modal */}
      {showShareModal && (
        <ClassifiedShareModal
          classified={classified}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </>
  );
}

interface ShareModalProps {
  classified: Classified;
  onClose: () => void;
}

function ClassifiedShareModal({ classified, onClose }: ShareModalProps) {
  const { currentClub } = useAuth();
  const [shareMethod, setShareMethod] = useState<'member' | 'email'>('member');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    const loadMembers = async () => {
      if (!currentClub?.clubId) return;

      try {
        const { data, error } = await supabase
          .from('members')
          .select(`
            id,
            first_name,
            last_name,
            email,
            user_id,
            avatar_url
          `)
          .eq('club_id', currentClub.clubId)
          .order('first_name');

        if (error) throw error;
        setMembers(data || []);
      } catch (error) {
        console.error('Error loading members:', error);
      } finally {
        setLoadingMembers(false);
      }
    };

    loadMembers();
  }, [currentClub?.clubId]);

  const handleShare = async () => {
    if (shareMethod === 'member' && !selectedMemberId) {
      addNotification('error', 'Please select a member');
      return;
    }

    if (shareMethod === 'email' && !recipientEmail) {
      addNotification('error', 'Please enter an email address');
      return;
    }

    try {
      setSending(true);

      const selectedMember = members.find(m => m.id === selectedMemberId);
      const email = shareMethod === 'member' ? selectedMember?.email : recipientEmail;

      // Call edge function to send HTML email
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/share-classified`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classified,
          recipientEmail: email,
          message,
          shareMethod
        })
      });

      if (!response.ok) {
        throw new Error('Failed to share listing');
      }

      addNotification('success', 'Listing shared successfully!');
      onClose();
    } catch (error) {
      console.error('Error sharing listing:', error);
      addNotification('error', 'Failed to share listing. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-800 rounded-2xl max-w-md w-full p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Share2 size={24} />
            Share Listing
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Listing Preview */}
        <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            {classified.images && classified.images.length > 0 && (
              <img
                src={classified.images[0]}
                alt={classified.title}
                className="w-20 h-20 object-cover rounded-lg"
              />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-white font-semibold truncate">{classified.title}</h4>
              <p className="text-green-400 font-bold">
                ${classified.price.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Share Method Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setShareMethod('member')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              shareMethod === 'member'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Users size={18} />
            Share with Member
          </button>
          <button
            onClick={() => setShareMethod('email')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
              shareMethod === 'email'
                ? 'bg-blue-500 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Mail size={18} />
            Send by Email
          </button>
        </div>

        {/* Share Form */}
        <div className="space-y-4">
          {shareMethod === 'member' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Select Member
              </label>
              {loadingMembers ? (
                <div className="text-slate-400 text-sm">Loading members...</div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMemberDropdown(!showMemberDropdown)}
                    className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  >
                    {selectedMemberId ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={members.find(m => m.id === selectedMemberId)?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(members.find(m => m.id === selectedMemberId)?.first_name + ' ' + members.find(m => m.id === selectedMemberId)?.last_name)}&background=3b82f6&color=fff`}
                          alt="Avatar"
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <span>
                          {members.find(m => m.id === selectedMemberId)?.first_name}{' '}
                          {members.find(m => m.id === selectedMemberId)?.last_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">Select a member...</span>
                    )}
                    <ChevronDown size={20} />
                  </button>

                  {showMemberDropdown && (
                    <div className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                      {members.map(member => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            setSelectedMemberId(member.id);
                            setShowMemberDropdown(false);
                          }}
                          className="w-full px-4 py-3 text-left text-white hover:bg-slate-700 flex items-center gap-3 transition-colors"
                        >
                          <img
                            src={member.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.first_name + ' ' + member.last_name)}&background=3b82f6&color=fff`}
                            alt={`${member.first_name} ${member.last_name}`}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                          <span>{member.first_name} {member.last_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {shareMethod === 'email' && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Recipient Email
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="friend@example.com"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Personal Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal note..."
              rows={3}
              className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={sending}
              className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

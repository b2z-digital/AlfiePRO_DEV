import React, { useState, useEffect, useRef } from 'react';
import { X, MapPin, Calendar, Eye, Heart, MessageCircle, DollarSign, SquarePen as Edit, Trash2, Check, ChevronLeft, ChevronRight, Share2, Mail, Users, ChevronDown, Phone, ExternalLink, Tag } from 'lucide-react';
import { AAvatar } from '../alfie/Kit';
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
  const { user, isSuperAdmin, isStateOrgAdmin } = useAuth();
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
  const canManage = isOwner || isSuperAdmin || isStateOrgAdmin;

  useEffect(() => {
    if (canManage) {
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
    if (price === 0 && classified?.is_external) {
      const titleMatch = classified.title?.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
      if (titleMatch) {
        const extracted = parseFloat(titleMatch[1].replace(/,/g, ''));
        if (extracted > 0) {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          }).format(extracted);
        }
      }
      return 'Contact Seller';
    }
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

  const imgs = classified.images || [];
  const seller = classified.is_external
    ? (classified.matched_member
        ? { first: classified.matched_member.first_name, last: classified.matched_member.last_name, url: classified.matched_member.avatar_url, name: `${classified.matched_member.first_name} ${classified.matched_member.last_name}`, sub: classified.matched_member.club_name ? `Member · ${classified.matched_member.club_name}` : 'Member', email: classified.matched_member.email, phone: classified.external_contact_phone }
        : { first: classified.external_contact_name || '?', last: '', url: null, name: classified.external_contact_name || 'Private seller', sub: 'Not a member · from an external listing', email: classified.external_contact_email, phone: classified.external_contact_phone })
    : { first: classified.user?.first_name, last: classified.user?.last_name, url: classified.user?.avatar_url, name: `${classified.user?.first_name || ''} ${classified.user?.last_name || ''}`.trim() || 'Seller', sub: classified.club?.name || 'Member', email: classified.contact_email, phone: classified.contact_phone };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <section className="a-sheet w-full max-w-[1240px] max-h-[90vh] overflow-hidden flex flex-col lg:flex-row" role="dialog" aria-label="Listing details" onClick={(e) => e.stopPropagation()}>
          <div className="relative lg:basis-[52%] flex-shrink-0 a-listing-media" style={{ minHeight: 320 }}>
            {imgs.length > 0 ? (
              <img
                src={imgs[currentImageIndex]}
                alt={classified.title}
                className="absolute inset-0 w-full h-full object-cover cursor-zoom-in"
                onClick={() => { setLightboxIndex(currentImageIndex); setLightboxOpen(true); }}
              />
            ) : (
              <div className="a-bc-ph absolute inset-0 flex flex-col items-center justify-center gap-2">
                <img src="/alfie_app_logo.svg" alt="" style={{ width: 64, height: 64, opacity: 0.4 }} />
                <span className="a-dim text-[13px]">No photos</span>
              </div>
            )}
            {imgs.length > 1 && (
              <>
                <button onClick={prevImage} className="a-gb absolute" style={{ left: 14, top: '50%', transform: 'translateY(-50%)' }} aria-label="Previous photo"><ChevronLeft size={18} /></button>
                <button onClick={nextImage} className="a-gb absolute" style={{ right: 14, top: '50%', transform: 'translateY(-50%)' }} aria-label="Next photo"><ChevronRight size={18} /></button>
                <span className="a-glass absolute" style={{ right: 14, bottom: 102 }}>{currentImageIndex + 1} / {imgs.length}</span>
                <div className="absolute left-0 right-0 bottom-0 flex gap-2 overflow-x-auto" style={{ padding: '12px 14px', background: 'linear-gradient(0deg, rgba(10,15,26,0.95), rgba(10,15,26,0))' }}>
                  {imgs.map((img, idx) => (
                    <button key={idx} onClick={() => setCurrentImageIndex(idx)} className="flex-shrink-0" aria-label={`Photo ${idx + 1}`}>
                      <img src={img} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12, boxShadow: idx === currentImageIndex ? '0 0 0 2px #0A84FF' : 'none', opacity: idx === currentImageIndex ? 1 : 0.6 }} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-y-auto" style={{ padding: '22px 24px' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="a-lb-cls capitalize"><Tag size={11} />{classified.category}</span>
              {classified.condition && <span className="a-lb-fmt capitalize">{classified.condition}</span>}
              {classified.is_public && <span className="a-lb-fmt">Public</span>}
              {classified.is_external && <span className="a-lb-fmt"><ExternalLink size={12} />External listing</span>}
              <div className="flex-1" />
              <button onClick={handleToggleFavorite} className={`a-ib ${isFavorited ? 'a-txt-pink' : ''}`} aria-label={isFavorited ? 'Remove from saved' : 'Save'} title={isFavorited ? 'Saved' : 'Save'}>
                <Heart size={18} className={isFavorited ? 'fill-current' : ''} />
              </button>
              <button onClick={onClose} className="a-ib" aria-label="Close"><X size={18} /></button>
            </div>

            <div>
              <h2 className="a-display a-ink m-0 text-[28px] font-bold leading-[1.15]">{classified.title}</h2>
              <div className="a-display a-num a-txt-b text-[36px] font-semibold mt-2 leading-none">{formatPrice(classified.price)}</div>
            </div>

            <div className="a-dim flex flex-wrap gap-3.5 text-[13px]">
              {classified.location && <span className="inline-flex items-center gap-1.5"><MapPin size={14} />{classified.location}</span>}
              <span className="inline-flex items-center gap-1.5"><Calendar size={14} />Listed {new Date(classified.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span className="inline-flex items-center gap-1.5"><Eye size={14} />{classified.views_count || 0} views</span>
            </div>

            {classified.description && <p className="a-mute m-0 text-[14.5px] leading-[1.6] whitespace-pre-wrap">{classified.description}</p>}

            <div className="a-grp">
              <div className="a-ir">
                <AAvatar url={seller.url} first={seller.first} last={seller.last} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="a-ink text-[14.5px] font-semibold truncate">{seller.name}</div>
                  <div className="a-dim text-[12px] mt-0.5 truncate">{seller.sub}</div>
                </div>
                {classified.is_scraped && classified.source_url && (
                  <a href={classified.source_url} target="_blank" rel="noopener noreferrer" className="a-txt-b inline-flex items-center gap-1 text-[13px]">Original<ExternalLink size={13} /></a>
                )}
              </div>
              {seller.email && (
                <div className="a-ir">
                  <span className="a-ir-l"><Mail size={15} />Email</span>
                  <a href={`mailto:${seller.email}`} className="a-ir-v a-txt-b truncate">{seller.email}</a>
                </div>
              )}
              {seller.phone && (
                <div className="a-ir">
                  <span className="a-ir-l"><Phone size={15} />Phone</span>
                  <a href={`tel:${seller.phone}`} className="a-ir-v">{seller.phone}</a>
                </div>
              )}
            </div>

            {!canManage && !classified.is_external && (
              <div className="flex gap-2.5 flex-wrap">
                <button onClick={() => { setInquiryType('question'); setShowInquiryForm(true); }} className="a-btn a-btn-p flex-1 justify-center" style={{ height: 46 }}>
                  <MessageCircle size={17} />Ask a question
                </button>
                <button onClick={() => { setInquiryType('offer'); setShowInquiryForm(true); }} className="a-btn" style={{ height: 46 }}>
                  <DollarSign size={17} />Make offer
                </button>
                <button onClick={() => setShowShareModal(true)} className="a-btn" style={{ height: 46 }}>
                  <Share2 size={17} />Share
                </button>
              </div>
            )}

            {!canManage && classified.is_external && (
              <div className="flex gap-2.5 flex-wrap">
                {classified.external_contact_email && (
                  <a href={`mailto:${classified.external_contact_email}?subject=Enquiry: ${encodeURIComponent(classified.title)}`} className="a-btn a-btn-p flex-1 justify-center" style={{ height: 46 }}>
                    <Mail size={17} />Contact seller
                  </a>
                )}
                {classified.external_contact_phone && (
                  <a href={`tel:${classified.external_contact_phone}`} className="a-btn" style={{ height: 46 }}>
                    <Phone size={17} />Call
                  </a>
                )}
                <button onClick={() => setShowShareModal(true)} className="a-btn" style={{ height: 46 }}>
                  <Share2 size={17} />Share
                </button>
              </div>
            )}

            {canManage && (
              <>
                {inquiries.length > 0 && (
                  <div className="a-grp">
                    <button onClick={() => setShowEnquiries(!showEnquiries)} className="a-ir w-full text-left">
                      <MessageCircle size={17} className="a-txt-b" />
                      <span className="a-ink flex-1 text-[14px] font-semibold">Enquiries</span>
                      <span className="a-cnt">{inquiries.length}</span>
                      <ChevronDown size={16} className={`a-dim transition-transform ${showEnquiries ? 'rotate-180' : ''}`} />
                    </button>
                    {showEnquiries && inquiries.map((inquiry) => (
                      <div key={inquiry.id} className="a-ir" style={{ alignItems: 'flex-start' }}>
                        <AAvatar url={inquiry.sender?.avatar_url} first={inquiry.sender?.first_name} last={inquiry.sender?.last_name} size={34} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="a-ink flex-1 text-[14px] font-semibold truncate">{inquiry.sender?.first_name} {inquiry.sender?.last_name}</span>
                            <span className="a-lb-fmt capitalize" style={{ height: 22, fontSize: 11 }}>{inquiry.inquiry_type}</span>
                          </div>
                          {inquiry.offer_amount && <div className="a-txt-g text-[15px] font-semibold mt-1">Offer {formatPrice(inquiry.offer_amount)}</div>}
                          <p className="a-mute text-[13.5px] mt-1 break-words">{inquiry.message}</p>
                          <div className="a-dim text-[11.5px] mt-1">{formatDate(inquiry.created_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-3.5 border-t a-bd flex items-center gap-2 flex-wrap">
                  <span className="a-cap flex-1">Your listing</span>
                  <button onClick={() => setShowShareModal(true)} className="a-btn" style={{ height: 36, fontSize: 13 }}><Share2 size={15} />Share</button>
                  <button onClick={handleMarkAsSold} className="a-btn a-btn-g" style={{ height: 36, fontSize: 13 }}><Check size={15} />Mark sold</button>
                  <button onClick={() => setShowEditModal(true)} className="a-btn" style={{ height: 36, fontSize: 13 }}><Edit size={15} />Edit</button>
                  <button onClick={handleDelete} className="a-ib a-ib-d a-ib-box" aria-label="Delete listing" title="Delete listing"><Trash2 size={17} /></button>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* Inquiry Form Modal */}
      {showInquiryForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="a-sheet max-w-md w-full" style={{ padding: 24 }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="a-display a-ink text-[20px] font-semibold m-0">
                {inquiryType === 'offer' ? 'Make an Offer' : 'Ask a Question'}
              </h3>
              <button
                onClick={() => setShowInquiryForm(false)}
                className="a-ib"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSendInquiry} className="space-y-4">
              {inquiryType === 'offer' && (
                <div>
                  <label className="a-flab">
                    Offer Amount
                  </label>
                  <input
                    type="number"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="a-inp w-full"
                  />
                </div>
              )}

              <div>
                <label className="a-flab">
                  Message
                </label>
                <textarea
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  placeholder="Write your message here..."
                  rows={4}
                  required
                  className="a-inp a-ta w-full"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowInquiryForm(false)}
                  className="a-btn flex-1 justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="a-btn a-btn-p flex-1 justify-center"
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
      <div className="a-sheet max-w-md w-full" style={{ padding: 24 }}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="a-display a-ink text-[20px] font-semibold flex items-center gap-2 m-0">
            <Share2 size={24} />
            Share Listing
          </h3>
          <button
            onClick={onClose}
            className="a-ib" aria-label="Close"
          >
            <X size={24} />
          </button>
        </div>

        {/* Listing Preview */}
        <div className="a-grp mb-5" style={{ padding: 12 }}>
          <div className="flex gap-3">
            {classified.images && classified.images.length > 0 && (
              <img
                src={classified.images[0]}
                alt={classified.title}
                className="w-20 h-20 object-cover rounded-lg"
              />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="a-ink font-semibold truncate">{classified.title}</h4>
              <p className="a-txt-b font-semibold">
                ${classified.price.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Share Method Tabs */}
        <div className="a-seg mb-4" style={{ display: 'flex' }}>
          <button
            onClick={() => setShareMethod('member')}
            className={`a-seg-i flex-1 justify-center ${shareMethod === 'member' ? 'a-seg-on' : ''}`}
          >
            <Users size={18} />
            Share with Member
          </button>
          <button
            onClick={() => setShareMethod('email')}
            className={`a-seg-i flex-1 justify-center ${shareMethod === 'email' ? 'a-seg-on' : ''}`}
          >
            <Mail size={18} />
            Send by Email
          </button>
        </div>

        {/* Share Form */}
        <div className="space-y-4">
          {shareMethod === 'member' && (
            <div>
              <label className="a-flab">
                Select Member
              </label>
              {loadingMembers ? (
                <div className="a-dim text-[13px]">Loading members…</div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowMemberDropdown(!showMemberDropdown)}
                    className="a-inp w-full flex items-center justify-between text-left"
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
                      <span className="a-dim">Select a member…</span>
                    )}
                    <ChevronDown size={20} />
                  </button>

                  {showMemberDropdown && (
                    <div className="a-pop absolute z-10 w-full mt-2 max-h-60 overflow-y-auto">
                      {members.map(member => (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() => {
                            setSelectedMemberId(member.id);
                            setShowMemberDropdown(false);
                          }}
                          className="a-pop-item w-full"
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
              <label className="a-flab">
                Recipient Email
              </label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="friend@example.com"
                className="a-inp w-full"
              />
            </div>
          )}

          <div>
            <label className="a-flab">
              Personal Message (Optional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal note..."
              rows={3}
              className="a-inp a-ta w-full"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="a-btn flex-1 justify-center"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={sending}
              className="a-btn a-btn-p flex-1 justify-center disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

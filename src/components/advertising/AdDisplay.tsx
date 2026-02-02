import React, { useEffect, useState, useRef } from 'react';
import { advertisingStorage } from '../../utils/advertisingStorage';
import { AdBanner, PageType, DeviceType } from '../../types/advertising';
import { useAuth } from '../../contexts/AuthContext';

interface AdDisplayProps {
  placementId?: string;
  position?: string;
  pageType: PageType;
  className?: string;
  state?: string;
  clubId?: string;
  instanceId?: string; // Unique ID for this ad slot to track independently
}

// Global storage for recently shown ads per placement/position
const recentlyShownAds = new Map<string, Set<string>>();
const MAX_RECENT_ADS = 5; // Track last 5 shown ads per placement

export const AdDisplay: React.FC<AdDisplayProps> = ({
  placementId: propPlacementId,
  position,
  pageType,
  className = '',
  state,
  clubId,
  instanceId,
}) => {
  const [ad, setAd] = useState<AdBanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedPlacementId, setResolvedPlacementId] = useState<string | null>(null);
  const [availableAds, setAvailableAds] = useState<AdBanner[]>([]);
  const { user, currentClub } = useAuth();
  const impressionTracked = useRef(false);
  const adContainerRef = useRef<HTMLDivElement>(null);

  // Detect device type
  const getDeviceType = (): DeviceType => {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  };

  // Generate session ID for frequency capping
  const getSessionId = (): string => {
    let sessionId = sessionStorage.getItem('ad_session_id');
    if (!sessionId) {
      sessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem('ad_session_id', sessionId);
    }
    return sessionId;
  };

  // Resolve placement ID from position if needed
  useEffect(() => {
    const resolvePlacement = async () => {
      if (propPlacementId) {
        setResolvedPlacementId(propPlacementId);
      } else if (position) {
        // Look up placement by page type and position
        const placement = await advertisingStorage.getPlacementByPosition(pageType, position);
        if (placement) {
          setResolvedPlacementId(placement.id);
        }
      }
    };
    resolvePlacement();
  }, [propPlacementId, position, pageType]);

  useEffect(() => {
    if (resolvedPlacementId) {
      loadAd();
    }
  }, [resolvedPlacementId, pageType, state, clubId]);

  // Get tracking key for this placement
  // Use placement-level tracking, not instance-level, so a single ad won't repeat across multiple slots
  const getTrackingKey = (): string => {
    return `${pageType}-${position || resolvedPlacementId}`;
  };

  // Select ad using SOV (Share of Voice) based on priority
  // Works for all banner types: image, text, HTML5, and AdSense
  // AdSense banners compete equally with other banner types based on campaign priority
  const selectAdWithSOV = (ads: AdBanner[]): AdBanner | null => {
    if (ads.length === 0) return null;

    // If only one ad, check if we've shown it recently
    if (ads.length === 1) {
      const trackingKey = getTrackingKey();
      const recentAds = recentlyShownAds.get(trackingKey);

      // If this single ad was already shown, don't show it again (prevents repetition)
      if (recentAds && recentAds.has(ads[0].id)) {
        return null;
      }

      return ads[0];
    }

    // Get recently shown ads for this placement
    const trackingKey = getTrackingKey();
    const recentAds = recentlyShownAds.get(trackingKey) || new Set();

    // Filter out recently shown ads if we have enough alternatives
    let eligibleAds = ads;
    const notRecentAds = ads.filter(ad => !recentAds.has(ad.id));

    // Only filter if we have at least 2 ads that haven't been shown recently
    if (notRecentAds.length >= 2) {
      eligibleAds = notRecentAds;
    } else if (notRecentAds.length === 1) {
      eligibleAds = notRecentAds;
    }
    // If all ads were shown recently, reset and use all ads

    // Calculate total weight based on priority (higher priority = higher weight)
    // Priority 1 (highest) = 5x weight, Priority 5 (lowest) = 1x weight
    const calculateWeight = (priority: number): number => {
      return 6 - priority; // Priority 1 = 5, Priority 2 = 4, etc.
    };

    const totalWeight = eligibleAds.reduce((sum, ad) => {
      const campaign = ad.campaign;
      const priority = campaign?.priority || 5;
      return sum + calculateWeight(priority);
    }, 0);

    // Random weighted selection
    let random = Math.random() * totalWeight;

    for (const ad of eligibleAds) {
      const campaign = ad.campaign;
      const priority = campaign?.priority || 5;
      const weight = calculateWeight(priority);

      random -= weight;
      if (random <= 0) {
        return ad;
      }
    }

    // Fallback to first ad
    return eligibleAds[0];
  };

  // Track that we showed this ad
  const trackShownAd = (bannerId: string) => {
    const trackingKey = getTrackingKey();

    if (!recentlyShownAds.has(trackingKey)) {
      recentlyShownAds.set(trackingKey, new Set());
    }

    const recentAds = recentlyShownAds.get(trackingKey)!;
    recentAds.add(bannerId);

    // Keep only last MAX_RECENT_ADS
    if (recentAds.size > MAX_RECENT_ADS) {
      const adsArray = Array.from(recentAds);
      recentAds.clear();
      adsArray.slice(-MAX_RECENT_ADS).forEach(id => recentAds.add(id));
    }
  };

  const loadAd = async () => {
    if (!resolvedPlacementId) return;

    try {
      setLoading(true);
      const deviceType = getDeviceType();

      const ads = await advertisingStorage.getAdsForPlacement(resolvedPlacementId, {
        pageType,
        state,
        clubId: clubId || currentClub?.clubId,
        deviceType,
        userId: user?.id,
      });

      setAvailableAds(ads);

      if (ads.length > 0) {
        // Use SOV-based selection
        const selectedAd = selectAdWithSOV(ads);

        if (selectedAd) {
          setAd(selectedAd);
          trackShownAd(selectedAd.id);
        } else {
          setAd(null);
        }
      } else {
        setAd(null);
      }
    } catch (error) {
      console.error('Error loading ad:', error);
      setAd(null);
    } finally {
      setLoading(false);
    }
  };

  // Track impression when ad is visible
  useEffect(() => {
    if (!ad || impressionTracked.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !impressionTracked.current) {
            trackImpression();
            impressionTracked.current = true;
          }
        });
      },
      { threshold: 0.5 } // Ad must be 50% visible
    );

    if (adContainerRef.current) {
      observer.observe(adContainerRef.current);
    }

    return () => {
      if (adContainerRef.current) {
        observer.unobserve(adContainerRef.current);
      }
    };
  }, [ad]);

  const trackImpression = async () => {
    if (!ad || !resolvedPlacementId) return;

    try {
      await advertisingStorage.trackImpression(
        ad.id,
        ad.campaign_id,
        resolvedPlacementId,
        {
          userId: user?.id,
          clubId: clubId || currentClub?.clubId,
          state,
          deviceType: getDeviceType(),
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
          sessionId: getSessionId(),
        }
      );
    } catch (error) {
      console.error('Error tracking impression:', error);
    }
  };

  const handleClick = async () => {
    if (!ad || !resolvedPlacementId) return;

    try {
      await advertisingStorage.trackClick(
        ad.id,
        ad.campaign_id,
        resolvedPlacementId,
        {
          userId: user?.id,
          clubId: clubId || currentClub?.clubId,
          state,
          deviceType: getDeviceType(),
          pageUrl: window.location.href,
        }
      );

      // Open link in new tab if provided
      if (ad.link_url) {
        window.open(ad.link_url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Error tracking click:', error);
    }
  };

  if (loading) {
    return null; // Don't show loading state for ads
  }

  if (!ad) {
    return null; // No ad to display
  }

  const renderAdContent = () => {
    switch (ad.ad_type) {
      case 'image':
        if (!ad.image_url) {
          return null;
        }
        return (
          <img
            src={ad.image_url}
            alt={ad.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
            className="cursor-pointer bg-slate-900"
            onClick={handleClick}
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        );

      case 'html5':
        return (
          <div
            dangerouslySetInnerHTML={{ __html: ad.html_content || '' }}
            className="w-full h-full cursor-pointer"
            onClick={handleClick}
          />
        );

      case 'adsense':
        // Execute AdSense scripts after rendering
        if (ad.adsense_code) {
          setTimeout(() => {
            try {
              // @ts-ignore - AdSense global
              if (window.adsbygoogle && window.adsbygoogle.loaded === true) {
                // @ts-ignore
                (window.adsbygoogle = window.adsbygoogle || []).push({});
              }
            } catch (e) {
              console.error('AdSense initialization error:', e);
            }
          }, 100);
        }
        return (
          <div
            dangerouslySetInnerHTML={{ __html: ad.adsense_code || '' }}
            className="w-full"
          />
        );

      case 'text':
        const textContent = ad.text_content || { headline: '', body: '', cta: '' };
        return (
          <div
            className="w-full h-full bg-gray-100 dark:bg-gray-800 p-4 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={handleClick}
          >
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              {textContent.headline}
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              {textContent.body}
            </p>
            {textContent.cta && (
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                {textContent.cta}
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // AdSense ads are responsive and shouldn't have fixed dimensions
  const isAdSense = ad.ad_type === 'adsense';

  return (
    <div
      ref={adContainerRef}
      className={`ad-container flex flex-col items-center ${className}`}
      style={{
        maxWidth: '100%',
      }}
    >
      <div
        className="overflow-hidden rounded-lg bg-slate-900"
        style={isAdSense ? {
          width: '100%',
          maxWidth: '100%',
        } : {
          width: ad.size_width ? `${ad.size_width}px` : '100%',
          height: ad.size_height ? `${ad.size_height}px` : '250px',
          minHeight: ad.size_height ? `${ad.size_height}px` : '250px',
          maxWidth: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {renderAdContent()}
      </div>
      <div className="text-xs text-gray-400 mt-1 text-center">Advertisement</div>
    </div>
  );
};

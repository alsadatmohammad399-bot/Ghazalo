export interface AdsAttributionData {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  gclid?: string;
  capturedAt: number;
}

const ADS_ATTR_STORAGE_KEY = 'ghazalo_ads_attribution';
const injectedGtagIds = new Set<string>();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function captureAdsAttribution(): AdsAttributionData | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source') || undefined;
    const utmMedium = params.get('utm_medium') || undefined;
    const utmCampaign = params.get('utm_campaign') || undefined;
    const utmTerm = params.get('utm_term') || undefined;
    const gclid = params.get('gclid') || undefined;

    if (utmSource || utmMedium || utmCampaign || utmTerm || gclid) {
      const payload: AdsAttributionData = {
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        gclid,
        capturedAt: Date.now(),
      };
      sessionStorage.setItem(ADS_ATTR_STORAGE_KEY, JSON.stringify(payload));
      return payload;
    }

    const existing = sessionStorage.getItem(ADS_ATTR_STORAGE_KEY);
    return existing ? (JSON.parse(existing) as AdsAttributionData) : null;
  } catch {
    return null;
  }
}

export function getSavedAdsAttribution(): AdsAttributionData | null {
  try {
    const raw = sessionStorage.getItem(ADS_ATTR_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AdsAttributionData) : null;
  } catch {
    return null;
  }
}

export function ensureGoogleAdsLoaded(adsId?: string): void {
  const cleanId = (
    adsId ||
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GOOGLE_ADS_ID : '') ||
    ''
  )
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');

  if (!cleanId || typeof document === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    window.gtag('js', new Date());
  }

  if (!injectedGtagIds.has(cleanId)) {
    injectedGtagIds.add(cleanId);
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cleanId)}`;
    document.head.appendChild(script);
    window.gtag('config', cleanId);
  }
}

export function trackAdsConversion(
  eventName: 'generate_lead' | 'purchase' | 'view_item_list',
  options?: {
    adsId?: string;
    conversionLabel?: string;
    value?: number;
    currency?: string;
    transactionId?: string;
  }
): void {
  try {
    const adsId = (
      options?.adsId ||
      (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_GOOGLE_ADS_ID : '') ||
      ''
    ).trim();

    if (adsId) {
      ensureGoogleAdsLoaded(adsId);
    }

    const attr = getSavedAdsAttribution();
    const payload: Record<string, unknown> = {
      value: options?.value ?? 0,
      currency: options?.currency || 'EGP',
      ...(options?.transactionId ? { transaction_id: options.transactionId } : {}),
      ...(attr?.gclid ? { gclid: attr.gclid } : {}),
      ...(attr?.utmSource ? { utm_source: attr.utmSource } : {}),
      ...(attr?.utmCampaign ? { utm_campaign: attr.utmCampaign } : {}),
    };

    if (window.gtag) {
      window.gtag('event', eventName, payload);
      if (adsId && options?.conversionLabel) {
        const cleanLabel = options.conversionLabel.trim().replace(/[^a-zA-Z0-9_-]/g, '');
        if (cleanLabel) {
          window.gtag('event', 'conversion', {
            send_to: `${adsId}/${cleanLabel}`,
            ...payload,
          });
        }
      }
    } else if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: eventName, ...payload });
    }
  } catch {
    // non-blocking analytics
  }
}

export function sanitizeExternalUrl(raw?: string): string {
  const val = (raw || '').trim();
  if (!val) return '';
  if (/^https?:\/\//i.test(val)) return val;
  if (/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(val)) return `https://${val}`;
  return '';
}

export function parseCoordinatesFromGoogleMapsUrl(
  rawUrl?: string
): { lat: number; lng: number } | null {
  const url = (rawUrl || '').trim();
  if (!url) return null;
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      ) {
        return { lat, lng };
      }
    }
  }
  return null;
}

export function buildGoogleMapsLink(shop: {
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  nameAr?: string;
  city?: string;
  address?: string;
}): string {
  const safeCustom = sanitizeExternalUrl(shop.googleMapsUrl);
  if (safeCustom) return safeCustom;
  if (
    typeof shop.latitude === 'number' &&
    typeof shop.longitude === 'number' &&
    Number.isFinite(shop.latitude) &&
    Number.isFinite(shop.longitude)
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${shop.latitude},${shop.longitude}`;
  }
  const queryParts = [shop.nameAr, shop.city, shop.address]
    .map((p) => (p || '').trim())
    .filter(Boolean);
  if (queryParts.length === 0) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryParts.join(', '))}`;
}

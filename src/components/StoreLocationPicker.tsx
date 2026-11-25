import React, { useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Pin,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  Check,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  RotateCcw,
} from 'lucide-react';
import {
  buildGoogleMapsLink,
  parseCoordinatesFromGoogleMapsUrl,
} from '../utils/adsTracking';
import { tx } from '../utils/uiLang';

const DEFAULT_EGYPT_CENTER = { lat: 30.0444, lng: 31.2357 };

interface MapPanControllerProps {
  panTarget: { lat: number; lng: number; tick: number } | null;
}

const MapPanController: React.FC<MapPanControllerProps> = ({ panTarget }) => {
  const mapInstance = useMap();

  useEffect(() => {
    if (!mapInstance || !panTarget) return;
    mapInstance.panTo({ lat: panTarget.lat, lng: panTarget.lng });
    const currentZoom = mapInstance.getZoom() || 12;
    if (currentZoom < 15) {
      mapInstance.setZoom(16);
    }
  }, [mapInstance, panTarget]);

  return null;
};

export interface StoreLocationPickerProps {
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;
  shopName?: string;
  city?: string;
  address?: string;
  isEn?: boolean;
  readOnly?: boolean;
  heightClass?: string;
  onChange?: (next: {
    latitude?: number;
    longitude?: number;
    googleMapsUrl: string;
  }) => void;
}

export const StoreLocationPicker: React.FC<StoreLocationPickerProps> = ({
  latitude,
  longitude,
  googleMapsUrl = '',
  shopName,
  city,
  address,
  isEn = false,
  readOnly = false,
  heightClass = 'h-64 sm:h-72',
  onChange,
}) => {
  const apiKey = (
    typeof import.meta !== 'undefined'
      ? import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || ''
      : ''
  ).trim();

  const hasValidCoords =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const [panTarget, setPanTarget] = useState<{ lat: number; lng: number; tick: number } | null>(
    null
  );
  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState('');
  const [gpsErrorMsg, setGpsErrorMsg] = useState('');

  const pinPosition = hasValidCoords
    ? { lat: latitude as number, lng: longitude as number }
    : null;

  const commitCoordinates = (lat: number, lng: number, shouldPan = false) => {
    const cleanLat = Number(lat.toFixed(6));
    const cleanLng = Number(lng.toFixed(6));
    const generatedUrl = `https://www.google.com/maps/search/?api=1&query=${cleanLat},${cleanLng}`;
    onChange?.({
      latitude: cleanLat,
      longitude: cleanLng,
      googleMapsUrl: generatedUrl,
    });
    if (shouldPan) {
      setPanTarget({ lat: cleanLat, lng: cleanLng, tick: Date.now() });
    }
  };

  const handleUseCurrentGps = () => {
    if (readOnly) return;
    setGpsErrorMsg('');
    setGpsStatusMsg('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsErrorMsg(
        tx(
          isEn,
          'تحديد الموقع التلقائي غير مدعوم في هذا المتصفح. يمكنك الضغط على الخريطة مباشرة.',
          'Geolocation is not supported in this browser. Tap directly on the map instead.'
        )
      );
      return;
    }

    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        commitCoordinates(pos.coords.latitude, pos.coords.longitude, true);
        setGpsStatusMsg(
          tx(
            isEn,
            'تم تحديد موقعك الحالي على الخريطة ✅',
            'Your current location has been pinned ✅'
          )
        );
      },
      (err) => {
        setLocatingGps(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsErrorMsg(
            tx(
              isEn,
              'تم رفض إذن الموقع. اضغط على موقع مطعمك يدوياً على الخريطة أو الصق رابط Google Maps.',
              'Location permission denied. Tap your store location on the map or paste a Google Maps link.'
            )
          );
        } else {
          setGpsErrorMsg(
            tx(
              isEn,
              'تعذر قراءة إشارة GPS الآن. حرّك الدبوس أو اضغط على الخريطة لتحديد مكانك.',
              'Could not read GPS signal right now. Tap on the map to pin your store.'
            )
          );
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleUrlInputChange = (val: string) => {
    if (readOnly) return;
    const parsed = parseCoordinatesFromGoogleMapsUrl(val);
    if (parsed) {
      const cleanLat = Number(parsed.lat.toFixed(6));
      const cleanLng = Number(parsed.lng.toFixed(6));
      onChange?.({
        latitude: cleanLat,
        longitude: cleanLng,
        googleMapsUrl: val,
      });
      setPanTarget({ lat: cleanLat, lng: cleanLng, tick: Date.now() });
      setGpsErrorMsg('');
    } else {
      onChange?.({
        latitude: hasValidCoords ? latitude : undefined,
        longitude: hasValidCoords ? longitude : undefined,
        googleMapsUrl: val,
      });
    }
  };

  const handleClearPin = () => {
    if (readOnly) return;
    setGpsStatusMsg('');
    setGpsErrorMsg('');
    onChange?.({
      latitude: undefined,
      longitude: undefined,
      googleMapsUrl: '',
    });
  };

  const resolvedPreviewLink = buildGoogleMapsLink({
    googleMapsUrl,
    latitude,
    longitude,
    nameAr: shopName,
    city,
    address,
  });

  return (
    <div className="space-y-2.5">
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={locatingGps}
            onClick={handleUseCurrentGps}
            className="sf-btn-primary !min-h-[38px] px-3 text-xs whitespace-nowrap"
          >
            {locatingGps ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Crosshair className="w-3.5 h-3.5" />
            )}
            <span>
              {locatingGps
                ? tx(isEn, 'جاري تحديد مكانك...', 'Detecting GPS...')
                : tx(isEn, 'تحديد موقعي الحالي (GPS)', 'Use Current GPS Location')}
            </span>
          </button>

          {(hasValidCoords || googleMapsUrl) && (
            <button
              type="button"
              onClick={handleClearPin}
              className="sf-btn !min-h-[36px] px-2.5 text-[11px] whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{tx(isEn, 'مسح الموقع', 'Clear Pin')}</span>
            </button>
          )}
        </div>
      )}

      {apiKey ? (
        <div
          className={`w-full ${heightClass} rounded-2xl overflow-hidden border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#DCFCE7]/30 dark:bg-[#0F1712] relative`}
        >
          <APIProvider
            apiKey={apiKey}
            libraries={['marker']}
            language={isEn ? 'en' : 'ar'}
            region="EG"
          >
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={pinPosition || DEFAULT_EGYPT_CENTER}
              defaultZoom={pinPosition ? 16 : 11}
              gestureHandling="greedy"
              streetViewControl={false}
              mapTypeControl={false}
              fullscreenControl={true}
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              onClick={(ev) => {
                if (readOnly) return;
                const latLng = ev.detail?.latLng;
                if (latLng && typeof latLng.lat === 'number' && typeof latLng.lng === 'number') {
                  setGpsErrorMsg('');
                  setGpsStatusMsg(
                    tx(
                      isEn,
                      'تم تثبيت الدبوس على المكان المختار ✅',
                      'Pinned selected location on map ✅'
                    )
                  );
                  commitCoordinates(latLng.lat, latLng.lng, false);
                }
              }}
            >
              <MapPanController panTarget={panTarget} />
              {(pinPosition || (!readOnly && DEFAULT_EGYPT_CENTER)) && (
                <AdvancedMarker
                  position={pinPosition || DEFAULT_EGYPT_CENTER}
                  draggable={!readOnly}
                  title={shopName || tx(isEn, 'موقع المطعم', 'Restaurant Location')}
                  onDragEnd={(ev) => {
                    if (readOnly) return;
                    const pos = ev.latLng;
                    if (!pos) return;
                    const nextLat = typeof pos.lat === 'function' ? pos.lat() : Number(pos.lat);
                    const nextLng = typeof pos.lng === 'function' ? pos.lng() : Number(pos.lng);
                    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
                      setGpsErrorMsg('');
                      setGpsStatusMsg(
                        tx(
                          isEn,
                          'تم تحريك الدبوس وحفظ الإحداثيات ✅',
                          'Marker moved and coordinates updated ✅'
                        )
                      );
                      commitCoordinates(nextLat, nextLng, false);
                    }
                  }}
                >
                  <Pin
                    background={hasValidCoords ? '#15803D' : '#4B5B52'}
                    borderColor="#14201A"
                    glyphColor="#FFFFFF"
                  />
                </AdvancedMarker>
              )}
            </GoogleMap>
          </APIProvider>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#CFE3D5] dark:border-[#2C3D32] bg-[#F6FBF7] dark:bg-[#0F1712] p-3.5 text-xs space-y-1.5">
          <div className="font-extrabold flex items-center gap-1.5 text-[#14532D] dark:text-[#BBF7D0]">
            <MapPin className="w-4 h-4 text-[#15803D]" />
            <span>
              {tx(
                isEn,
                'حدد موقعك بالـ GPS أو الصق رابط خرائط جوجل',
                'Pin via GPS or paste a Google Maps link'
              )}
            </span>
          </div>
          <p className="text-[11px] font-semibold text-[#4B5B52] dark:text-[#A3B5AA]">
            {tx(
              isEn,
              'اضغط "تحديد موقعي الحالي (GPS)" لتثبيت الإحداثيات فوراً أو الصق رابط خرائط جوجل أدناه.',
              'Click "Use Current GPS Location" above or paste your Google Maps link below.'
            )}
          </p>
        </div>
      )}

      {!readOnly && apiKey && (
        <p className="text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
          {tx(
            isEn,
            'اضغط في أي مكان على الخريطة أو اسحب الدبوس الأخضر فوق موقع مطعمك بدقة.',
            'Click anywhere on the map or drag the green pin to your restaurant entrance.'
          )}
        </p>
      )}

      {gpsStatusMsg && (
        <div className="rounded-xl bg-[#DCFCE7] dark:bg-[#173323] border border-[#86EFAC] dark:border-[#2C3D32] px-3 py-1.5 text-[11px] font-extrabold text-[#14532D] dark:text-[#BBF7D0] flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{gpsStatusMsg}</span>
        </div>
      )}

      {gpsErrorMsg && (
        <div className="rounded-xl bg-[#FEF9C3] border border-[#FACC15] px-3 py-1.5 text-[11px] font-extrabold text-[#14201A]">
          {gpsErrorMsg}
        </div>
      )}

      {!readOnly && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
            {tx(
              isEn,
              'رابط موقع المطعم على خرائط جوجل (يتحدث تلقائياً عند اختيار نقطة)',
              'Google Maps Link (auto-updated when you pin a spot)'
            )}
          </label>
          <input
            type="url"
            dir="ltr"
            value={googleMapsUrl}
            onChange={(e) => handleUrlInputChange(e.target.value)}
            placeholder="https://maps.google.com/?q=30.0444,31.2357"
            className="sf-inp min-h-[40px] text-xs text-left"
          />
        </div>
      )}

      {(hasValidCoords || resolvedPreviewLink) && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold pt-0.5">
          {hasValidCoords ? (
            <span dir="ltr" className="text-[#15803D] dark:text-[#BBF7D0] tabular-nums">
              📍 {latitude?.toFixed(5)}, {longitude?.toFixed(5)}
            </span>
          ) : (
            <span className="text-[#4B5B52] dark:text-[#A3B5AA]">
              {tx(isEn, 'معاينة الرابط الجغرافي', 'Location link preview')}
            </span>
          )}
          {resolvedPreviewLink && (
            <a
              href={resolvedPreviewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#15803D] dark:text-[#BBF7D0] hover:underline font-extrabold"
            >
              <span>{tx(isEn, 'فتح في خرائط جوجل', 'Open in Google Maps')}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
};

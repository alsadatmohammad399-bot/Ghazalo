import React, { useEffect, useRef, useState } from 'react';
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

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
let leafletPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => {
      leafletPromise = null;
      reject(new Error('leaflet load failed'));
    };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

interface OsmMapProps {
  position: { lat: number; lng: number } | null;
  panTarget: { lat: number; lng: number; tick: number } | null;
  readOnly: boolean;
  isEn: boolean;
  accuracy?: number | null;
  onPick: (lat: number, lng: number) => void;
}

/** Free OpenStreetMap map (no API key). Tap to pin, drag the pin to adjust. Works on weak phones. */
const OsmMap: React.FC<OsmMapProps> = ({ position, panTarget, readOnly, isEn, accuracy, onPick }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !hostRef.current || mapRef.current) return;
        const start = position || DEFAULT_EGYPT_CENTER;
        const map = L.map(hostRef.current, {
          center: [start.lat, start.lng],
          zoom: position ? 16 : 11,
          zoomControl: true,
          tap: true,
        });
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
        mapRef.current = map;
        const ensureMarker = (lat: number, lng: number) => {
          if (markerRef.current) {
            markerRef.current.setLatLng([lat, lng]);
            return;
          }
          const marker = L.marker([lat, lng], { draggable: !readOnly }).addTo(map);
          marker.on('dragend', () => {
            const ll = marker.getLatLng();
            onPickRef.current(ll.lat, ll.lng);
          });
          markerRef.current = marker;
        };
        (map as any)._ensureMarker = ensureMarker;
        if (position) ensureMarker(position.lat, position.lng);
        map.on('click', (ev: any) => {
          if (readOnly) return;
          ensureMarker(ev.latlng.lat, ev.latlng.lng);
          onPickRef.current(ev.latlng.lat, ev.latlng.lng);
        });
        setReady(true);
        setTimeout(() => map.invalidateSize(), 250);
        setTimeout(() => map.invalidateSize(), 1000);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (position) {
      map._ensureMarker?.(position.lat, position.lng);
    } else if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }, [position?.lat, position?.lng, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const L = (window as any).L;
    if (!map || !ready || !L) return;
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
    if (position && accuracy && accuracy > 0 && accuracy < 5000) {
      circleRef.current = L.circle([position.lat, position.lng], {
        radius: accuracy,
        color: '#15803D',
        weight: 1,
        fillColor: '#15803D',
        fillOpacity: 0.15,
        interactive: false,
      }).addTo(map);
    }
  }, [position?.lat, position?.lng, accuracy, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !panTarget) return;
    map.setView([panTarget.lat, panTarget.lng], Math.max(map.getZoom(), 16));
  }, [panTarget, ready]);

  if (failed) {
    return (
      <div className="rounded-2xl border border-[#CFE3D5] bg-[#F6FBF7] p-3.5 text-xs font-bold text-[#4B5B52]">
        {tx(
          isEn,
          'تعذر تحميل الخريطة (النت ضعيف). استخدم البحث بالاسم أو الصق رابط خرائط جوجل أدناه.',
          'Map could not load (weak connection). Use the search box or paste a Google Maps link below.'
        )}
      </div>
    );
  }
  return (
    <div className="w-full h-64 rounded-2xl overflow-hidden border border-[#CFE3D5] dark:border-[#2C3D32] relative bg-[#DCFCE7]/30">
      <div ref={hostRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#4B5B52]">
          {tx(isEn, 'جاري تحميل الخريطة...', 'Loading map...')}
        </div>
      )}
    </div>
  );
};

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

  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const watchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bestFixRef = useRef<{ lat: number; lng: number; acc: number } | null>(null);

  const stopWatching = () => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    if (watchTimerRef.current) clearTimeout(watchTimerRef.current);
    watchTimerRef.current = null;
    setLocatingGps(false);
  };

  useEffect(() => () => stopWatching(), []);

  const describeAccuracy = (acc: number) =>
    acc <= 15
      ? tx(isEn, 'دقة ممتازة ✅', 'Excellent accuracy ✅')
      : acc <= 50
        ? tx(isEn, 'دقة كويسة، اسحب الدبوس لو محتاج تظبطه', 'Good accuracy, drag the pin to fine-tune')
        : tx(
            isEn,
            'الدقة ضعيفة. التليفون مش قادر يلقط إشارة أحسن (غالباً جوه مبنى). اخرج لمكان مفتوح أو اسحب الدبوس على مكانك بالظبط.',
            'Accuracy is low. Your phone cannot get a better signal (likely indoors). Go outside or drag the pin to the exact spot.'
          );

  const finishWatching = (reason: 'good' | 'accepted' | 'timeout') => {
    const best = bestFixRef.current;
    stopWatching();
    if (!best) {
      setGpsStatusMsg('');
      setGpsErrorMsg(
        tx(
          isEn,
          'التليفون مرجعش أي إشارة. تأكد إن الموقع (GPS) شغال من إعدادات الموبايل، واخرج لمكان مفتوح وجرّب تاني، أو ابحث باسم المكان أو اضغط على الخريطة.',
          'No location signal. Make sure GPS is on, go outdoors and retry, or search by name / tap the map.'
        )
      );
      return;
    }
    setGpsErrorMsg('');
    setGpsStatusMsg(
      `${tx(isEn, 'تم تثبيت موقعك', 'Location pinned')} ✅ ${tx(isEn, 'دقة الموقع', 'Accuracy')}: ~${Math.round(best.acc)} ${tx(isEn, 'متر', 'm')} · ${describeAccuracy(best.acc)}`
    );
    void reason;
  };

  const handleUseCurrentGps = () => {
    if (readOnly) return;
    setGpsErrorMsg('');
    setGpsStatusMsg('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsErrorMsg(
        tx(
          isEn,
          'تحديد الموقع التلقائي غير مدعوم في هذا المتصفح. ابحث باسم المكان أو اضغط على الخريطة.',
          'Geolocation is not supported in this browser. Search by name or tap the map instead.'
        )
      );
      return;
    }
    stopWatching();
    bestFixRef.current = null;
    setGpsAccuracy(null);
    setLocatingGps(true);
    setGpsStatusMsg(
      tx(isEn, 'بنحدد موقعك بدقة... استنى لحد ما الدقة تتحسن', 'Locating you precisely... wait while accuracy improves')
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : 9999;
        const best = bestFixRef.current;
        if (!best || acc < best.acc) {
          bestFixRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc };
          setGpsAccuracy(acc);
          commitCoordinates(pos.coords.latitude, pos.coords.longitude, true);
          setGpsStatusMsg(
            `${tx(isEn, 'دقة الموقع', 'Accuracy')}: ~${Math.round(acc)} ${tx(isEn, 'متر', 'm')} · ${tx(isEn, 'بنحسّنها...', 'refining...')}`
          );
        }
        if (acc <= 15) finishWatching('good');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          stopWatching();
          setGpsStatusMsg('');
          setGpsErrorMsg(
            tx(
              isEn,
              'إذن الموقع مرفوض. فعّل الموقع للمتصفح من إعدادات الموبايل (الأذونات > الموقع > مسموح)، أو ابحث باسم المكان، أو اضغط على الخريطة.',
              'Location permission denied. Allow location for the browser in phone settings, or search by name / tap the map.'
            )
          );
        }
        // timeouts / temporary unavailable: keep listening until the overall timer ends
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 }
    );

    watchTimerRef.current = setTimeout(() => finishWatching('timeout'), 60000);
  };

  const [searchText, setSearchText] = useState('');
  const [searching, setSearching] = useState(false);

  const handleSearchPlace = async () => {
    const q = searchText.trim();
    if (!q || readOnly) return;
    setGpsErrorMsg('');
    setGpsStatusMsg('');
    // allow pasting "30.0444, 31.2357" or a Google Maps link here too
    const direct = parseCoordinatesFromGoogleMapsUrl(q.includes('http') ? q : `?q=${q.replace(/\s+/g, '')}`);
    if (direct) {
      commitCoordinates(direct.lat, direct.lng, true);
      setGpsStatusMsg(tx(isEn, 'تم تثبيت الموقع ✅', 'Location pinned ✅'));
      return;
    }
    setSearching(true);
    try {
      const query = [q, city].filter(Boolean).join(' ');
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ar&q=${encodeURIComponent(query)}`
      );
      const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
      const hit = rows?.[0];
      if (hit && Number.isFinite(Number(hit.lat)) && Number.isFinite(Number(hit.lon))) {
        commitCoordinates(Number(hit.lat), Number(hit.lon), true);
        setGpsStatusMsg(
          tx(
            isEn,
            'لقينا المكان ✅ لو الدبوس مش مظبوط اسحبه أو اضغط على مكان مطعمك.',
            'Found it ✅ Drag the pin or tap the map to adjust.'
          )
        );
      } else {
        setGpsErrorMsg(
          tx(
            isEn,
            'ملقيناش المكان ده. جرّب اسم الشارع والمدينة، أو اضغط على الخريطة.',
            'Place not found. Try street and city, or tap the map.'
          )
        );
      }
    } catch {
      setGpsErrorMsg(
        tx(isEn, 'البحث مش شغال دلوقتي (النت). اضغط على الخريطة أو الصق رابط جوجل.', 'Search unavailable. Tap the map or paste a Google link.')
      );
    } finally {
      setSearching(false);
    }
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
    stopWatching();
    setGpsAccuracy(null);
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

          {locatingGps && bestFixRef.current && (
            <button
              type="button"
              onClick={() => finishWatching('accepted')}
              className="sf-btn !min-h-[36px] px-2.5 text-[11px] whitespace-nowrap"
            >
              <Check className="w-3 h-3" />
              <span>{tx(isEn, 'اقبل الموقع الحالي', 'Accept current')}</span>
            </button>
          )}

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
        <OsmMap
          position={pinPosition}
          panTarget={panTarget}
          readOnly={readOnly}
          isEn={isEn}
          accuracy={gpsAccuracy}
          onPick={(lat, lng) => {
            setGpsAccuracy(null);
            setGpsErrorMsg('');
            setGpsStatusMsg(
              tx(isEn, 'تم تثبيت الدبوس على المكان المختار ✅', 'Pinned selected location on map ✅')
            );
            commitCoordinates(lat, lng, false);
          }}
        />
      )}

      {!readOnly && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-[#4B5B52] dark:text-[#A3B5AA]">
            {tx(isEn, 'ابحث باسم المكان أو العنوان', 'Search by place name or address')}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSearchPlace();
                }
              }}
              placeholder={tx(isEn, 'مثال: شارع التحرير الإسماعيلية', 'e.g. Tahrir St, Ismailia')}
              className="sf-inp min-h-[40px] text-xs flex-1"
            />
            <button
              type="button"
              disabled={searching}
              onClick={() => void handleSearchPlace()}
              className="sf-btn-primary !min-h-[40px] px-3 text-xs whitespace-nowrap"
            >
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tx(isEn, 'بحث', 'Search')}
            </button>
          </div>
        </div>
      )}

      {!readOnly && (
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

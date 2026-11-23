import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { DEMO_PROJECTS } from '../data/demoProjects';
import { buildFallbackStoreForSlug, findDemoStoreBySlug } from '../data/stores';
import {
  fetchProductsOnce,
  findShopBySlugOrId,
  subscribeToProducts,
  subscribeToShop,
} from '../services/firestoreService';
import type { Order, Product, Shop } from '../types';
import { fetchPublicStoreSnapshot } from '../utils/menuLink';
import {
  findLocalRestaurantBySlugOrShopId,
  getStoredAuthSession,
  safeJsonParse,
} from '../utils/storeRegistry';
import { StorefrontPage } from './StorefrontPage';

interface MenuPageProps {
  forceZeroFeesGlobally: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

interface MenuRouterLocationState {
  shop?: Shop;
  products?: Product[];
}

function getTimestampMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object') {
    const maybe = val as { toMillis?: () => number; seconds?: number };
    if (typeof maybe.toMillis === 'function') {
      try {
        return maybe.toMillis();
      } catch {
        return 0;
      }
    }
    if (typeof maybe.seconds === 'number') {
      return maybe.seconds * 1000;
    }
  }
  return 0;
}

function savePublicLocalOrder(shopId: string, newOrder: Order): void {
  if (!shopId || shopId.startsWith('shop-')) return;
  try {
    const existing = safeJsonParse<Order[]>(
      localStorage.getItem(`ghazalo_orders_${shopId}`),
      []
    );
    const next = [newOrder, ...existing.filter((o) => o.id !== newOrder.id)];
    localStorage.setItem(`ghazalo_orders_${shopId}`, JSON.stringify(next));
  } catch {
    // ignore storage quota
  }
}

export const MenuPage: React.FC<MenuPageProps> = ({
  forceZeroFeesGlobally,
  darkMode,
  onToggleDarkMode,
}) => {
  const { slug: paramSlug } = useParams<{ slug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const routerState = (location.state as MenuRouterLocationState | null) || null;

  const { resolvedSlug, tableLabel } = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const shopParam = params.get('shop');
    const tbl = params.get('table') || '';

    let raw = paramSlug || shopParam || '';
    if (!raw) {
      const cleanPath = (location.pathname || '').replace(/^\/+|\/+$/g, '');
      if (cleanPath.toLowerCase().startsWith('menu/')) {
        raw = cleanPath.slice(5);
      } else if (cleanPath) {
        raw = cleanPath;
      }
    }

    if (raw) {
      try {
        raw = decodeURIComponent(raw);
      } catch {
        // keep raw
      }
    }

    return {
      resolvedSlug: raw.trim() || 'koshary-corner',
      tableLabel: tbl,
    };
  }, [paramSlug, location.pathname, location.search]);

  const [resolvedState, setResolvedState] = useState<{
    shop: Shop;
    products: Product[];
    isFallbackMenu: boolean;
    isLoading: boolean;
  }>(() => {
    const demoStoreMatch = findDemoStoreBySlug(resolvedSlug);
    const localRec = findLocalRestaurantBySlugOrShopId(resolvedSlug);
    const demoProjectMatch = DEMO_PROJECTS.find(
      (p) =>
        p.id.toLowerCase() === resolvedSlug.toLowerCase() ||
        p.shop.storeSlug?.toLowerCase() === resolvedSlug.toLowerCase()
    );

    if (routerState?.shop) {
      return {
        shop: routerState.shop,
        products: routerState.products || localRec?.products || [],
        isFallbackMenu: false,
        isLoading: false,
      };
    }

    if (localRec) {
      return {
        shop: localRec.shop,
        products:
          localRec.products && localRec.products.length > 0
            ? localRec.products
            : demoStoreMatch?.products || [],
        isFallbackMenu: false,
        isLoading: false,
      };
    }
    if (demoStoreMatch) {
      return {
        shop: demoStoreMatch.shop,
        products: demoStoreMatch.products,
        isFallbackMenu: false,
        isLoading: false,
      };
    }
    if (demoProjectMatch) {
      return {
        shop: demoProjectMatch.shop,
        products: demoProjectMatch.products,
        isFallbackMenu: false,
        isLoading: false,
      };
    }

    const placeholder = buildFallbackStoreForSlug(resolvedSlug);
    return {
      shop: placeholder.shop,
      products: [],
      isFallbackMenu: false,
      isLoading: true,
    };
  });

  useEffect(() => {
    let active = true;
    let unsubShop: (() => void) | null = null;
    let unsubProds: (() => void) | null = null;

    const demoStoreMatch = findDemoStoreBySlug(resolvedSlug);
    const localRec = findLocalRestaurantBySlugOrShopId(resolvedSlug);
    const demoProjectMatch = DEMO_PROJECTS.find(
      (p) =>
        p.id.toLowerCase() === resolvedSlug.toLowerCase() ||
        p.shop.storeSlug?.toLowerCase() === resolvedSlug.toLowerCase()
    );

    if (routerState?.shop) {
      setResolvedState({
        shop: routerState.shop,
        products: routerState.products || localRec?.products || [],
        isFallbackMenu: false,
        isLoading: false,
      });
    } else if (localRec) {
      setResolvedState({
        shop: localRec.shop,
        products:
          localRec.products && localRec.products.length > 0
            ? localRec.products
            : demoStoreMatch?.products || [],
        isFallbackMenu: false,
        isLoading: false,
      });
    } else if (demoStoreMatch) {
      setResolvedState({
        shop: demoStoreMatch.shop,
        products: demoStoreMatch.products,
        isFallbackMenu: false,
        isLoading: false,
      });
    } else if (demoProjectMatch) {
      setResolvedState({
        shop: demoProjectMatch.shop,
        products: demoProjectMatch.products,
        isFallbackMenu: false,
        isLoading: false,
      });
    } else {
      const placeholder = buildFallbackStoreForSlug(resolvedSlug);
      setResolvedState({
        shop: placeholder.shop,
        products: [],
        isFallbackMenu: false,
        isLoading: true,
      });
    }

    const resolveRemote = async () => {
      const [fsShopRes, snapRes] = await Promise.allSettled([
        findShopBySlugOrId(resolvedSlug),
        fetchPublicStoreSnapshot(resolvedSlug),
      ]);
      if (!active) return;

      const fsShop = fsShopRes.status === 'fulfilled' ? fsShopRes.value : null;
      const remoteSnapshot = snapRes.status === 'fulfilled' ? snapRes.value : null;

      const localUpdatedMs = getTimestampMs(localRec?.shop?.updatedAt);
      const snapUpdatedMs = remoteSnapshot?.updatedAt || getTimestampMs(remoteSnapshot?.shop?.updatedAt);
      const fsUpdatedMs = getTimestampMs(fsShop?.updatedAt);

      // Determine freshest visual/store settings source while honoring Firestore subscription status if present
      const pickBestShop = (liveFs?: Shop | null): Shop | null => {
        const candidates: Array<{ shop: Shop; ts: number }> = [];
        if (liveFs) candidates.push({ shop: liveFs, ts: getTimestampMs(liveFs.updatedAt) });
        if (remoteSnapshot?.shop) candidates.push({ shop: remoteSnapshot.shop, ts: snapUpdatedMs });
        if (localRec?.shop) candidates.push({ shop: localRec.shop, ts: localUpdatedMs });
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => b.ts - a.ts);
        const freshest = candidates[0].shop;
        if (!liveFs) return freshest;
        return {
          ...freshest,
          subscriptionStatus: liveFs.subscriptionStatus,
          approvedByAdmin: liveFs.approvedByAdmin,
          trialEndsAt: liveFs.trialEndsAt ?? freshest.trialEndsAt,
          subscriptionExpiresAt: liveFs.subscriptionExpiresAt ?? freshest.subscriptionExpiresAt,
          plan: liveFs.plan || freshest.plan,
        };
      };

      if (fsShop) {
        let initialProds: Product[] = [];
        try {
          initialProds = await fetchProductsOnce(fsShop.id);
        } catch {
          initialProds = [];
        }
        if (!active) return;

        const bestProds =
          initialProds.length > 0
            ? initialProds
            : remoteSnapshot?.products && remoteSnapshot.products.length > 0
              ? remoteSnapshot.products
              : localRec?.products && localRec.products.length > 0
                ? localRec.products
                : demoStoreMatch?.products || [];

        const initialBestShop = pickBestShop(fsShop) || fsShop;

        setResolvedState({
          shop: initialBestShop,
          products: bestProds,
          isFallbackMenu: false,
          isLoading: false,
        });

        unsubShop = subscribeToShop(
          fsShop.id,
          (liveShop) => {
            if (!liveShop || !active) return;
            const liveTs = getTimestampMs(liveShop.updatedAt);
            // If local or public snapshot is strictly newer (e.g. Store-Auth edit), preserve newer visual fields
            const freshestOffTs = Math.max(localUpdatedMs, snapUpdatedMs, fsUpdatedMs);
            if (liveTs >= freshestOffTs) {
              setResolvedState((prev) => ({
                ...prev,
                shop: liveShop,
                isFallbackMenu: false,
                isLoading: false,
              }));
            } else {
              const merged = pickBestShop(liveShop) || liveShop;
              setResolvedState((prev) => ({
                ...prev,
                shop: merged,
                isFallbackMenu: false,
                isLoading: false,
              }));
            }
          },
          () => {
            // ignore non-fatal public listener permission issues
          }
        );

        unsubProds = subscribeToProducts(
          fsShop.id,
          (liveProds) => {
            if (!active) return;
            if (liveProds.length > 0) {
              setResolvedState((prev) => ({
                ...prev,
                products: liveProds,
                isFallbackMenu: false,
                isLoading: false,
              }));
            }
          },
          () => {
            // ignore non-fatal public listener permission issues
          }
        );
        return;
      }

      if (remoteSnapshot) {
        const bestShop = pickBestShop(null) || remoteSnapshot.shop;
        const bestProds =
          remoteSnapshot.products.length > 0
            ? remoteSnapshot.products
            : localRec?.products && localRec.products.length > 0
              ? localRec.products
              : demoStoreMatch?.products || [];
        setResolvedState({
          shop: bestShop,
          products: bestProds,
          isFallbackMenu: false,
          isLoading: false,
        });
        return;
      }

      if (localRec || demoStoreMatch || demoProjectMatch || routerState?.shop) {
        setResolvedState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      // Truly unknown slug after checking Firestore & server public snapshot
      const generic = buildFallbackStoreForSlug(resolvedSlug);
      setResolvedState({
        shop: generic.shop,
        products: generic.products,
        isFallbackMenu: true,
        isLoading: false,
      });
    };

    void resolveRemote();

    return () => {
      active = false;
      unsubShop?.();
      unsubProds?.();
    };
  }, [resolvedSlug, routerState]);

  const storedSession = getStoredAuthSession();
  const hasOwnerSession = Boolean(storedSession.token && storedSession.lastStore);

  return (
    <StorefrontPage
      shop={resolvedState.shop}
      products={resolvedState.products}
      initialTableLabel={tableLabel}
      isFallbackMenu={resolvedState.isFallbackMenu}
      isLoading={resolvedState.isLoading}
      onCreateFreeStore={() => navigate('/signup')}
      forceZeroFeesGlobally={forceZeroFeesGlobally}
      darkMode={darkMode}
      onToggleDarkMode={onToggleDarkMode}
      onOrderPlaced={(newOrder) => savePublicLocalOrder(resolvedState.shop.id, newOrder)}
      onBack={() => {
        if (hasOwnerSession) {
          navigate(`/dashboard/${storedSession.lastStore}`);
        } else {
          navigate('/');
        }
      }}
      backLabel={hasOwnerSession ? 'لوحة التحكم' : 'الرئيسية'}
    />
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { DEMO_PROJECTS } from '../data/demoProjects';
import { buildFallbackStoreForSlug, findDemoStoreBySlug } from '../data/stores';
import {
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
      resolvedSlug: raw.trim() || 'mtgry-algdyd',
      tableLabel: tbl,
    };
  }, [paramSlug, location.pathname, location.search]);

  const [resolvedState, setResolvedState] = useState<{
    shop: Shop;
    products: Product[];
    isFallbackMenu: boolean;
  }>(() => {
    const demoStoreMatch = findDemoStoreBySlug(resolvedSlug);
    const localRec = findLocalRestaurantBySlugOrShopId(resolvedSlug);
    const demoProjectMatch = DEMO_PROJECTS.find(
      (p) =>
        p.id.toLowerCase() === resolvedSlug.toLowerCase() ||
        p.shop.storeSlug?.toLowerCase() === resolvedSlug.toLowerCase()
    );

    if (localRec) {
      return {
        shop: localRec.shop,
        products:
          localRec.products && localRec.products.length > 0
            ? localRec.products
            : demoStoreMatch?.products || buildFallbackStoreForSlug(resolvedSlug).products,
        isFallbackMenu: false,
      };
    }
    if (demoStoreMatch) {
      return {
        shop: demoStoreMatch.shop,
        products: demoStoreMatch.products,
        isFallbackMenu: false,
      };
    }
    if (demoProjectMatch) {
      return {
        shop: demoProjectMatch.shop,
        products: demoProjectMatch.products,
        isFallbackMenu: false,
      };
    }
    const generic = buildFallbackStoreForSlug(resolvedSlug);
    return {
      shop: generic.shop,
      products: generic.products,
      isFallbackMenu: true,
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

    if (localRec) {
      setResolvedState({
        shop: localRec.shop,
        products:
          localRec.products && localRec.products.length > 0
            ? localRec.products
            : demoStoreMatch?.products || buildFallbackStoreForSlug(resolvedSlug).products,
        isFallbackMenu: false,
      });
    } else if (demoStoreMatch) {
      setResolvedState({
        shop: demoStoreMatch.shop,
        products: demoStoreMatch.products,
        isFallbackMenu: false,
      });
    } else if (demoProjectMatch) {
      setResolvedState({
        shop: demoProjectMatch.shop,
        products: demoProjectMatch.products,
        isFallbackMenu: false,
      });
    } else {
      const generic = buildFallbackStoreForSlug(resolvedSlug);
      setResolvedState({
        shop: generic.shop,
        products: generic.products,
        isFallbackMenu: true,
      });
    }

    const resolveRemote = async () => {
      try {
        const fsShop = await findShopBySlugOrId(resolvedSlug);
        if (!active) return;
        if (fsShop) {
          setResolvedState((prev) => ({
            shop: fsShop,
            products: prev.products,
            isFallbackMenu: false,
          }));
          unsubShop = subscribeToShop(fsShop.id, (s) => {
            if (s && active) {
              setResolvedState((prev) => ({ ...prev, shop: s, isFallbackMenu: false }));
            }
          });
          unsubProds = subscribeToProducts(fsShop.id, (p) => {
            if (active) {
              setResolvedState((prev) => ({ ...prev, products: p, isFallbackMenu: false }));
            }
          });
          return;
        }
      } catch {
        // continue to server snapshot lookup
      }

      if (!localRec && !demoStoreMatch && !demoProjectMatch) {
        const remoteSnapshot = await fetchPublicStoreSnapshot(resolvedSlug);
        if (!active) return;
        if (remoteSnapshot) {
          setResolvedState({
            shop: remoteSnapshot.shop,
            products:
              remoteSnapshot.products.length > 0
                ? remoteSnapshot.products
                : buildFallbackStoreForSlug(resolvedSlug).products,
            isFallbackMenu: false,
          });
        }
      }
    };

    void resolveRemote();

    return () => {
      active = false;
      unsubShop?.();
      unsubProds?.();
    };
  }, [resolvedSlug]);

  const storedSession = getStoredAuthSession();
  const hasOwnerSession = Boolean(storedSession.token && storedSession.lastStore);

  return (
    <StorefrontPage
      shop={resolvedState.shop}
      products={resolvedState.products}
      initialTableLabel={tableLabel}
      isFallbackMenu={resolvedState.isFallbackMenu}
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

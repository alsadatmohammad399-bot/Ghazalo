# Sofrtek Firestore Security Specification

## 1. Data Invariants
1. A UserProfile in `/users/{userId}` can only be read/written by that authenticated user (`request.auth.uid == userId`) or an Admin (`alsadatmohammad399@gmail.com` with `email_verified == true` or `/admins/{uid}`).
2. A Shop in `/shops/{shopId}` must have `ownerId == request.auth.uid` on creation, and starts with `subscriptionStatus == 'trial'`. Merchants cannot elevate `subscriptionStatus` to `'active'` or extend `subscriptionExpiresAt`; only Admin can activate a shop for 30 days.
3. Products in `/shops/{shopId}/products/{productId}` and Tables in `/shops/{shopId}/tables/{tableId}` can only be written by the parent Shop's verified `ownerId` (checked via `get(/databases/$(database)/documents/shops/$(shopId))`).
4. Orders in `/shops/{shopId}/orders/{orderId}` can be created by storefront customers (including guests) ONLY if the parent shop exists, `acceptOrders == true`, and `shopOwnerId` matches the parent shop's `ownerId`. Listing and updating orders are restricted to `shopOwnerId == request.auth.uid` or Admin, enforcing `resource.data.shopOwnerId == request.auth.uid` directly in `allow list` without `get()`.
5. All string fields enforce `.size()` upper bounds, all arrays enforce `.size()` bounds and first-element type validation, and all IDs match `^[a-zA-Z0-9_\-]+$`.
6. Once an Order reaches terminal status `'completed'`, non-admin updates are blocked.

## 2. The Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Unverified Admin Email Spoof**: User with `email: 'alsadatmohammad399@gmail.com'` and `email_verified: false` tries to update a shop's `subscriptionStatus` to `'active'`.
2. **Self-Activation Privilege Escalation**: Shop owner updates their own shop setting `subscriptionStatus: 'active'` and `subscriptionExpiresAt: 9999999999999`.
3. **Shadow Field Injection on Shop**: Creating/updating a shop with extra field `isAdmin: true`.
4. **Owner Spoofing on Create**: User A creates a shop with `ownerId: 'user_B'`.
5. **Orphan Product Write**: User creates a product under `/shops/non_existent_shop/products/p1`.
6. **Cross-Tenant Product Hijack**: User A updates or deletes a product under User B's shop.
7. **PII Blanket Read on Users**: Authenticated User A tries `list` or `get` on `/users/user_B`.
8. **PII Order List Scrape**: Unauthenticated guest or User A tries `list` on `/shops/shop_B/orders`.
9. **Resource Poisoning (1MB ID / String)**: Creating a shop with `id` > 128 chars or `nameAr` > 120 chars.
10. **Order Total / Price Tampering by Guest Update**: Guest tries to update an order after creation.
11. **Terminal Order Mutation**: Merchant tries to revert an order from `status: 'completed'` back to `'new'`.
12. **Client-Trust Timestamp Forgery**: Creating a shop with a backdated client timestamp instead of `request.time`.

/**
 * Adversarial Security Rules Verification Matrix ("Dirty Dozen" Payloads)
 * Every scenario listed below must result in PERMISSION_DENIED under firestore.rules.
 */

export const DIRTY_DOZEN_CASES = [
  {
    name: '1. Unverified Admin Email Spoof',
    auth: { uid: 'attacker1', token: { email: 'alsadatmohammad399@gmail.com', email_verified: false } },
    operation: 'update /shops/shop_1 { subscriptionStatus: "active" }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Merchant Self-Activation Privilege Escalation',
    auth: { uid: 'owner_1', token: { email: 'owner@example.com', email_verified: true } },
    operation: 'update /shops/shop_1 { subscriptionStatus: "active", subscriptionExpiresAt: 9999999999999 }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Shadow Field Injection on Shop',
    auth: { uid: 'owner_1', token: { email: 'owner@example.com', email_verified: true } },
    operation: 'create /shops/shop_2 { ...validShop, isAdmin: true }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Owner Spoofing on Shop Create',
    auth: { uid: 'attacker_2', token: { email: 'a@example.com', email_verified: true } },
    operation: 'create /shops/shop_3 { ...validShop, ownerId: "victim_uid" }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Orphan Product Write',
    auth: { uid: 'owner_1', token: { email: 'owner@example.com', email_verified: true } },
    operation: 'create /shops/missing_shop/products/prod_1 { ...validProduct }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Cross-Tenant Product Hijack',
    auth: { uid: 'attacker_2', token: { email: 'a@example.com', email_verified: true } },
    operation: 'update /shops/shop_1/products/prod_1 { price: 1 }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. PII Blanket Read on Users',
    auth: { uid: 'attacker_2', token: { email: 'a@example.com', email_verified: true } },
    operation: 'get /users/owner_1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. PII Order List Scrape',
    auth: null,
    operation: 'list /shops/shop_1/orders',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Resource Poisoning Oversized ID/String',
    auth: { uid: 'owner_1', token: { email: 'owner@example.com', email_verified: true } },
    operation: 'create /shops/shop_1/products/prod_2 { name: "x".repeat(500) }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Guest Order Update Tampering',
    auth: null,
    operation: 'update /shops/shop_1/orders/ord_1 { total: 0 }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Terminal Order State Mutation',
    auth: { uid: 'owner_1', token: { email: 'owner@example.com', email_verified: true } },
    operation: 'update /shops/shop_1/orders/completed_ord { status: "new" }',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Client-Trust Timestamp Forgery',
    auth: { uid: 'owner_1', token: { email: 'owner@example.com', email_verified: true } },
    operation: 'create /shops/shop_4 { ...validShop, createdAt: "2020-01-01T00:00:00Z" }',
    expected: 'PERMISSION_DENIED',
  },
];

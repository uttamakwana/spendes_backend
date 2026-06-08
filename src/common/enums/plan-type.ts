/**
 * Subscription tier a user is on. `Free` is the default — and the only tier during
 * the MVP, since the entitlements module keeps gating OFF until the Pro tier and
 * billing ship. `Pro` is the paid tier unlocked later via app-store billing; it
 * grants every gateable feature. The tier lives on the user document and is
 * attached to `req.user` by the auth middleware.
 */
export enum PlanType {
  Free = 'free',
  Pro = 'pro',
}

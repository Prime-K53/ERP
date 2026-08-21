// ─── Portal Banner Ads ───────────────────────────────────────────────────────
// Ads managed in Smart Operations Hub → Ads and displayed on the customer
// portal's banner carousel (frontend/views/portal/CustomerDashboard.tsx).

export type PortalAdStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';

/**
 * Metadata captured when a banner is prepared for the customer portal's 4:1
 * banner area. Stored inside the ad record (portal_ads.data JSONB envelope).
 */
export interface PortalAdImageMeta {
  /** Banner type — always 'customer_portal_banner'. */
  bannerType: string;
  /** Final asset width in px (1600 for a fully prepared banner). */
  width: number;
  /** Final asset height in px (400 for a fully prepared banner). */
  height: number;
  /** Aspect ratio of the final asset (4 = 4:1). */
  aspectRatio: number;
  /** Stored format — 'webp' for prepared banners; absent for URL-probed assets. */
  format?: string;
  /** Stored file size in bytes; absent for URL-probed assets. */
  fileSize?: number;
  /** ISO timestamp of when the asset was prepared. */
  preparedAt?: string;
}

export interface PortalAd {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;               // small chip label e.g. "New" / "Limited Time"
  ctaLabel?: string;            // button text e.g. "Order Now"
  ctaTarget?: string;           // portal path e.g. "/portal/orders"
  imageUrl?: string;            // optional hero image
  imageMeta?: PortalAdImageMeta; // spec metadata of the prepared banner asset
  gradient?: string;            // css gradient used as banner background
  emoji?: string;               // icon shown in the banner chip
  priority?: number;            // higher = appears first
  startsAt?: string;
  endsAt?: string;
  isActive?: boolean;
  status?: PortalAdStatus;
  createdAt?: string;
  updatedAt?: string;
  companyId?: string;
  createdBy?: string;
  // AI studio metadata
  aiGenerated?: boolean;
  aiPrompt?: string;
}

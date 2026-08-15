// ─── Portal Banner Ads ───────────────────────────────────────────────────────
// Ads managed in Smart Operations Hub → Ads and displayed on the customer
// portal's banner carousel (frontend/views/portal/CustomerDashboard.tsx).

export type PortalAdStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired';

export interface PortalAd {
  id: string;
  title: string;
  subtitle?: string;
  badge?: string;               // small chip label e.g. "New" / "Limited Time"
  ctaLabel?: string;            // button text e.g. "Order Now"
  ctaTarget?: string;           // portal path e.g. "/portal/orders"
  imageUrl?: string;            // optional hero image
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

import React from 'react';
import { Percent, Tag, Clock, ArrowRight } from 'lucide-react';
import type { PortalPromotionInfo } from '../../../services/portalApiClient';

interface PromotionBannerProps {
  promotions: PortalPromotionInfo[];
  onNavigate?: (path: string) => void;
}

const fmtMoney = (n: number) =>
  'K' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const discountLabel = (p: PortalPromotionInfo): string => {
  const type = String(p.discountType || 'percentage');
  const value = Number(p.discountValue ?? 0) || 0;
  if (type === 'percentage') return `${value}% OFF`;
  if (type === 'fixed_price') return `${fmtMoney(value)} each`;
  if (type === 'buy_x_get_y') return 'Buy X Get Y';
  return `${fmtMoney(value)} OFF`;
};

const PromotionBanner: React.FC<PromotionBannerProps> = ({ promotions, onNavigate }) => {
  if (!promotions || promotions.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {promotions.map((p) => {
        const ends = p.endsAt ? new Date(p.endsAt) : null;
        const endsValid = ends && !Number.isNaN(ends.getTime());
        const endsSoon = endsValid && (ends!.getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000;
        const isAuto = p.isAutoApply !== false;

        return (
          <div
            key={p.id}
            onClick={() => onNavigate?.('/portal/new-request')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 18px',
              borderRadius: 14,
              background: 'linear-gradient(135deg, #0b3e39 0%, #0f544c 55%, #008A4C 130%)',
              color: '#fff',
              cursor: onNavigate ? 'pointer' : 'default',
              transition: 'transform .15s ease, box-shadow .15s ease',
              boxShadow: '0 4px 16px -4px rgba(15,84,76,0.35)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Percent size={20} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span>
                {p.code && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      padding: '2px 7px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.2)',
                    }}
                  >
                    {p.code}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#A7F3D0',
                  }}
                >
                  {discountLabel(p)}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 4,
                  fontSize: 11.5,
                  color: 'rgba(255,255,255,0.75)',
                }}
              >
                {isAuto && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Tag size={11} /> Auto-applied
                  </span>
                )}
                {p.minimumOrderAmount ? (
                  <span>Min order {fmtMoney(p.minimumOrderAmount)}</span>
                ) : null}
                {endsValid && (
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      color: endsSoon ? '#FCA5A5' : 'rgba(255,255,255,0.75)',
                    }}
                  >
                    <Clock size={11} />
                    Ends {ends!.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            </div>

            <ArrowRight size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
          </div>
        );
      })}
    </div>
  );
};

export default PromotionBanner;

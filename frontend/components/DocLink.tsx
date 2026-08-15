/**
 * DocLink — Clickable document number component.
 *
 * Renders a styled, clickable link to a document's destination page.
 * On the destination page itself it falls back to a plain <span> so the
 * number looks identical to any other cell text.
 *
 * Usage:
 *   <DocLink
 *     docNumber="INV-2201"
 *     targetPage="/sales-flow/invoices"
 *     rowId="inv-INV-2201"
 *     currentPage={location.pathname}
 *   />
 *
 * Row ID convention: {prefix}-{docNumber}
 *   Invoices:      inv-INV-XXXX
 *   Quotations:    qt-QT-XXXX
 *   Sales Orders:  so-SO-XXXX
 *   Purchase Bills: bill-BIL-XXXX
 *   Payments:      pmt-PMT-XXXX
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

export interface DocLinkProps {
  /** The human-readable document number, e.g. "INV-2201" */
  docNumber: string;
  /** The route path of the destination page, e.g. "/sales-flow/invoices" */
  targetPage: string;
  /** The DOM id of the destination row, e.g. "inv-INV-2201" */
  rowId: string;
  /** The route of the page this DocLink is rendered on */
  currentPage: string;
  /** Optional extra className for the link state */
  className?: string;
}

export const DocLink: React.FC<DocLinkProps> = ({
  docNumber,
  targetPage,
  rowId,
  currentPage,
  className,
}) => {
  const navigate = useNavigate();

  // Normalise paths: strip trailing slashes so "/foo/" === "/foo"
  const normTarget = targetPage.replace(/\/$/, '');
  const normCurrent = currentPage.replace(/\/$/, '');

  // On own page → render as plain text (same visual weight as other cells)
  if (normCurrent === normTarget || normCurrent.startsWith(`${normTarget}/`)) {
    return (
      <span className={className}>
        {docNumber}
      </span>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`${targetPage}?highlight=${encodeURIComponent(rowId)}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Go to ${docNumber}`}
      className={[
        // Base: inherit font so it blends with the cell
        'font-mono font-bold',
        // Colour + cursor
        'text-blue-600 cursor-pointer',
        // No underline by default; underline on hover
        'no-underline hover:underline',
        // Smooth transition
        'transition-colors duration-150',
        // Hover colour
        'hover:text-blue-800',
        // Focus ring for accessibility
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 rounded-sm',
        // Remove button chrome
        'bg-transparent border-none p-0 m-0 leading-none',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {docNumber}
    </button>
  );
};

export default DocLink;

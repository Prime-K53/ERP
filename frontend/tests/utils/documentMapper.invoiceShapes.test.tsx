import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { mapErpDataToDocument } from '../../utils/documentMapper';

describe('documentMapper invoice item fallbacks', () => {
  it('renders fallback description and quantity for examination invoices', () => {
    const { content } = mapErpDataToDocument('Examination Invoice', {
      id: 'EXAM-INV-1',
      date: '2026-03-03',
      customerName: 'Sample School',
      items: [
        { name: 'Examination Service', quantity: 30, unitPrice: 5, total: 150 }
      ],
      subtotal: 150,
      total: 150
    });

    render(<div>{content}</div>);

    expect(screen.getByText('Examination Service')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('renders fallback description for standard invoices', () => {
    const { content } = mapErpDataToDocument('Invoice', {
      id: 'INV-100',
      date: '2026-03-03',
      customerName: 'Sample Customer',
      items: [
        { description: 'Consulting Services', quantity: 2, unitPrice: 100, total: 200 }
      ],
      subtotal: 200,
      total: 200
    });

    render(<div>{content}</div>);

    expect(screen.getByText('Consulting Services')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});

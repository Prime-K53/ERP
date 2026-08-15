import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import ExaminationInvoice from '../../components/ExaminationInvoice';

describe('ExaminationInvoice summaries', () => {
  it('matches snapshot for class-grouped summary', () => {
    const { container } = render(
      <ExaminationInvoice
        currencySymbol="MWK"
        academicYear="2025"
        term="2"
        examType="Mid-Term"
        schoolName="Sample Academy"
        classBreakdown={[
          {
            className: 'Grade 1',
            subjects: ['Math', 'English'],
            totalCandidates: 30,
            chargePerLearner: 500,
            classTotal: 15000
          },
          {
            className: 'Grade 2',
            subjects: ['Science'],
            totalCandidates: 20,
            chargePerLearner: 600,
            classTotal: 12000
          }
        ]}
      />
    );

    expect(container).toMatchSnapshot();
  });
});

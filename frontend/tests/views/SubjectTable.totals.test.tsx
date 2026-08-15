import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubjectTable from '../../views/examination/SubjectTable';

describe('SubjectTable totals', () => {
  it('renders totals for pages, copies, and total pages', () => {
    render(
      <SubjectTable
        subjects={[
          { subject_name: 'Math', pages_per_paper: 2, extra_copies: 1 },
          { subject_name: 'English', pages_per_paper: 3, extra_copies: 0 }
        ]}
        onSubjectChange={() => undefined}
        onRemoveSubject={() => undefined}
        errors={{}}
        learners={10}
      />
    );

    expect(screen.getByText('Totals')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
  });
});

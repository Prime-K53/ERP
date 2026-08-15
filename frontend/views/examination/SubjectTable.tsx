import React from 'react';
import { ExaminationJobSubject } from '../../types';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { Trash2 } from 'lucide-react';

interface SubjectTableProps {
  subjects: Array<{
    id?: string;
    subject_name: string;
    pages_per_paper: number;
    extra_copies: number;
  }>;
  onSubjectChange: (index: number, field: string, value: any) => void;
  onRemoveSubject: (index: number) => void;
  errors: Record<string, string>;
  learners: number;
}

const SubjectTable: React.FC<SubjectTableProps> = ({
  subjects,
  onSubjectChange,
  onRemoveSubject,
  errors,
  learners
}) => {
  const calculateTotalPages = (subject: any) => {
    const totalCopies = Math.max(0, Math.floor(Number(learners) || 0)) + Math.max(0, Math.floor(Number(subject.extra_copies) || 0));
    return Math.max(0, Math.floor(Number(subject.pages_per_paper) || 0)) * totalCopies;
  };

  const totals = subjects.reduce((acc, subject) => {
    const pagesPerPaper = Math.max(0, Math.floor(Number(subject.pages_per_paper) || 0));
    const extraCopies = Math.max(0, Math.floor(Number(subject.extra_copies) || 0));
    const totalCopies = Math.max(0, Math.floor(Number(learners) || 0)) + extraCopies;
    const totalPages = pagesPerPaper * totalCopies;
    return {
      pages: acc.pages + pagesPerPaper,
      extraCopies: acc.extraCopies + extraCopies,
      totalCopies: acc.totalCopies + totalCopies,
      totalPages: acc.totalPages + totalPages
    };
  }, { pages: 0, extraCopies: 0, totalCopies: 0, totalPages: 0 });

  const getError = (index: number, field: string) => {
    return errors[`subject_${index}_${field}`];
  };

  if (subjects.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No subjects added yet. Click "Add Subject" to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Subject
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pages
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Extra Copies
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Copies
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Pages
              </th>
              <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {subjects.map((subject, index) => {
              const totalCopies = learners + (subject.extra_copies || 0);
              const totalPages = calculateTotalPages(subject);

              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-3 py-4 whitespace-nowrap">
                    <Input
                      value={subject.subject_name}
                      onChange={(e) => onSubjectChange(index, 'subject_name', e.target.value)}
                      error={getError(index, 'name')}
                      placeholder="e.g., Mathematics"
                      className="w-full"
                    />
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    <Input
                      type="number"
                      min="1"
                      value={subject.pages_per_paper}
                      onChange={(e) => onSubjectChange(index, 'pages_per_paper', parseInt(e.target.value) || 0)}
                      error={getError(index, 'pages')}
                      className="w-20"
                    />
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap">
                    <Input
                      type="number"
                      min="0"
                      value={subject.extra_copies}
                      onChange={(e) => onSubjectChange(index, 'extra_copies', parseInt(e.target.value) || 0)}
                      className="w-20"
                    />
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-900">
                    {totalCopies}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {totalPages}
                  </td>
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveSubject(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t">
            <tr>
              <td className="px-3 py-3 text-sm font-semibold text-gray-900">
                Totals
              </td>
              <td className="px-3 py-3 text-sm text-gray-700">
                {totals.pages}
              </td>
              <td className="px-3 py-3 text-sm text-gray-700">
                {totals.extraCopies}
              </td>
              <td className="px-3 py-3 text-sm text-gray-700">
                {totals.totalCopies}
              </td>
              <td className="px-3 py-3 text-sm font-semibold text-gray-900">
                {totals.totalPages}
              </td>
              <td className="px-3 py-3 text-sm text-gray-500" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default SubjectTable;

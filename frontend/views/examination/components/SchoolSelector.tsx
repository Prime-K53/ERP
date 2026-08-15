import React from 'react';
import { School } from '../../../types';
import { Select } from '../../../components/Select';
import { Building2 } from 'lucide-react';

interface SchoolSelectorProps {
  value: string;
  onChange: (value: string) => void;
  schools: School[];
  error?: string;
  disabled?: boolean;
}

const SchoolSelector: React.FC<SchoolSelectorProps> = ({
  value,
  onChange,
  schools,
  error,
  disabled = false
}) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        School
      </label>
      <div className="relative">
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`pl-10 ${error ? 'border-red-300' : ''}`}
        >
          <option value="">Select a school...</option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </Select>
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Building2 className="h-4 w-4 text-gray-400" />
        </div>
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default SchoolSelector;

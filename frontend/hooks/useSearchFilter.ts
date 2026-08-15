import { useState, useMemo, useCallback } from 'react';
import { FilterConfig } from '../components/SearchFilterBar';

interface UseSearchFilterOptions<T> {
    data: T[];
    searchFields: (keyof T)[];
    filterConfigs?: FilterConfig[];
    initialFilters?: Record<string, any>;
}

export function useSearchFilter<T>({ 
    data, 
    searchFields, 
    filterConfigs = [],
    initialFilters = {}
}: UseSearchFilterOptions<T>) {
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState<Record<string, any>>(initialFilters);
    const [showFilters, setShowFilters] = useState(false);

    const filteredData = useMemo(() => {
        let result = [...data];

        // Apply search
        if (searchTerm.trim()) {
            const lowerSearch = searchTerm.toLowerCase();
            result = result.filter(item => 
                searchFields.some(field => {
                    const value = item[field];
                    if (value == null) return false;
                    return String(value).toLowerCase().includes(lowerSearch);
                })
            );
        }

        // Apply filters
        Object.entries(filters).forEach(([key, value]) => {
            if (!value || value === '') return;

            // Handle date range filters
            if (key.endsWith('From') || key.endsWith('To')) {
                const baseKey = key.replace(/From$|To$/, '');
                const dateField = baseKey === 'date' ? 'date' : baseKey;
                
                if (key.endsWith('From')) {
                    const fromDate = new Date(value);
                    result = result.filter(item => {
                        const itemDate = new Date((item as Record<string, unknown>)[dateField] as string || '');
                        return itemDate >= fromDate;
                    });
                } else if (key.endsWith('To')) {
                    const toDate = new Date(value);
                    result = result.filter(item => {
                        const itemDate = new Date((item as Record<string, unknown>)[dateField] as string || '');
                        return itemDate <= toDate;
                    });
                }
            } else {
                // Regular field filter
                result = result.filter(item => {
                    const itemValue = (item as Record<string, unknown>)[key];
                    if (itemValue == null) return false;
                    return String(itemValue).toLowerCase() === String(value).toLowerCase() ||
                           String(itemValue) === String(value);
                });
            }
        });

        return result;
    }, [data, searchTerm, filters, searchFields]);

    const setFilter = useCallback((key: string, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    const clearFilters = useCallback(() => {
        setFilters({});
        setSearchTerm('');
    }, []);

    const toggleFilters = useCallback(() => {
        setShowFilters(prev => !prev);
    }, []);

    return {
        searchTerm,
        setSearchTerm,
        filters,
        setFilter,
        clearFilters,
        showFilters,
        toggleFilters,
        filteredData,
        activeFilterCount: Object.values(filters).filter(v => v && v !== '').length
    };
}

export default useSearchFilter;

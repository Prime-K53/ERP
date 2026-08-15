import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2, Sparkles, TrendingUp, Hash, DollarSign, Calendar } from 'lucide-react';
import { interpretQuery, executeQuery, generateQuerySuggestions, type QueryResult, type QuerySuggestion } from '../services/naturalLanguageReportingService';
import { useApp } from '../context/AppContext';
import { useSales } from '../context/SalesContext';
import { useFinance } from '../context/FinanceContext';
import { useInventory } from '../context/InventoryContext';
import { useProcurement } from '../context/ProcurementContext';

const teal = {
  50: '#eef7f6', 100: '#d3ece9', 200: '#a6d9d3', 300: '#72c0b7',
  400: '#3fa294', 500: '#1f8577', 600: '#146b60', 700: '#0f544c',
  800: '#0b3e39', 900: '#082e2a'
};
const amber = { 100: '#fbead0', 300: '#eec27a', 500: '#d99a3f', 600: '#b97e2b' };
const paper = '#FEFDFB';
const ink = '#23282A';
const inkSoft = '#5c6567';
const hairline = '#e4ddd1';
const danger = '#b5493f';

const typeIconMap: Record<string, React.ReactNode> = {
  string: <Hash size={14} />,
  number: <Hash size={14} />,
  date: <Calendar size={14} />,
  currency: <DollarSign size={14} />,
};

const formatCellValue = (value: any, type: string): string => {
  if (value === null || value === undefined) return '-';
  if (type === 'currency') {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return `MWK ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (type === 'number') {
    const num = Number(value);
    if (isNaN(num)) return String(value);
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  if (type === 'date') {
    try {
      return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const NaturalLanguageReporting: React.FC = () => {
  const { companyConfig, notify } = useApp();
  const { sales, customers } = useSales();
  const { invoices, expenses } = useFinance();
  const { inventory } = useInventory();
  const { purchases } = useProcurement();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [suggestions, setSuggestions] = useState<QuerySuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const allData = { sales, invoices, expenses, customers, inventory: inventory || [], purchases };

  useEffect(() => {
    setSuggestions(generateQuerySuggestions());
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsLoading(true);
    setResult(null);
    try {
      const queryResult = executeQuery(trimmed, allData);
      await new Promise(resolve => setTimeout(resolve, 300));
      setResult(queryResult);
    } catch {
      notify('Failed to process query', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [query, allData, notify]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  }, [handleSubmit]);

  const handleSuggestionClick = useCallback((suggestion: QuerySuggestion) => {
    setQuery(suggestion.query);
    inputRef.current?.focus();
  }, []);

  const handleClear = useCallback(() => {
    setQuery('');
    setResult(null);
  }, []);

  const currencySymbol = companyConfig?.currencySymbol || 'MWK';

  const isNumericColumn = (col: any) => col.type === 'number' || col.type === 'currency';

  const getColumnTotals = () => {
    if (!result || !result.data.length) return null;
    const totals: Record<string, number> = {};
    result.columns.forEach(col => {
      if (isNumericColumn(col)) {
        totals[col.key] = result.data.reduce((sum: number, row: any) => {
          const val = Number(row[col.key]);
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      }
    });
    return totals;
  };

  const columnTotals = getColumnTotals();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100%',
      backgroundColor: paper,
      fontFamily: "'Inter','DM Sans',sans-serif",
      fontSize: 13.5,
      lineHeight: 1.5,
      color: ink,
      overflow: 'hidden',
    }}>
      <div style={{
        backgroundColor: paper,
        borderBottom: `1px solid ${hairline}`,
        flexShrink: 0,
        padding: '18px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${teal[500]}, ${teal[700]})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 2px 8px rgba(15,84,76,0.25)' }}>
            <Sparkles size={18} />
          </div>
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: teal[800], letterSpacing: '-0.02em', margin: 0 }}>
              Natural Language Reporting
            </h1>
            <p style={{ fontSize: 12, color: inkSoft, margin: '1px 0 0' }}>
              Ask questions about your business data in plain English
            </p>
          </div>
        </div>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '20px 24px',
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            background: paper,
            borderRadius: 14,
            border: `1.4px solid ${hairline}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            padding: '6px 6px 6px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <Search size={18} color={inkSoft} style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about your business... (e.g., 'Show unpaid invoices')"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 14,
                fontWeight: 500,
                color: ink,
                backgroundColor: 'transparent',
                padding: '11px 8px',
                fontFamily: "'Inter', sans-serif",
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  border: 'none',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  color: inkSoft,
                  padding: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 6,
                }}
              >
                <X size={16} />
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={isLoading || !query.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 18px',
                borderRadius: 9,
                border: 'none',
                background: !query.trim() ? hairline : `linear-gradient(135deg, ${teal[500]}, ${teal[700]})`,
                color: !query.trim() ? inkSoft : '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: !query.trim() ? 'not-allowed' : 'pointer',
                boxShadow: !query.trim() ? 'none' : '0 2px 8px rgba(15,84,76,0.3)',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {isLoading ? 'Thinking...' : 'Ask'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 20, flex: 1, minHeight: 0 }}>
            {/* Left Column: Suggested Queries as Cards */}
            <div style={{ width: 270, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
              {suggestions.length > 0 && (
                <div style={{
                  background: paper,
                  borderRadius: 14,
                  border: `1.4px solid ${hairline}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: inkSoft, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={10} color={teal[400]} />
                    Suggested Queries
                  </div>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(s)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 9,
                        border: `1px solid transparent`,
                        backgroundColor: 'transparent',
                        color: ink,
                        fontSize: 12.5,
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: "'Inter', sans-serif",
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.backgroundColor = teal[50]; e.currentTarget.style.borderColor = hairline; }}
                      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                      title={s.description}
                    >
                      <div style={{
                        width: 30, height: 30, borderRadius: 8,
                        background: teal[50],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, color: teal[500],
                      }}>
                        <Sparkles size={13} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.query}
                        </div>
                        <div style={{ fontSize: 10, color: inkSoft, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.description}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!result && !isLoading && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  padding: '32px 16px',
                  color: inkSoft,
                }}>
                  <Search size={36} style={{ marginBottom: 10, opacity: 0.3 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, color: inkSoft, margin: 0 }}>
                    Ask a question
                  </p>
                  <p style={{ fontSize: 11, margin: '4px 0 0', color: inkSoft }}>
                    Try clicking a suggestion
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Results */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
              {isLoading && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '18px 22px',
                  backgroundColor: teal[50],
                  borderRadius: 12,
                  border: `1px solid ${teal[100]}`,
                }}>
                  <Loader2 size={18} className="animate-spin" color={teal[500]} />
                  <div>
                    <p style={{ fontWeight: 600, color: teal[700], margin: 0, fontSize: 13 }}>
                      Processing your query...
                    </p>
                    <p style={{ color: teal[500], margin: '2px 0 0', fontSize: 12 }}>
                      Analyzing business data for "{query}"
                    </p>
                  </div>
                </div>
              )}

              {result && (
                <div style={{
                  background: paper,
                  borderRadius: 14,
                  border: `1.4px solid ${hairline}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  padding: '20px',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 16,
                  }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 400, fontFamily: "'DM Serif Display', 'Georgia', serif", color: ink, margin: 0, letterSpacing: '-0.01em' }}>
                        {result.title}
                      </h2>
                      <p style={{ fontSize: 13, color: inkSoft, margin: '4px 0 0' }}>
                        {result.description}
                      </p>
                    </div>
                    <button
                      onClick={handleClear}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 14px',
                        borderRadius: 8,
                        border: `1px solid ${hairline}`,
                        backgroundColor: paper,
                        color: inkSoft,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      <X size={14} />
                      Clear
                    </button>
                  </div>

                  {result.summary && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '12px 18px',
                      backgroundColor: teal[50],
                      borderRadius: 10,
                      border: `1px solid ${teal[100]}`,
                      marginBottom: 16,
                    }}>
                      <TrendingUp size={16} color={teal[600]} />
                      <p style={{ color: teal[700], fontWeight: 500, margin: 0, fontSize: 13 }}>
                        {result.summary}
                      </p>
                    </div>
                  )}

                  {result.columns.length > 0 && result.data.length > 0 && (
                    <div style={{
                      border: `1px solid ${hairline}`,
                      borderRadius: 12,
                      overflow: 'hidden',
                    }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: 13,
                        }}>
                          <thead>
                            <tr style={{ backgroundColor: teal[50], borderBottom: `1px solid ${hairline}` }}>
                              {result.columns.map(col => (
                                <th
                                  key={col.key}
                                  style={{
                                    textAlign: isNumericColumn(col) ? 'right' : 'left',
                                    padding: '10px 14px',
                                    fontWeight: 700,
                                    fontSize: 11,
                                    color: teal[800],
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: isNumericColumn(col) ? 'flex-end' : 'flex-start' }}>
                                    {typeIconMap[col.type] || null}
                                    {col.label}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.data.map((row: any, i: number) => (
                              <tr
                                key={i}
                                style={{
                                  borderBottom: `1px solid ${hairline}`,
                                  backgroundColor: i % 2 === 0 ? paper : '#fafbfc',
                                }}
                              >
                                {result.columns.map(col => (
                                  <td
                                    key={col.key}
                                    style={{
                                      textAlign: isNumericColumn(col) ? 'right' : 'left',
                                      padding: '8px 14px',
                                      fontWeight: isNumericColumn(col) ? 600 : 400,
                                      color: ink,
                                      fontVariantNumeric: isNumericColumn(col) ? 'tabular-nums' : 'normal',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {formatCellValue(row[col.key], col.type)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                          {columnTotals && (
                            <tfoot>
                              <tr style={{ borderTop: `2px solid ${hairline}`, backgroundColor: teal[50] }}>
                                {result.columns.map(col => (
                                  <td
                                    key={col.key}
                                    style={{
                                      textAlign: isNumericColumn(col) ? 'right' : 'left',
                                      padding: '10px 14px',
                                      fontWeight: 700,
                                      color: ink,
                                      fontSize: 13,
                                      fontVariantNumeric: 'tabular-nums',
                                    }}
                                  >
                                    {isNumericColumn(col) ? formatCellValue(columnTotals[col.key], col.type) : col.key === result.columns[0].key ? 'Total' : ''}
                                  </td>
                                ))}
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      <div style={{
                        padding: '8px 14px',
                        borderTop: `1px solid ${hairline}`,
                        fontSize: 11,
                        color: inkSoft,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}>
                        <span>{result.data.length} row(s)</span>
                        <span>{result.type.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                  )}

                  {result.data.length === 0 && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px 20px',
                      color: inkSoft,
                    }}>
                      <Search size={36} style={{ opacity: 0.2, marginBottom: 10 }} />
                      <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: inkSoft }}>
                        No results found
                      </p>
                      <p style={{ fontSize: 12, margin: '4px 0 0' }}>
                        {result.summary}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NaturalLanguageReporting;

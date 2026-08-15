/**
 * Report Export Service for Prime ERP
 * Handles exporting reports to various formats (CSV, Excel, PDF, JSON)
 */

import { ReportResult, ReportColumn, ExportFormat } from '../types/reports';
import { logger } from './logger';

// Export options interface
export interface ExportOptions {
  format: ExportFormat;
  fileName?: string;
  includeHeaders?: boolean;
  includeSummary?: boolean;
  includeCharts?: boolean;
  dateFormat?: string;
  currencyFormat?: string;
  encoding?: string;
  pageSize?: 'letter' | 'a4' | 'legal';
  orientation?: 'portrait' | 'landscape';
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  headerTemplate?: string;
  footerTemplate?: string;
}

// Default export options
const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'csv',
  includeHeaders: true,
  includeSummary: true,
  includeCharts: false,
  dateFormat: 'yyyy-MM-dd',
  currencyFormat: 'USD',
  encoding: 'utf-8',
  pageSize: 'letter',
  orientation: 'portrait',
  margins: { top: 20, right: 20, bottom: 20, left: 20 },
};

class ReportExportService {
  /**
   * Export a report to the specified format
   */
  async exportReport(
    result: ReportResult,
    options: Partial<ExportOptions> = {}
  ): Promise<Blob | string | void> {
    const exportOptions: ExportOptions = { ...DEFAULT_EXPORT_OPTIONS, ...options };
    
    try {
      logger.info('Starting report export', {
        reportId: result.id,
        format: exportOptions.format,
      });

      switch (exportOptions.format) {
        case 'csv':
          return this.exportToCSV(result, exportOptions);
        case 'json':
          return this.exportToJSON(result, exportOptions);
        case 'excel':
          return await this.exportToExcel(result, exportOptions);
        case 'pdf':
          return await this.exportToPDF(result, exportOptions);
        case 'print':
          return this.exportToPrint(result, exportOptions);
        default:
          throw new Error(`Unsupported export format: ${exportOptions.format}`);
      }
    } catch (error) {
      logger.error('Report export failed', error as Error, {
        reportId: result.id,
        format: exportOptions.format,
      });
      throw error;
    }
  }

  /**
   * Export report to CSV format
   */
  exportToCSV(result: ReportResult, options: ExportOptions): string {
    const columns = result.columns.filter(c => !c.hidden);
    const rows: string[] = [];

    // Add headers if requested
    if (options.includeHeaders) {
      const headers = columns.map(c => this.escapeCSVValue(c.label));
      rows.push(headers.join(','));
    }

    // Add data rows
    result.rows.forEach(row => {
      const values = columns.map(col => {
        const value = row[col.field];
        return this.escapeCSVValue(this.formatValue(value, col, options));
      });
      rows.push(values.join(','));
    });

    // Add summary if requested
    if (options.includeSummary && result.summary) {
      rows.push(''); // Empty row as separator
      rows.push('Summary');
      
      columns.forEach(col => {
        if (col.aggregation && result.summary![col.id] !== undefined) {
          const summaryValue = this.formatValue(result.summary![col.id], col, options);
          rows.push(`${this.escapeCSVValue(col.label)},${this.escapeCSVValue(summaryValue)}`);
        }
      });
    }

    const csv = rows.join('\n');
    
    // Trigger download if in browser
    if (typeof window !== 'undefined') {
      this.downloadFile(csv, `${options.fileName || result.reportName}.csv`, 'text/csv;charset=utf-8;');
    }
    
    return csv;
  }

  /**
   * Export report to JSON format
   */
  exportToJSON(result: ReportResult, options: ExportOptions): string {
    const exportData: any = {
      metadata: {
        reportName: result.reportName,
        generatedAt: result.generatedAt,
        generatedBy: result.generatedBy,
        totalRows: result.totalRows,
        executionTimeMs: result.executionTimeMs,
      },
      columns: result.columns.filter(c => !c.hidden).map(c => ({
        id: c.id,
        field: c.field,
        label: c.label,
        type: c.type,
      })),
      data: result.rows,
    };

    if (options.includeSummary && result.summary) {
      exportData.summary = result.summary;
    }

    if (options.includeCharts && result.chartData) {
      exportData.charts = result.chartData;
    }

    const json = JSON.stringify(exportData, null, 2);
    
    // Trigger download if in browser
    if (typeof window !== 'undefined') {
      this.downloadFile(json, `${options.fileName || result.reportName}.json`, 'application/json');
    }
    
    return json;
  }

  /**
   * Export report to Excel format (using CSV with Excel-compatible formatting)
   * Note: For true Excel export, you would use a library like xlsx or exceljs
   */
  async exportToExcel(result: ReportResult, options: ExportOptions): Promise<Blob> {
    // For now, we'll create a CSV that Excel can open
    // In a production environment, you would use a library like xlsx or exceljs
    const csv = this.exportToCSV(result, { ...options, format: 'csv' });
    
    // Create blob with BOM for Excel to recognize UTF-8
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    
    // Trigger download
    if (typeof window !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${options.fileName || result.reportName}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
    
    return blob;
  }

  /**
   * Export report to PDF format
   * Note: For true PDF export, you would use a library like jsPDF or pdfmake
   */
  async exportToPDF(result: ReportResult, options: ExportOptions): Promise<Blob> {
    // Create a printable HTML version
    const html = this.generatePrintableHTML(result, options);
    
    // For a production environment, you would use a PDF library
    // Here we'll create a simple PDF-like blob using HTML
    const blob = new Blob([html], { type: 'text/html' });
    
    // Open in new window for printing
    if (typeof window !== 'undefined') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
    }
    
    return blob;
  }

  /**
   * Export report to print
   */
  exportToPrint(result: ReportResult, options: ExportOptions): void {
    const html = this.generatePrintableHTML(result, options);
    
    if (typeof window !== 'undefined') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      }
    }
  }

  /**
   * Generate printable HTML
   */
  private generatePrintableHTML(result: ReportResult, options: ExportOptions): string {
    const columns = result.columns.filter(c => !c.hidden);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${result.reportName}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.4;
            color: #333;
            padding: ${options.margins?.top || 20}px;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
          }
          .header h1 {
            font-size: 18pt;
            margin-bottom: 5px;
          }
          .header .meta {
            font-size: 9pt;
            color: #666;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6px 8px;
            text-align: left;
          }
          th {
            background-color: #f5f5f5;
            font-weight: bold;
            font-size: 9pt;
            text-transform: uppercase;
          }
          td {
            font-size: 9pt;
          }
          tr:nth-child(even) {
            background-color: #fafafa;
          }
          .summary {
            margin-top: 20px;
            padding: 15px;
            background-color: #f5f5f5;
            border: 1px solid #ddd;
          }
          .summary h3 {
            margin-bottom: 10px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
          }
          .summary-item {
            padding: 8px;
            background: white;
            border: 1px solid #ddd;
          }
          .summary-item .label {
            font-size: 8pt;
            color: #666;
            text-transform: uppercase;
          }
          .summary-item .value {
            font-size: 12pt;
            font-weight: bold;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 8pt;
            color: #999;
            border-top: 1px solid #ddd;
            padding-top: 10px;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${result.reportName}</h1>
          <div class="meta">
            Generated: ${new Date(result.generatedAt).toLocaleString()}
            ${result.generatedBy ? ` | By: ${result.generatedBy}` : ''}
            | Total Records: ${result.totalRows}
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              ${columns.map(col => `<th>${this.escapeHTML(col.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${result.rows.map(row => `
              <tr>
                ${columns.map(col => `<td>${this.escapeHTML(this.formatValue(row[col.field], col, options))}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
          ${result.summary && columns.some(c => c.aggregation) ? `
          <tfoot>
            <tr style="background-color: #f0f0f0; font-weight: bold;">
              ${columns.map(col => `
                <td>
                  ${col.aggregation && result.summary![col.id] !== undefined 
                    ? this.formatValue(result.summary![col.id], col, options)
                    : ''}
                </td>
              `).join('')}
            </tr>
          </tfoot>
          ` : ''}
        </table>
        
        ${options.includeSummary && result.summary ? `
        <div class="summary">
          <h3>Summary</h3>
          <div class="summary-grid">
            ${columns
              .filter(col => col.aggregation && result.summary![col.id] !== undefined)
              .map(col => `
                <div class="summary-item">
                  <div class="label">${col.label} (${col.aggregation?.toUpperCase()})</div>
                  <div class="value">${this.formatValue(result.summary![col.id], col, options)}</div>
                </div>
              `).join('')}
            <div class="summary-item">
              <div class="label">Total Rows</div>
              <div class="value">${result.totalRows}</div>
            </div>
            <div class="summary-item">
              <div class="label">Execution Time</div>
              <div class="value">${result.executionTimeMs}ms</div>
            </div>
          </div>
        </div>
        ` : ''}
        
        <div class="footer">
          <p>Prime ERP System - Report generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <div class="no-print" style="margin-top: 20px; text-align: center;">
          <button onclick="window.print()" style="padding: 10px 20px; font-size: 12pt; cursor: pointer;">
            Print Report
          </button>
          <button onclick="window.close()" style="padding: 10px 20px; font-size: 12pt; cursor: pointer; margin-left: 10px;">
            Close
          </button>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Format a value based on column type
   */
  private formatValue(value: any, column: ReportColumn, options: ExportOptions): string {
    if (value === null || value === undefined) return '';
    
    switch (column.type) {
      case 'currency':
        const numValue = Number(value);
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: options.currencyFormat || 'USD',
        }).format(numValue);
      
      case 'percentage':
        return `${(Number(value) * 100).toFixed(2)}%`;
      
      case 'date':
        try {
          const date = new Date(value);
          return date.toLocaleDateString();
        } catch {
          return String(value);
        }
      
      case 'boolean':
        return value ? 'Yes' : 'No';
      
      case 'number':
        return new Intl.NumberFormat('en-US', {
          minimumFractionDigits: column.decimals || 0,
          maximumFractionDigits: column.decimals || 2,
        }).format(Number(value));
      
      default:
        return String(value);
    }
  }

  /**
   * Escape a value for CSV
   */
  private escapeCSVValue(value: string): string {
    if (value === null || value === undefined) return '';
    
    const strValue = String(value);
    
    // If the value contains comma, quote, or newline, wrap in quotes
    if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n') || strValue.includes('\r')) {
      // Escape quotes by doubling them
      return `"${strValue.replace(/"/g, '""')}"`;
    }
    
    return strValue;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHTML(value: string): string {
    if (value === null || value === undefined) return '';
    
    const strValue = String(value);
    
    return strValue
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Download a file
   */
  private downloadFile(content: string, filename: string, mimeType: string): void {
    if (typeof window === 'undefined') return;
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Get available export formats
   */
  getAvailableFormats(): Array<{ value: ExportFormat; label: string; description: string }> {
    return [
      { value: 'csv', label: 'CSV', description: 'Comma-separated values, compatible with Excel' },
      { value: 'json', label: 'JSON', description: 'JavaScript Object Notation, for data interchange' },
      { value: 'excel', label: 'Excel', description: 'Microsoft Excel spreadsheet format' },
      { value: 'pdf', label: 'PDF', description: 'Portable Document Format, for printing' },
      { value: 'print', label: 'Print', description: 'Print the report directly' },
    ];
  }

  /**
   * Validate export options
   */
  validateOptions(options: Partial<ExportOptions>): string[] {
    const errors: string[] = [];

    if (!options.format) {
      errors.push('Export format is required');
    }

    const validFormats: ExportFormat[] = ['csv', 'json', 'excel', 'pdf', 'print'];
    if (options.format && !validFormats.includes(options.format)) {
      errors.push(`Invalid export format: ${options.format}`);
    }

    if (options.pageSize && !['letter', 'a4', 'legal'].includes(options.pageSize)) {
      errors.push('Page size must be letter, a4, or legal');
    }

    if (options.orientation && !['portrait', 'landscape'].includes(options.orientation)) {
      errors.push('Orientation must be portrait or landscape');
    }

    return errors;
  }
}

// Export singleton instance
export const reportExportService = new ReportExportService();

// Export class for testing
export { ReportExportService };

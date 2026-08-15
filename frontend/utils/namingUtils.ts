/**
 * Utility for standardized file naming in the Prime ERP System.
 * Generates SEO-friendly and human-readable filenames for document exports.
 */

interface DocumentMetadata {
  type: string;        // e.g., 'Invoice', 'Statement', 'Receipt'
  id: string;          // e.g., 'INV-2023-001'
  customerName: string; // e.g., 'Acme Corp'
}

/**
 * Generates a standardized filename for PDF exports.
 * Format: [TYPE]-[ID]_[CustomerName].pdf
 * Example: INV-2023-001_AcmeCorp.pdf
 */
export function generateDocumentFilename(metadata: DocumentMetadata): string {
  const { type, id, customerName } = metadata;
  
  // Clean type (uppercase prefix)
  const typePrefix = type.substring(0, 3).toUpperCase();
  
  // Clean customer name: Remove special characters, replace spaces with CamelCase or underscores
  const cleanCustomerName = customerName
    .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
    .split(/\s+/)                  // Split by whitespace
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Title Case
    .join('');                     // Join to form CamelCase
    
  return `${typePrefix}-${id}_${cleanCustomerName}.pdf`;
}

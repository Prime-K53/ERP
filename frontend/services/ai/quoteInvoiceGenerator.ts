import { aiService } from './aiService';
import { parseAIResponse, type AIQuoteResult } from '../../utils/aiQuoteParser';

const SYSTEM_PROMPT = `You are a quotation and invoice generator for an ERP system.
Extract structured data from the user's natural language description.
Return ONLY valid JSON. No markdown. No explanations.

Schema:
{
  "documentType": "quotation" | "invoice",
  "customer": {
    "name": "",
    "email": "",
    "phone": "",
    "address": ""
  },
  "items": [
    {
      "description": "",
      "quantity": 1,
      "unitPrice": 0,
      "taxRate": 0
    }
  ],
  "discount": {
    "type": "percentage" | "fixed",
    "value": 0
  },
  "notes": "",
  "dueDate": "",
  "paymentTerms": ""
}

Rules:
- Extract customer name, email, phone, address. Leave empty if missing. Never invent.
- Extract each service or product as a separate item with description, quantity, unit price.
- If prices are missing, use 0.
- If tax rate is mentioned (e.g. "VAT 15%"), set taxRate. Otherwise 0.
- Extract discount type and value. Default to percentage if unspecified.
- Extract notes, due date, payment terms if mentioned.
- If the user says "invoice" or "create an invoice", set documentType to "invoice".
- If the user says "quotation", "quote", or "estimate", set documentType to "quotation".
- Default to "quotation" if not specified.
- Return ONLY valid JSON. No markdown formatting, no code blocks, no explanations.`;

const FILE_EXTRACTION_PROMPT = `You are an OCR extraction assistant for an ERP system.
Extract quotation or invoice data from the provided document image.
Return ONLY valid JSON matching this schema:
{
  "documentType": "quotation" | "invoice",
  "customer": { "name": "", "email": "", "phone": "", "address": "" },
  "items": [{ "description": "", "quantity": 1, "unitPrice": 0, "taxRate": 0 }],
  "discount": { "type": "percentage" | "fixed", "value": 0 },
  "notes": "",
  "dueDate": "",
  "paymentTerms": ""
}

Rules:
- If this is clearly an invoice, set documentType to "invoice". If it looks like a quote/estimate/proforma, use "quotation".
- Extract customer details if visible. Leave empty if missing. Never invent.
- Extract each line item with description, quantity, unit price.
- If a tax/VAT rate is visible on the document, set it per item or omit if not found.
- Extract any discount, notes, due date, payment terms if visible.
- Return ONLY valid JSON. No markdown. No explanations.`;

export async function generateQuoteFromDescription(
  description: string,
  documentType: 'quotation' | 'invoice'
): Promise<AIQuoteResult> {
  const prompt = `Generate a ${documentType} from this description:\n\n${description}\n\nReturn the JSON object with documentType set to "${documentType}".`;

  const raw = await aiService.generateAIResponse(prompt, SYSTEM_PROMPT);

  return parseAIResponse(raw);
}

export async function extractQuoteFromFile(
  fileBase64: string,
  documentType: 'quotation' | 'invoice'
): Promise<AIQuoteResult> {
  const raw = await aiService.extractFileData(
    fileBase64,
    FILE_EXTRACTION_PROMPT,
    `Extract ${documentType} data from this document and return JSON with documentType set to "${documentType}".`
  );
  return parseAIResponse(raw);
}

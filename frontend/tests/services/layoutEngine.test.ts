import { describe, it, expect } from 'vitest';
import { LayoutEngine } from '../../services/layoutEngine';
import { TextElement, ImageElement } from '../../../contracts/LayoutBlueprint';

describe('LayoutEngine Empty Placeholder Guard', () => {
  const engine = new LayoutEngine();

  describe('resolvePlaceholders', () => {
    it('should replace undefined placeholders with empty string', () => {
      const template = 'Hello {{name}}, your order {{orderId}} is ready';
      const payload = { name: 'John' }; // orderId is missing
      const result = engine['resolvePlaceholders'](template, payload);
      expect(result).toBe('Hello John, your order  is ready');
    });

    it('should replace null placeholders with empty string', () => {
      const template = 'Price: {{price}}';
      const payload = { price: null };
      const result = engine['resolvePlaceholders'](template, payload);
      expect(result).toBe('Price: ');
    });

    it('should keep valid placeholders unchanged', () => {
      const template = 'Hello {{name}}';
      const payload = { name: 'Alice' };
      const result = engine['resolvePlaceholders'](template, payload);
      expect(result).toBe('Hello Alice');
    });

    it('should handle multiple missing placeholders', () => {
      const template = '{{greeting}} {{name}}, your {{item}} is {{status}}';
      const payload = { greeting: 'Hello', status: 'shipped' };
      const result = engine['resolvePlaceholders'](template, payload);
      expect(result).toBe('Hello , your  is shipped');
    });

    it('should return empty string for empty template', () => {
      const result = engine['resolvePlaceholders']('', {});
      expect(result).toBe('');
    });

    it('should handle numeric zero correctly (not treat as missing)', () => {
      const template = 'Quantity: {{qty}}';
      const payload = { qty: 0 };
      const result = engine['resolvePlaceholders'](template, payload);
      expect(result).toBe('Quantity: 0');
    });

    it('should handle empty string values correctly', () => {
      const template = 'Notes: {{notes}}';
      const payload = { notes: '' };
      const result = engine['resolvePlaceholders'](template, payload);
      expect(result).toBe('Notes: ');
    });
  });

  describe('resolveNode with text elements', () => {
    it('should resolve text content with missing placeholders', () => {
      const blueprint = {
        type: 'text',
        content: 'Customer: {{customerName}}, Phone: {{phone}}'
      };
      const payload = { customerName: 'Bob' };
      const result = engine['resolveNode'](blueprint, payload) as TextElement;
      expect(result.content).toBe('Customer: Bob, Phone: ');
    });

    it('should resolve image URLs with missing placeholders', () => {
      const blueprint = {
        type: 'image',
        url: 'https://example.com/{{imageId}}.jpg'
      };
      const payload = {}; // imageId missing
      const result = engine['resolveNode'](blueprint, payload) as ImageElement;
      expect(result.url).toBe('https://example.com/.jpg');
    });
  });

  describe('resolveTable with missing placeholders', () => {
    it('should resolve table cell content with missing placeholders', () => {
      const table = {
        type: 'table',
        rows: [
          {
            cells: {
              col1: { type: 'text', content: 'Name: {{name}}' },
              col2: { type: 'text', content: 'Price: {{price}}' }
            }
          }
        ]
      };
      const payload = { name: 'Product A' }; // price missing
      engine['resolveTable'](table, payload);
      const result = table.rows[0].cells.col1.content;
      expect(result).toBe('Name: Product A');
      expect(table.rows[0].cells.col2.content).toBe('Price: ');
    });
  });
});

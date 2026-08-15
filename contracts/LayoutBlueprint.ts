/**
 * @file LayoutBlueprint.ts
 * @description Renderer-agnostic layout blueprint system for ERP documents.
 * This system translates raw data payloads into a visual hierarchy of primitives.
 */

/**
 * Units of measurement for the layout. 
 * 'mm' is preferred for physical documents like A4.
 */
export type LayoutUnit = 'mm' | 'pt' | 'px';

export interface LayoutDimensions {
  width: number;
  height: number;
  unit: LayoutUnit;
}

export interface LayoutMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Abstract styling properties.
 * These are mapped by the renderer (e.g., Canvas, SVG, or Native UI).
 */
export interface LayoutStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold' | '500' | '600';
  color?: string;       // Hex or Abstract color name
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  border?: {
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
    color: string;
    edges: ('top' | 'bottom' | 'left' | 'right')[];
  };
  padding?: LayoutMargin;
}

/**
 * Base primitive for all layout elements.
 */
export interface LayoutElement {
  type: 'container' | 'text' | 'image' | 'line' | 'table' | 'spacer';
  id?: string;
  style?: LayoutStyle;
  flex?: number;        // For flow-based layouts
  width?: number | 'auto' | '100%';
  height?: number | 'auto';
  
  /**
   * Optional logic to determine if this element should be rendered.
   * Useful if the blueprint is a template-blueprint hybrid.
   */
  condition?: {
    field: string;      // Dot-notation path in the payload
    operator: 'eq' | 'neq' | 'gt' | 'lt' | 'exists';
    value?: any;
  };
}

export interface ContainerElement extends LayoutElement {
  type: 'container';
  layout: 'vertical' | 'horizontal' | 'stack';
  children: LayoutNode[];
}

export interface TextElement extends LayoutElement {
  type: 'text';
  content: string;
  multiline?: boolean;
}

export interface LineElement extends LayoutElement {
  type: 'line';
  orientation: 'horizontal' | 'vertical';
  thickness: number;
  color: string;
}

export interface TableElement extends LayoutElement {
  type: 'table';
  columns: {
    id: string;
    header: string;
    width: number | 'auto'; // Weight or absolute mm
    align?: 'left' | 'center' | 'right';
  }[];
  rows: {
    cells: Record<string, LayoutNode>; // Map column ID to content
  }[];
  showHeaders: boolean;
}

export interface ImageElement extends LayoutElement {
  type: 'image';
  url: string; // Remote URL or Base64
  alt?: string;
  fit?: 'contain' | 'cover' | 'fill';
}

export type LayoutNode = 
  | ContainerElement 
  | TextElement 
  | ImageElement
  | LineElement 
  | TableElement;

/**
 * A logical section of the document.
 */
export interface LayoutSection {
  id: string;
  role: 'header' | 'footer' | 'content' | 'watermark';
  repeat: 'every-page' | 'first-page' | 'last-page' | 'none';
  content: LayoutNode;
}

/**
 * The Root Layout Blueprint.
 */
export interface LayoutBlueprint {
  metadata: {
    id: string;
    title: string;
    documentType: string; // 'invoice' | 'purchase_order' | 'delivery_note' | etc.
    pageSize: 'A4' | 'Letter' | LayoutDimensions;
    orientation: 'portrait' | 'landscape';
    margins: LayoutMargin;
    unit: LayoutUnit;
    security?: {
      watermark?: string;
      showDigitalSignaturePlaceholder?: boolean;
    };
  };
  
  // Sections that stay fixed relative to pages
  fixedSections: LayoutSection[];
  
  // The main flow of the document that can span multiple pages
  flowSections: {
    id: string;
    elements: LayoutNode[];
    allowPageBreakInside?: boolean;
  }[];
}

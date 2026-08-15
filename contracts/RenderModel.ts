/**
 * @file RenderModel.ts
 * @description The final output of the Layout Engine. 
 * Contains absolute coordinates and sizes for every element, organized by page.
 */

import { LayoutUnit, LayoutStyle } from './LayoutBlueprint';

export interface RenderBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderElement {
  type: 'text' | 'image' | 'line' | 'rect';
  box: RenderBox;
  style: LayoutStyle;
}

export interface RenderText extends RenderElement {
  type: 'text';
  content: string;
}

export interface RenderLine extends RenderElement {
  type: 'line';
  thickness: number;
}

export interface RenderRect extends RenderElement {
  type: 'rect';
}

export interface RenderImage extends RenderElement {
  type: 'image';
  url: string;
}

export type RenderNode = RenderText | RenderImage | RenderLine | RenderRect;

export interface RenderPage {
  pageNumber: number;
  width: number;
  height: number;
  unit: LayoutUnit;
  elements: RenderNode[];
}

export interface RenderSecurity {
  watermark?: {
    text: string;
    opacity: number;
    angle: number; // in degrees
  };
  signature?: {
    signerName: string;
    signedAt: string;
    hash: string;
    qrCodeContent?: string; // Verification URL
  };
  isFinalized: boolean;
}

export interface RenderModel {
  totalPages: number;
  pages: RenderPage[];
  security?: RenderSecurity;
  metadata: {
    generatedAt: string;
    title: string;
    documentType: string; // e.g., 'invoice', 'delivery_note', 'audit_report'
  };
}

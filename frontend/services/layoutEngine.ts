import { 
  LayoutBlueprint, 
  LayoutNode, 
  ContainerElement, 
  TextElement, 
  ImageElement,
  TableElement, 
  LineElement,
  LayoutSection,
  LayoutMargin
} from '../../contracts/LayoutBlueprint';
import { 
  RenderModel, 
  RenderPage, 
  RenderNode, 
  RenderText, 
  RenderImage,
  RenderLine, 
  RenderRect 
} from '../../contracts/RenderModel';

/**
 * LayoutEngine handles the transformation of a LayoutBlueprint into a RenderModel.
 * It performs coordinate calculation, pagination, and section repeating.
 */
export class LayoutEngine {
  private unit: string = 'mm';
  private pageWidth: number = 210;
  private pageHeight: number = 297;
  private margins: LayoutMargin = { top: 10, right: 10, bottom: 10, left: 10 };
  
  private pages: RenderPage[] = [];
  private currentY: number = 0;
  private headerHeight: number = 0;
  private footerHeight: number = 0;

  constructor() {}

  /**
   * Binds a data payload to a template blueprint.
   * Replaces {{path}} expressions in text and populates tables.
   */
  public calculate(payload: any, template: LayoutBlueprint): LayoutBlueprint {
    // Deep clone the template to avoid side effects
    const blueprint: LayoutBlueprint = JSON.parse(JSON.stringify(template));

    // 1. Process Fixed Sections
    blueprint.fixedSections.forEach(section => {
      section.content = this.resolveNode(section.content, payload) as LayoutNode;
    });

    // 2. Process Flow Sections
    blueprint.flowSections.forEach(section => {
      section.elements = section.elements.flatMap(element => {
        const resolved = this.resolveNode(element, payload);
        return Array.isArray(resolved) ? resolved : [resolved];
      });
    });

    return blueprint;
  }

  private resolveNode(node: LayoutNode, payload: any): LayoutNode | LayoutNode[] {
    // Handle conditional rendering
    const condNode = node as LayoutNode & { condition?: { field: string; operator: string; value: unknown } };
    if (condNode.condition) {
      const condition = condNode.condition;
      const value = this.getValueByPath(payload, condition.field);
      const isMet = this.evaluateCondition(value, condition.operator, condition.value);
      if (!isMet) return [];
    }

    const resolvedNode = { ...node };

    if (resolvedNode.type === 'text') {
      (resolvedNode as TextElement).content = this.resolvePlaceholders((resolvedNode as TextElement).content, payload);
    } else if (resolvedNode.type === 'image') {
      (resolvedNode as ImageElement).url = this.resolvePlaceholders((resolvedNode as ImageElement).url, payload);
    } else if (resolvedNode.type === 'container') {
      (resolvedNode as ContainerElement).children = (resolvedNode as ContainerElement).children.flatMap(child => {
        const resolved = this.resolveNode(child, payload);
        return Array.isArray(resolved) ? resolved : [resolved];
      });
    } else if (resolvedNode.type === 'table') {
      this.resolveTable(resolvedNode as TableElement, payload);
    }

    return resolvedNode;
  }

  private resolvePlaceholders(text: string, payload: any): string {
    if (!text) return '';
    return text.replace(/\{\{([\w\.]+)\}\}/g, (match, path) => {
      const value = this.getValueByPath(payload, path);
      // Guard against empty/undefined placeholders - replace with empty string instead of showing raw placeholder
      if (value === undefined || value === null) {
        return '';
      }
      return String(value);
    });
  }

  private getValueByPath(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }

  private evaluateCondition(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'eq': return actual === expected;
      case 'neq': return actual !== expected;
      case 'gt': return actual > expected;
      case 'lt': return actual < expected;
      case 'exists': return actual !== undefined && actual !== null;
      default: return true;
    }
  }

  private resolveTable(table: TableElement, payload: any) {
    // If the table has a dataSource binding (custom extension)
    const dataSourcePath = (table as TableElement & { dataSource?: string }).dataSource;
    if (dataSourcePath) {
      const items = this.getValueByPath(payload, dataSourcePath);
      if (Array.isArray(items)) {
        const templateRow = table.rows[0]; // Assume first row is the template
        if (templateRow) {
          table.rows = items.map(item => {
            const resolvedRow = JSON.parse(JSON.stringify(templateRow));
            Object.keys(resolvedRow.cells).forEach(colId => {
              const cell = resolvedRow.cells[colId];
              if (cell.type === 'text') {
                cell.content = this.resolvePlaceholders(cell.content, { ...payload, item });
              }
            });
            return resolvedRow;
          });
        }
        return;
      }
    }
    // Normal resolution for existing rows (or when dataSourcePath exists but items is not an array)
    table.rows.forEach(row => {
      Object.keys(row.cells).forEach(colId => {
        const cell = row.cells[colId];
        if (cell.type === 'text') {
          cell.content = this.resolvePlaceholders(cell.content, payload);
        }
      });
    });
  }

  /**
   * Main entry point to generate a render model.
   */
  public generate(blueprint: LayoutBlueprint): RenderModel {
    this.reset(blueprint);
    
    // 1. Calculate fixed section heights (headers/footers)
    this.calculateFixedHeights(blueprint.fixedSections);

    // 2. Start first page
    this.addNewPage();

    // 3. Process Flow Sections
    for (const section of blueprint.flowSections) {
      for (const element of section.elements) {
        this.processElement(element);
      }
    }

    // 4. Post-process: Add fixed sections to every page
    this.applyFixedSections(blueprint.fixedSections);

    return {
      totalPages: this.pages.length,
      pages: this.pages,
      security: {
        watermark: blueprint.metadata.security?.watermark ? {
          text: blueprint.metadata.security.watermark,
          opacity: 0.1,
          angle: 45
        } : undefined,
        isFinalized: false // Will be set by DocumentService
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        title: blueprint.metadata.title,
        documentType: blueprint.metadata.documentType || 'generic'
      }
    };
  }

  private reset(blueprint: LayoutBlueprint) {
    this.pages = [];
    this.unit = blueprint.metadata.unit;
    this.margins = blueprint.metadata.margins;
    
    if (blueprint.metadata.pageSize === 'A4') {
      this.pageWidth = 210;
      this.pageHeight = 297;
    } else if (typeof blueprint.metadata.pageSize === 'object') {
      this.pageWidth = blueprint.metadata.pageSize.width;
      this.pageHeight = blueprint.metadata.pageSize.height;
    }
  }

  private addNewPage() {
    const pageNumber = this.pages.length + 1;
    this.pages.push({
      pageNumber,
      width: this.pageWidth,
      height: this.pageHeight,
      unit: this.unit as 'mm' | 'cm' | 'in',
      elements: []
    });
    // Start Y after margin and header
    this.currentY = this.margins.top + this.headerHeight;
  }

  private calculateFixedHeights(sections: LayoutSection[]) {
    // Simplified: in a real engine, we'd pre-render the container to get its height
    // For now, we assume fixed heights or calculate based on children
    this.headerHeight = 20; // Default buffer
    this.footerHeight = 15; // Default buffer
  }

  private processElement(node: LayoutNode, availableWidth?: number) {
    const width = availableWidth || (this.pageWidth - this.margins.left - this.margins.right);
    const estimatedHeight = this.estimateHeight(node, width);

    // Check for page break
    const bottomLimit = this.pageHeight - this.margins.bottom - this.footerHeight;
    if (this.currentY + estimatedHeight > bottomLimit) {
      this.addNewPage();
    }

    this.renderNodeToPage(node, this.margins.left, this.currentY, width);
    this.currentY += estimatedHeight;
  }

  private estimateHeight(node: LayoutNode, width: number): number {
    switch (node.type) {
      case 'text':
        // Rough estimation: 1mm per 3 characters for standard font size at this width
        // In real engine, we'd use a font metrics library
        const lines = Math.ceil((node as TextElement).content.length / (width / 2));
        return lines * 5; 
      case 'line':
        return (node as LineElement).thickness + 2;
      case 'image':
        return node.height && typeof node.height === 'number' ? node.height : 20;
      case 'container':
        const container = node as ContainerElement;
        if (container.layout === 'vertical') {
          return container.children.reduce((sum, child) => sum + this.estimateHeight(child, width), 0);
        }
        return Math.max(...container.children.map(child => this.estimateHeight(child, width / container.children.length)));
      case 'table':
        const table = node as TableElement;
        const rowHeight = 8;
        return (table.rows.length + (table.showHeaders ? 1 : 0)) * rowHeight;
      default:
        return 5;
    }
  }

  private renderNodeToPage(node: LayoutNode, x: number, y: number, width: number) {
    const currentPage = this.pages[this.pages.length - 1];

    if (node.type === 'text') {
      currentPage.elements.push({
        type: 'text',
        content: (node as TextElement).content,
        box: { x, y, width, height: 5 },
        style: node.style || {}
      } as RenderText);
    } else if (node.type === 'line') {
      currentPage.elements.push({
        type: 'line',
        thickness: (node as LineElement).thickness,
        box: { x, y, width, height: (node as LineElement).thickness },
        style: node.style || {}
      } as RenderLine);
    } else if (node.type === 'image') {
      currentPage.elements.push({
        type: 'image',
        url: (node as ImageElement).url,
        box: { 
          x, 
          y, 
          width: node.width && typeof node.width === 'number' ? node.width : width, 
          height: node.height && typeof node.height === 'number' ? node.height : 20 
        },
        style: node.style || {}
      } as RenderImage);
    } else if (node.type === 'container') {
      const container = node as ContainerElement;
      let offsetX = x;
      let offsetY = y;
      
      container.children.forEach(child => {
        const childWidth = container.layout === 'horizontal' ? width / container.children.length : width;
        this.renderNodeToPage(child, offsetX, offsetY, childWidth);
        if (container.layout === 'horizontal') offsetX += childWidth;
        else offsetY += this.estimateHeight(child, width);
      });
    } else if (node.type === 'table') {
      const table = node as TableElement;
      let tableY = y;
      const rowHeight = 8;
      const colWidth = width / table.columns.length;

      // Render Headers
      if (table.showHeaders) {
        table.columns.forEach((col, idx) => {
          currentPage.elements.push({
            type: 'text',
            content: col.header,
            box: { x: x + (idx * colWidth), y: tableY, width: colWidth, height: rowHeight },
            style: { fontWeight: 'bold', fontSize: 9 }
          } as RenderText);
        });
        tableY += rowHeight;
      }

      // Render Rows
      table.rows.forEach(row => {
        table.columns.forEach((col, idx) => {
          const cellNode = row.cells[col.id];
          if (cellNode.type === 'text') {
            currentPage.elements.push({
              type: 'text',
              content: cellNode.content,
              box: { x: x + (idx * colWidth), y: tableY, width: colWidth, height: rowHeight },
              style: cellNode.style || { fontSize: 9 }
            } as RenderText);
          }
        });
        tableY += rowHeight;
      });
    }
  }

  private applyFixedSections(sections: LayoutSection[]) {
    this.pages.forEach(page => {
      sections.forEach(section => {
        const shouldApply = 
          section.repeat === 'every-page' || 
          (section.repeat === 'first-page' && page.pageNumber === 1) ||
          (section.repeat === 'last-page' && page.pageNumber === this.pages.length);

        if (shouldApply) {
          const y = section.role === 'header' ? this.margins.top : (this.pageHeight - this.margins.bottom - this.footerHeight);
          // Temporary hack to target specific page during fixed section rendering
          const originalPages = this.pages;
          this.pages = [page];
          this.renderNodeToPage(section.content, this.margins.left, y, this.pageWidth - this.margins.left - this.margins.right);
          this.pages = originalPages;
        }
      });
    });
  }
}

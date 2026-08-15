
import { Sale, CompanyConfig } from '../types';
import { logger } from '../services/logger';
import { buildPosReceiptDoc } from './receiptCalculationService';

// ESC/POS Command Constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const COMMANDS = {
  INIT: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0],
  ALIGN_CENTER: [ESC, 0x61, 1],
  ALIGN_RIGHT: [ESC, 0x61, 2],
  FONT_B: [ESC, 0x4d, 1],
  BOLD_ON: [ESC, 0x45, 1],
  BOLD_OFF: [ESC, 0x45, 0],
  CHARACTER_SPACING: (n: number) => [ESC, 0x20, n],
  LINE_SPACING_DEFAULT: [ESC, 0x32],
  TEXT_NORMAL: [GS, 0x21, 0x00],
  TEXT_DOUBLE: [GS, 0x21, 0x11],
  CUT_FULL: [GS, 0x56, 0x00],
  CUT_PARTIAL: [GS, 0x56, 0x01],
  FEED_LINES: (n: number) => [ESC, 0x64, n],
};

const RECEIPT_LINE_WIDTH = 42;
const RECEIPT_DIVIDER = '-'.repeat(RECEIPT_LINE_WIDTH);

const toReceiptAscii = (value: string): string => (
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const wrapReceiptText = (value: string, width: number = RECEIPT_LINE_WIDTH): string[] => {
  const sanitized = toReceiptAscii(value);
  if (!sanitized) return [''];

  const words = sanitized.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
};

const formatReceiptPair = (
  label: string,
  value: string,
  width: number = RECEIPT_LINE_WIDTH
): string[] => {
  const safeValue = toReceiptAscii(value);
  if (!safeValue) return wrapReceiptText(label, width);
  if (safeValue.length >= width) return wrapReceiptText(`${label} ${safeValue}`, width);

  const labelWidth = Math.max(1, width - safeValue.length - 1);
  const labelLines = wrapReceiptText(label, labelWidth);
  if (labelLines.length === 0) {
    return [safeValue];
  }

  const leadingLines = labelLines.slice(0, -1);
  const lastLabelLine = labelLines[labelLines.length - 1];
  return [
    ...leadingLines,
    `${lastLabelLine.padEnd(labelWidth)} ${safeValue}`
  ];
};

class HardwareService {
  private device: any = null;
  private interfaceNumber: number = 0;
  private endpointOut: number = 0;
  private isConnectedState: boolean = false;

  constructor() {
    // Try to restore connection if possible (browser specific limitation often prevents auto-reconnect without gesture)
  }

  public isConnected(): boolean {
    return this.isConnectedState && !!this.device;
  }

  public getDeviceName(): string {
    return this.device ? this.device.productName || 'Unknown Device' : 'None';
  }

  public async connect() {
    if (!('usb' in navigator)) {
      console.warn("WebUSB is not supported in this browser. Please use Chrome, Edge, or Opera.");
      return false;
    }

    try {
      // Request device - this prompts the browser permission dialog
      // Filters empty to show all devices, or add vendorId for specific printers (e.g. Epson: 0x04b8)
      const device = await (navigator as Navigator & { usb: any }).usb.requestDevice({ filters: [] });
      await this.setupDevice(device);
      return true;
    } catch (error: any) {
      logger.error("USB Connection Failed:", error);
      if (error.name === 'SecurityError' || error.message.includes('permissions policy')) {
          console.warn("USB access blocked by Permissions Policy. Ensure the environment allows 'usb'.");
      }
      return false;
    }
  }

  public async disconnect() {
    if (this.device) {
      await this.device.close();
      this.device = null;
      this.isConnectedState = false;
    }
  }

  private async setupDevice(device: any) {
    await device.open();
    
    // Find the printer interface (usually class 7)
    let interfaceFound = false;
    
    if (device.configuration === null) {
        await device.selectConfiguration(1);
    }

    for (const element of device.configuration.interfaces) {
      const alt = element.alternates[0];
      if (alt.interfaceClass === 7) { // Printer Class
        this.interfaceNumber = element.interfaceNumber;
        
        // Find OUT endpoint
        for (const endpoint of alt.endpoints) {
          if (endpoint.direction === 'out') {
            this.endpointOut = endpoint.endpointNumber;
            interfaceFound = true;
            break;
          }
        }
      }
      if (interfaceFound) break;
    }

    if (!interfaceFound) {
        // Fallback: Try first interface with an OUT endpoint if standard printer class not found
        // Many generic Chinese thermal printers use vendor-specific classes
        const alt = device.configuration.interfaces[0].alternates[0];
        this.interfaceNumber = device.configuration.interfaces[0].interfaceNumber;
        for (const endpoint of alt.endpoints) {
            if (endpoint.direction === 'out') {
                this.endpointOut = endpoint.endpointNumber;
                interfaceFound = true;
                break;
            }
        }
    }

    if (!interfaceFound) {
        await device.close();
        throw new Error("Could not find a valid printer output endpoint.");
    }

    await device.claimInterface(this.interfaceNumber);
    this.device = device;
    this.isConnectedState = true;
  }

  public async printPosReceipt(receipt: {
    receiptNumber: string;
    date: string;
    cashierName: string;
    customerName?: string;
    items: { desc: string; qty: number; price: number; total: number }[];
    subtotal: number;
    discount: number;
    tax: number;
    totalAmount: number;
    paymentMethod: string;
    amountTendered: number;
    changeGiven: number;
    payments?: { method: string; amount: number; accountId?: string }[];
    footerMessage?: string;
  }, config: CompanyConfig) {
    if (!this.isConnected()) return;

    const encoder = new TextEncoder();
    const data: number[] = [];
    const legacyFooterMessage = typeof config.footer === 'string' ? config.footer : undefined;

    const add = (bytes: number[]) => data.push(...bytes);
    const text = (str: string) => {
        const bytes = encoder.encode(toReceiptAscii(str));
        bytes.forEach(b => data.push(b));
    };
    const line = (str: string) => { text(str); add([LF]); };
    const printLines = (rows: string[]) => rows.forEach(line);

    // --- Build Receipt ---
    
    // Init
    add(COMMANDS.INIT);
    add(COMMANDS.FONT_B);
    add(COMMANDS.TEXT_NORMAL);
    add(COMMANDS.CHARACTER_SPACING(0));
    add(COMMANDS.LINE_SPACING_DEFAULT);

    // Header
    add(COMMANDS.ALIGN_CENTER);
    add(COMMANDS.BOLD_ON);
    printLines(wrapReceiptText(config.companyName, RECEIPT_LINE_WIDTH));
    add(COMMANDS.BOLD_OFF);
    
    if (config.addressLine1) printLines(wrapReceiptText(config.addressLine1, RECEIPT_LINE_WIDTH));
    if (config.phone) printLines(wrapReceiptText(`Tel: ${config.phone}`, RECEIPT_LINE_WIDTH));
    add(COMMANDS.FEED_LINES(1));

    // Meta
    add(COMMANDS.ALIGN_LEFT);
    printLines(formatReceiptPair('Date', receipt.date));
    printLines(formatReceiptPair('Receipt #', receipt.receiptNumber));
    printLines(formatReceiptPair('Cashier', receipt.cashierName));
    if (receipt.customerName) printLines(formatReceiptPair('Customer', receipt.customerName));
    line(RECEIPT_DIVIDER);

    // Items
    receipt.items.forEach(item => {
        add(COMMANDS.ALIGN_LEFT);
        add(COMMANDS.BOLD_OFF);
        const descBlocks = String(item.desc || 'Item').split('\n');
        descBlocks.forEach((descLine, index) => {
          const wrappedLines = wrapReceiptText(descLine, index === 0 ? RECEIPT_LINE_WIDTH : RECEIPT_LINE_WIDTH - 2);
          wrappedLines.forEach((wrappedLine, wrappedIndex) => {
            if (index === 0 && wrappedIndex === 0) {
              line(wrappedLine);
              return;
            }
            line(`  ${wrappedLine}`);
          });
        });

        printLines(
          formatReceiptPair(
            `${item.qty} x ${config.currencySymbol}${item.price.toFixed(2)}`,
            `${config.currencySymbol}${item.total.toFixed(2)}`
          )
        );
    });
    
    line(RECEIPT_DIVIDER);

    // Totals
    add(COMMANDS.ALIGN_LEFT);
    printLines(formatReceiptPair('Subtotal', `${config.currencySymbol}${receipt.subtotal.toFixed(2)}`));
    if (receipt.discount > 0) {
      printLines(formatReceiptPair('Discount', `-${config.currencySymbol}${receipt.discount.toFixed(2)}`));
    }
    if (receipt.tax > 0) {
      printLines(formatReceiptPair('Tax', `${config.currencySymbol}${receipt.tax.toFixed(2)}`));
    }
    add(COMMANDS.BOLD_ON);
    printLines(formatReceiptPair('TOTAL', `${config.currencySymbol}${receipt.totalAmount.toFixed(2)}`));
    add(COMMANDS.BOLD_OFF);
    
    printLines(formatReceiptPair('Method', receipt.paymentMethod));
    if (receipt.payments && receipt.payments.length > 0) {
      receipt.payments.forEach(split => {
        printLines(formatReceiptPair(`  ${split.method}`, `${config.currencySymbol}${split.amount.toFixed(2)}`));
      });
    }
    printLines(formatReceiptPair('Tendered', `${config.currencySymbol}${receipt.amountTendered.toFixed(2)}`));
    printLines(formatReceiptPair('Change', `${config.currencySymbol}${receipt.changeGiven.toFixed(2)}`));
    
    // Footer
    add(COMMANDS.FEED_LINES(1));
    add(COMMANDS.ALIGN_CENTER);
    printLines(wrapReceiptText('Thank you for your business!', RECEIPT_LINE_WIDTH));
    const footerMessage =
      receipt.footerMessage ||
      config.transactionSettings?.pos?.receiptFooter ||
      legacyFooterMessage;
    if (footerMessage) {
        printLines(wrapReceiptText(footerMessage, RECEIPT_LINE_WIDTH));
    }

    // Cut
    add(COMMANDS.FEED_LINES(4)); // Feed to cutter
    add(COMMANDS.CUT_FULL);

    // Send Data
    const buffer = new Uint8Array(data);
    await this.device.transferOut(this.endpointOut, buffer);
  }

  public async printReceipt(sale: Sale, config: CompanyConfig, cashierName?: string) {
    const legacyFooterMessage = typeof config.footer === 'string' ? config.footer : undefined;
    const receipt = buildPosReceiptDoc({
      sale,
      cashierName: cashierName || sale.cashierId || 'Cashier',
      customerName: sale.customerName || 'Walk-in Customer',
      footerMessage: config.transactionSettings?.pos?.receiptFooter || legacyFooterMessage
    });
    await this.printPosReceipt(receipt, config);
  }
}

export const hardwareService = new HardwareService();

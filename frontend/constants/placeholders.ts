export interface PlaceholderConfig {
  phoneCountryCode: string;
  defaultCity: string;
  defaultAddress: string;
  exampleInvoicePrefix: string;
  exampleSkuPrefix: string;
  countryName: string;
}

export const PLACEHOLDER_CONFIGS: Record<string, PlaceholderConfig> = {
  MW: {
    phoneCountryCode: '+265',
    defaultCity: 'Lilongwe',
    defaultAddress: '123 Business Rd, Area 47',
    exampleInvoicePrefix: 'INV',
    exampleSkuPrefix: 'SKU',
    countryName: 'Malawi',
  },
  ZM: {
    phoneCountryCode: '+260',
    defaultCity: 'Lusaka',
    defaultAddress: '123 Cairo Road',
    exampleInvoicePrefix: 'INV',
    exampleSkuPrefix: 'SKU',
    countryName: 'Zambia',
  },
  KE: {
    phoneCountryCode: '+254',
    defaultCity: 'Nairobi',
    defaultAddress: '123 Kenyatta Avenue',
    exampleInvoicePrefix: 'INV',
    exampleSkuPrefix: 'SKU',
    countryName: 'Kenya',
  },
  TZ: {
    phoneCountryCode: '+255',
    defaultCity: 'Dar es Salaam',
    defaultAddress: '123 Samora Avenue',
    exampleInvoicePrefix: 'INV',
    exampleSkuPrefix: 'SKU',
    countryName: 'Tanzania',
  },
  ZW: {
    phoneCountryCode: '+263',
    defaultCity: 'Harare',
    defaultAddress: '123 Samora Machel Avenue',
    exampleInvoicePrefix: 'INV',
    exampleSkuPrefix: 'SKU',
    countryName: 'Zimbabwe',
  },
  US: {
    phoneCountryCode: '+1',
    defaultCity: 'New York',
    defaultAddress: '123 Main Street',
    exampleInvoicePrefix: 'INV',
    exampleSkuPrefix: 'SKU',
    countryName: 'United States',
  },
  GB: {
    phoneCountryCode: '+44',
    defaultCity: 'London',
    defaultAddress: '123 High Street',
    exampleInvoicePrefix: 'INV',
    exampleSkuPrefix: 'SKU',
    countryName: 'United Kingdom',
  },
};

export const DEFAULT_PLACEHOLDER_CONFIG = PLACEHOLDER_CONFIGS['MW'];

let currentConfig: PlaceholderConfig = DEFAULT_PLACEHOLDER_CONFIG;

export const setPlaceholderConfig = (countryCode: string) => {
  currentConfig = PLACEHOLDER_CONFIGS[countryCode] || DEFAULT_PLACEHOLDER_CONFIG;
};

export const getPlaceholderConfig = () => currentConfig;

export const getPlaceholder = {
  phone: (exampleNumber: string = '888 123 456') => 
    `${currentConfig.phoneCountryCode} ${exampleNumber}`,
  
  city: () => currentConfig.defaultCity,
  
  address: () => currentConfig.defaultAddress,
  
  addressLine2: () => {
    const city = currentConfig.defaultCity;
    if (city === 'Lilongwe') return 'Plot 47, Sector 2';
    if (city === 'Lusaka') return 'PO Box 12345';
    if (city === 'Nairobi') return 'PO Box 12345';
    if (city === 'Dar es Salaam') return 'PO Box 12345';
    if (city === 'Harare') return 'PO Box 12345';
    return 'Sector 2';
  },
  
  invoicePrefix: () => currentConfig.exampleInvoicePrefix,
  
  skuPrefix: () => currentConfig.exampleSkuPrefix,
  
  company: (exampleName: string = 'Acme Printing') => exampleName,
  
  email: (exampleDomain: string = 'example.com') => `name@${exampleDomain}`,
  
  search: () => 'Search...',
  
  searchItems: () => 'Search items...',
  
  quantity: (exampleQty: string = '5') => exampleQty,
  
  price: (examplePrice: string = '0.00') => examplePrice,
  
  percentage: () => '0.00 – 100.00',
  
  taxId: () => '100012345',
  
  apiKey: () => 'Enter API key',
};

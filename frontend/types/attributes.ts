export type AttributeDisplayType = 'pills' | 'color' | 'radio' | 'select';

export interface AttributeValue {
  id: string;
  value: string;
  label: string;
  colorCode?: string;
  extraPrice: number;
  sortOrder: number;
}

export interface ProductAttribute {
  id: string;
  name: string;
  displayType: AttributeDisplayType;
  values: AttributeValue[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

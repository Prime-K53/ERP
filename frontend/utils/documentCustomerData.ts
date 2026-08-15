const normalize = (value?: string | number | null) => String(value || '').trim().toLowerCase();

const pickText = (...candidates: any[]) => {
  for (const candidate of candidates) {
    const value = String(candidate ?? '').trim();
    if (value) return value;
  }
  return '';
};

const hasUsableCustomerShape = (value: any) =>
  Boolean(
    value
    && typeof value === 'object'
    && (
      value.id
      || value.name
      || value.address
      || value.billingAddress
      || value.shippingAddress
      || value.phone
      || value.email
    )
  );

export const enrichDocumentCustomerData = (rawData: any, customers: any[] = []) => {
  if (!rawData) return rawData;

  const customerPool = customers || [];
  const inlineCustomer = [rawData?.customer, rawData?.client, rawData?.school].find(hasUsableCustomerShape) || null;
  const candidateIds = [
    rawData?.customerId,
    rawData?.customer_id,
    rawData?.clientId,
    rawData?.client_id,
    rawData?.schoolId,
    rawData?.school_id,
    inlineCustomer?.id,
  ].map(normalize).filter(Boolean);
  const candidateNames = [
    rawData?.customerName,
    rawData?.customer_name,
    rawData?.clientName,
    rawData?.client_name,
    rawData?.schoolName,
    rawData?.school_name,
    rawData?.client,
    rawData?.customer,
    rawData?.school,
    inlineCustomer?.name,
  ].map(normalize).filter(Boolean);

  const customer = customerPool.find((entry: any) =>
    candidateIds.includes(normalize(entry?.id))
    || candidateNames.includes(normalize(entry?.name))
  ) || inlineCustomer;

  const resolvedBillingAddress = pickText(
    rawData?.billingAddress,
    rawData?.billing_address,
    customer?.billingAddress,
    customer?.billing_address,
    customer?.address
  );
  const resolvedShippingAddress = pickText(
    rawData?.shippingAddress,
    rawData?.shipping_address,
    customer?.shippingAddress,
    customer?.shipping_address,
    customer?.address,
    resolvedBillingAddress
  );
  const resolvedAddress = pickText(
    rawData?.customerAddress,
    rawData?.customer_address,
    rawData?.schoolAddress,
    rawData?.school_address,
    rawData?.shippingAddress,
    rawData?.shipping_address,
    rawData?.billingAddress,
    rawData?.billing_address,
    rawData?.address,
    customer?.customerAddress,
    customer?.schoolAddress,
    customer?.shippingAddress,
    customer?.billingAddress,
    customer?.address,
    resolvedShippingAddress,
    resolvedBillingAddress
  );
  const resolvedPhone = pickText(
    rawData?.customerPhone,
    rawData?.customer_phone,
    rawData?.schoolPhone,
    rawData?.school_phone,
    rawData?.phone,
    customer?.customerPhone,
    customer?.schoolPhone,
    customer?.phone
  );
  const resolvedEmail = pickText(
    rawData?.customerEmail,
    rawData?.customer_email,
    rawData?.schoolEmail,
    rawData?.school_email,
    rawData?.email,
    customer?.customerEmail,
    customer?.schoolEmail,
    customer?.email
  );
  const resolvedName = pickText(
    rawData?.customerName,
    rawData?.customer_name,
    rawData?.clientName,
    rawData?.client_name,
    rawData?.schoolName,
    rawData?.school_name,
    customer?.name
  );

  return {
    ...rawData,
    customerId: pickText(rawData?.customerId, rawData?.customer_id, rawData?.school_id, customer?.id),
    customerName: pickText(rawData?.customerName, rawData?.customer_name, rawData?.clientName, rawData?.schoolName, customer?.name),
    customerPhone: resolvedPhone,
    customerEmail: resolvedEmail,
    customerAddress: resolvedAddress,
    billingAddress: resolvedBillingAddress || resolvedAddress,
    shippingAddress: resolvedShippingAddress || resolvedAddress || resolvedBillingAddress,
    address: pickText(rawData?.address, resolvedAddress, resolvedShippingAddress, resolvedBillingAddress),
    phone: pickText(rawData?.phone, resolvedPhone),
    schoolName: pickText(rawData?.schoolName, rawData?.school_name, resolvedName),
    schoolAddress: pickText(rawData?.schoolAddress, rawData?.school_address, resolvedAddress),
    schoolPhone: pickText(rawData?.schoolPhone, rawData?.school_phone, resolvedPhone),
    walletBalance: rawData?.walletBalance ?? rawData?.wallet_balance ?? customer?.walletBalance ?? customer?.wallet_balance ?? 0,
    totalCustomerOutstanding: rawData?.totalCustomerOutstanding ?? rawData?.total_customer_outstanding ?? customer?.outstandingBalance ?? 0,
  };
};

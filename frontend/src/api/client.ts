const BASE_URL = '/api';

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  info: {
    database: { status: string };
    redis: { status: string };
  };
}

export interface IngestEventPayload {
  event_id: string;
  customer_id: string;
  feature_key: string;
  quantity: number;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export interface IngestEventResponse {
  status: 'accepted' | 'duplicate';
  event_id: string;
  message?: string;
  timestamp?: string;
}

export interface CustomerUsageItem {
  customerId: string;
  featureKey: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  durableQuantity: number;
  pendingQuantity: number;
  totalQuantity: number;
}

export interface PlanPricingConfig {
  flat_fee?: {
    amount_cents: number;
    description?: string;
  };
  rules?: Array<{
    feature_key: string;
    type: 'flat_fee' | 'per_unit' | 'tiered_graduated' | 'volume';
    config: any;
  }>;
}

export interface Plan {
  id: string;
  name: string;
  pricingConfig: PlanPricingConfig;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PreviewPricingResponse {
  plan_id: string | null;
  plan_version: number;
  total_amount_cents: number;
  line_items: Array<{
    featureKey?: string;
    description: string;
    quantity: number;
    amountCents: number;
    details?: any;
  }>;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  planId: string;
  planVersion: number;
  pricingConfigSnapshot: PlanPricingConfig;
  periodStart: string;
  periodEnd: string;
  subtotalCents: number;
  totalCents: number;
  status: string;
  finalizedAt: string;
  createdAt: string;
  customer?: { id: string; name: string; email: string };
  lineItems: Array<{
    id: string;
    featureKey: string | null;
    description: string;
    quantity: number;
    amountCents: number;
    details?: any;
  }>;
  journalEntries?: Array<{
    id: string;
    entryType: 'DEBIT' | 'CREDIT';
    account: string;
    amountCents: number;
    description: string;
    createdAt: string;
  }>;
}

export interface LedgerBalanceSummary {
  totalDebitsCents: number;
  totalCreditsCents: number;
  isBalanced: boolean;
  entriesCount: number;
}

export interface LedgerInvoiceAudit {
  invoice_id: string;
  balance_check: LedgerBalanceSummary;
  entries: Array<{
    id: string;
    invoiceId: string;
    entryType: 'DEBIT' | 'CREDIT';
    account: string;
    amountCents: number;
    description: string;
    createdAt: string;
  }>;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error: any = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data as T;
}

export const api = {
  health: {
    check: () => request<HealthCheckResponse>('/health'),
  },
  ingestion: {
    ingest: (payload: IngestEventPayload) =>
      request<IngestEventResponse>('/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
  aggregation: {
    getUsage: (customerId: string, periodKey?: string) =>
      request<{ customer_id: string; period_key: string; items: CustomerUsageItem[] }>(
        `/usage/${customerId}${periodKey ? `?periodKey=${periodKey}` : ''}`,
      ),
    flush: () =>
      request<{ status: string; flushedKeysCount: number; syncedEventsCount: number }>('/usage/flush', {
        method: 'POST',
      }),
  },
  plans: {
    list: () => request<Plan[]>('/plans'),
    create: (data: { name: string; pricing_config: PlanPricingConfig }) =>
      request<Plan>('/plans', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: { name?: string; pricing_config: PlanPricingConfig }) =>
      request<Plan>(`/plans/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  pricing: {
    preview: (payload: { plan_id?: string; pricing_config?: PlanPricingConfig; usage: Record<string, number> }) =>
      request<PreviewPricingResponse>('/pricing/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
  invoices: {
    generate: (payload: { customer_id: string; plan_id?: string; period_start: string; period_end: string }) =>
      request<Invoice>('/invoices/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    get: (id: string) => request<Invoice>(`/invoices/${id}`),
    listForCustomer: (customerId: string) => request<Invoice[]>(`/invoices/customer/${customerId}`),
    attemptMutate: (id: string, payload: any) =>
      request<any>(`/invoices/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
  },
  ledger: {
    getSummary: () => request<LedgerBalanceSummary>('/ledger/summary'),
    getEntries: () => request<any[]>('/ledger/entries'),
    getForInvoice: (invoiceId: string) => request<LedgerInvoiceAudit>(`/ledger/invoice/${invoiceId}`),
  },
};

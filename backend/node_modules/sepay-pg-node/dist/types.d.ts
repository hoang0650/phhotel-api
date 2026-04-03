export interface SepayConfig {
    env: 'sandbox' | 'production';
    merchant_id: string;
    secret_key: string;
    api_version?: 'v1';
    checkout_version?: 'v1';
}
interface CheckoutFields {
    merchant?: string;
    operation?: 'PURCHASE';
    payment_method?: 'BANK_TRANSFER' | 'NAPAS_BANK_TRANSFER';
    order_invoice_number: string;
    order_amount: number;
    currency: string;
    order_description: string;
    order_tax_amount?: number;
    customer_id?: string;
    success_url?: string;
    error_url?: string;
    cancel_url?: string;
    custom_data?: string;
}
export interface OnetimePaymentCheckoutFields extends CheckoutFields {
}
export {};
//# sourceMappingURL=types.d.ts.map
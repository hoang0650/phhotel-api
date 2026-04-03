import { OnetimePaymentCheckoutFields, SepayConfig } from "./types";
export declare class Checkout {
    private config;
    constructor(config: SepayConfig);
    initCheckoutUrl(): string;
    initOneTimePaymentFields(fields: OnetimePaymentCheckoutFields): {
        signature: string;
        merchant?: string;
        operation?: "PURCHASE";
        payment_method?: "BANK_TRANSFER" | "NAPAS_BANK_TRANSFER";
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
    };
    signFields(fields: Record<string, any>): string;
}
//# sourceMappingURL=checkout.d.ts.map
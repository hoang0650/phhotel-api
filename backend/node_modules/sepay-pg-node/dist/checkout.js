"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Checkout = void 0;
const client_1 = require("./client");
const crypto_1 = __importDefault(require("crypto"));
class Checkout {
    constructor(config) {
        this.config = config;
        if (!config) {
            throw new Error('SepayConfig is required');
        }
    }
    initCheckoutUrl() {
        return `${client_1.SePayPgClient.baseCheckoutUrl}/init`;
    }
    initOneTimePaymentFields(fields) {
        fields.merchant = this.config.merchant_id;
        if (!fields.operation) {
            fields.operation = 'PURCHASE';
        }
        const signature = this.signFields(fields);
        return {
            ...fields,
            signature,
        };
    }
    signFields(fields) {
        const signed = [];
        const signedFields = Object.keys(fields).filter(field => [
            'merchant',
            'env',
            'operation',
            'payment_method',
            'order_amount',
            'currency',
            'order_invoice_number',
            'order_description',
            'customer_id',
            'agreement_id',
            'agreement_name',
            'agreement_type',
            'agreement_payment_frequency',
            'agreement_amount_per_payment',
            'success_url',
            'error_url',
            'cancel_url',
            'order_id'
        ].includes(field));
        for (const field of signedFields) {
            if (fields[field] === undefined)
                continue;
            signed.push(`${field}=${fields[field] ?? ''}`);
        }
        const hmac = crypto_1.default.createHmac('sha256', this.config.secret_key);
        hmac.update(signed.join(','));
        return hmac.digest('base64');
    }
}
exports.Checkout = Checkout;
//# sourceMappingURL=checkout.js.map
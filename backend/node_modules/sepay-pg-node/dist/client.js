"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SePayPgClient = void 0;
const checkout_1 = require("./checkout");
const order_1 = require("./order");
class SePayPgClient {
    constructor(config) {
        this.config = config;
        if (!config.merchant_id || !config.secret_key) {
            throw new Error('Merchant ID and secret key are required');
        }
        if (!config.api_version) {
            config.api_version = 'v1';
        }
        if (!config.checkout_version) {
            config.checkout_version = 'v1';
        }
        if (['v1'].includes(config.checkout_version) === false) {
            throw new Error('Checkout version is not supported');
        }
        if (config.env === 'sandbox') {
            SePayPgClient.baseApiUrl = `https://pgapi-sandbox.sepay.vn/${config.api_version}`;
            SePayPgClient.baseCheckoutUrl = `https://pay-sandbox.sepay.vn/${config.checkout_version}/checkout`;
        }
        else {
            SePayPgClient.baseApiUrl = `https://pgapi.sepay.vn/${config.api_version}`;
            SePayPgClient.baseCheckoutUrl = `https://pay.sepay.vn/${config.checkout_version}/checkout`;
        }
        this.order = new order_1.Order(this.config);
        this.checkout = new checkout_1.Checkout(this.config);
    }
}
exports.SePayPgClient = SePayPgClient;
//# sourceMappingURL=client.js.map
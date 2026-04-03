"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Order = void 0;
const api_resource_1 = require("./api-resource");
class Order extends api_resource_1.ApiResource {
    all(queryParams = {}) {
        return this.makeHttpRequest('GET', 'order', { params: queryParams });
    }
    retrieve(order_invoice_number) {
        return this.makeHttpRequest('GET', `order/detail/${order_invoice_number}`);
    }
    voidTransaction(order_invoice_number) {
        return this.makeHttpRequest('POST', `order/voidTransaction`, {
            data: {
                order_invoice_number: order_invoice_number
            }
        });
    }
    cancel(order_invoice_number) {
        return this.makeHttpRequest('POST', `order/cancel`, {
            data: {
                order_invoice_number: order_invoice_number
            }
        });
    }
}
exports.Order = Order;
//# sourceMappingURL=order.js.map
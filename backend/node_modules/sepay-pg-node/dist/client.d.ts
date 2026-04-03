import { Checkout } from "./checkout";
import { Order } from "./order";
import { SepayConfig } from "./types";
declare class SePayPgClient {
    private config;
    static baseApiUrl: string;
    static baseCheckoutUrl: string;
    order: Order;
    checkout: Checkout;
    constructor(config: SepayConfig);
}
export { SePayPgClient, };
//# sourceMappingURL=client.d.ts.map
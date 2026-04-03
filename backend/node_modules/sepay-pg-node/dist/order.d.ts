import { ApiResource } from "./api-resource";
export interface OrderQueryParams {
    per_page?: number;
    q?: string;
    order_status?: string;
    created_at?: string;
    from_created_at?: string;
    to_created_at?: string;
    customer_id?: string | null;
    sort?: {
        created_at?: string;
    };
}
export declare class Order extends ApiResource {
    all(queryParams?: OrderQueryParams): Promise<import("axios").AxiosResponse<any, any>>;
    retrieve(order_invoice_number: string): Promise<import("axios").AxiosResponse<any, any>>;
    voidTransaction(order_invoice_number: string): Promise<import("axios").AxiosResponse<any, any>>;
    cancel(order_invoice_number: string): Promise<import("axios").AxiosResponse<any, any>>;
}
//# sourceMappingURL=order.d.ts.map
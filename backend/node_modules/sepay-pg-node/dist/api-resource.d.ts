import { AxiosRequestConfig } from "axios";
import { SepayConfig } from "./types";
export declare class ApiResource {
    private config;
    constructor(config: SepayConfig);
    makeHttpRequest(method: string, endpoint: string, options?: AxiosRequestConfig): Promise<import("axios").AxiosResponse<any, any>>;
}
//# sourceMappingURL=api-resource.d.ts.map
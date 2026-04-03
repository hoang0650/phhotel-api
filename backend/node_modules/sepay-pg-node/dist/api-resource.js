"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiResource = void 0;
const axios_1 = __importDefault(require("axios"));
const client_1 = require("./client");
class ApiResource {
    constructor(config) {
        this.config = config;
        if (!config) {
            throw new Error('SepayConfig is required');
        }
    }
    makeHttpRequest(method, endpoint, options) {
        return (0, axios_1.default)({
            method,
            url: `${client_1.SePayPgClient.baseApiUrl}/${endpoint}`,
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${btoa(`${this.config.merchant_id}:${this.config.secret_key}`)}`,
            },
        });
    }
}
exports.ApiResource = ApiResource;
//# sourceMappingURL=api-resource.js.map
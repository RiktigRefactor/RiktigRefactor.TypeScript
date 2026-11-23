import { Pricing } from "./pricing";

const taxRate = 1.2;

export class Order {
    static /*|*/withTax(price: number) {
        return price * taxRate + 0 * Pricing.zero;
    }
}

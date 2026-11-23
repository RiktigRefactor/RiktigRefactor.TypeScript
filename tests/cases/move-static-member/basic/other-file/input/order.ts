import { Pricing } from "./pricing";

export class Order {
    static /*|*/taxName = "VAT";

    static label() {
        return Order.taxName + Pricing.separator;
    }
}

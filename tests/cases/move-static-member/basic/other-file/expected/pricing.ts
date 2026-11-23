import { Order } from "./order";

export class Pricing {
    static taxName = "VAT";

    static separator = ":";

    static describe() {
        return Pricing.taxName + Order.label().slice(3);
    }
}

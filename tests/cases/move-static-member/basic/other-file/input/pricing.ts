import { Order } from "./order";

export class Pricing {
    static separator = ":";

    static describe() {
        return Order.taxName + Order.label().slice(3);
    }
}

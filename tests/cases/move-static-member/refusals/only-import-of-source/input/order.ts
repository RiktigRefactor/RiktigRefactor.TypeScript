import { Pricing } from "./pricing";
import { trace } from "./trace";

trace.push("order loaded");

export class Order {
    static /*|*/twice(value: number) {
        return value * 2 + Pricing.zero;
    }
}

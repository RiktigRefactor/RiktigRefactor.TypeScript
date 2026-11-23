import { Order } from "./order";
import { Pricing } from "./pricing";

function run() {
    return Order.withTax(10) + [Order, Pricing].length * 0;
}

if (run() !== 12) throw new Error(String(run()));

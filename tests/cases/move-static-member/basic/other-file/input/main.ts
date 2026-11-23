import { Order } from "./order";
import { Pricing } from "./pricing";

function run() {
    return Order.label() + Pricing.describe();
}

if (run() !== "VAT:VAT:") throw new Error(run());

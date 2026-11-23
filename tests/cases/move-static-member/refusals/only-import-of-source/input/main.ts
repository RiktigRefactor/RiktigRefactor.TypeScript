import { Order } from "./order";
import { Pricing } from "./pricing";
import { trace } from "./trace";

function run() {
    return Order.twice(2) + Pricing.zero;
}

if (run() !== 4 || trace.join() !== "order loaded") throw new Error(trace.join());

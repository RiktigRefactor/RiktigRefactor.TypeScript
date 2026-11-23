class Pricing {
    static rate = 2;
}

class Order {
    /** Doubles a price. */
    static /*|*/withTax(price: number): number {
        return price * Pricing.rate;
    }

    static total(prices: number[]) {
        return prices.map((price) => Order.withTax(price));
    }
}

function run() {
    return Order.total([1, 2]).join() + "," + Order.withTax(5);
}

if (run() !== "2,4,10") throw new Error(run());

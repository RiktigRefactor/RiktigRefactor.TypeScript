class Pricing {
    /** Doubles a price. */
    static withTax(price: number): number {
        return price * Pricing.rate;
    }

    static rate = 2;
}

class Order {
    static total(prices: number[]) {
        return prices.map((price) => Pricing.withTax(price));
    }
}

function run() {
    return Order.total([1, 2]).join() + "," + Pricing.withTax(5);
}

if (run() !== "2,4,10") throw new Error(run());

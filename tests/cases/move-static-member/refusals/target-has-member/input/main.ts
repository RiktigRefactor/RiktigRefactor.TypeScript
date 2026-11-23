class Pricing {
    static round(value: number) {
        return Math.round(value);
    }
}

class Order {
    static /*|*/round(value: number) {
        return Math.floor(value);
    }
}

function run() {
    return Order.round(2.7) + Pricing.round(2.7);
}

if (run() !== 5) throw new Error(String(run()));

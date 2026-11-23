class Pricing {
    static rate = 3;
}

class Order {
    static rate = 2;
    static /*|*/withTax(price: number) {
        return price * this.rate;
    }
}

function run() {
    return Order.withTax(5);
}

if (run() !== 10) throw new Error(String(run()));

class Order {
    static /*|*/twice(value: number) {
        return value * 2;
    }
}

const doubled = Order.twice(2);

class Pricing {}

if (doubled !== 4 || typeof Pricing !== "function") throw new Error("doubled");

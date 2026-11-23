class Pricing {}

class Order {
    static /*|*/twice(value: number) {
        return value * 2;
    }
}

function run(kind: typeof Order) {
    return kind.twice(2);
}

if (run(Order) !== 4 || typeof Pricing !== "function") throw new Error("run");

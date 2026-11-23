class Order {
    constructor(readonly price: number) {}

    /*|*/total(qty: number): number {
        return this.price * qty;
    }

    describe(): string {
        return `total ${this.total(2)}`;
    }
}

const order = new Order(5);
if (order.total(3) !== 15) throw new Error("total");
if (order.describe() !== "total 10") throw new Error(order.describe());

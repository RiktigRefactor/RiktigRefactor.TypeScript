class Order {
    constructor(readonly price: number) {}

    static total(order: Order, qty: number): number {
        return order.price * qty;
    }

    describe(): string {
        return `total ${Order.total(this, 2)}`;
    }
}

const order = new Order(5);
if (Order.total(order, 3) !== 15) throw new Error("total");
if (order.describe() !== "total 10") throw new Error(order.describe());

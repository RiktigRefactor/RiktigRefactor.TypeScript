class Order {
    constructor(readonly price: number) {}
    /*|*/total() {
        return this.price + order.price;
    }
}

const order = new Order(100);
if (new Order(2).total() !== 102) throw new Error("total");

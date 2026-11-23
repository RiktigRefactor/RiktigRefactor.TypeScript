class Order {
    /*|*/total = 5;
}

const untyped: any = new Order();
if (untyped.total !== 5) throw new Error("total");

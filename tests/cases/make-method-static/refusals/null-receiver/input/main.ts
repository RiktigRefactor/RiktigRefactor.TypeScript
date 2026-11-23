const trace: string[] = [];

class Order {
    price = 2;
    /*|*/total(qty: number) {
        return this.price * qty;
    }
}

function quantity() {
    trace.push("quantity");
    return 3;
}

function run(order: Order | undefined) {
    try {
        return order!.total(quantity());
    } catch {
        return -1;
    }
}

if (run(undefined) !== -1 || trace.join() !== "") throw new Error(trace.join());

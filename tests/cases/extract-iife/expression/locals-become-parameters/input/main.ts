function invoice(price: number, qty: number): number {
    const total = /*[*/price * qty/*]*/;
    return total;
}

if (invoice(2.5, 4) !== 10) throw new Error("invoice");

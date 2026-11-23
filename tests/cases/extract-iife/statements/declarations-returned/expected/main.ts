function describe(price: number): string {
    const [total, label] = ((price: number): [number, string] => {
        const total = price * 2;
        const label = `total: ${total}`;
        return [total, label];
    })(price);
    return label + (total > 3 ? "!" : "");
}

if (describe(2) !== "total: 4!") throw new Error(describe(2));

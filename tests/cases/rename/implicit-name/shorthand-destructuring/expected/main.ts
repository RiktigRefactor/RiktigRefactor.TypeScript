function read(source: Record<string, number>): number {
    const { total: amount } = source;
    return amount;
}

if (read({ total: 5, amount: 7 }) !== 5) throw new Error("read");

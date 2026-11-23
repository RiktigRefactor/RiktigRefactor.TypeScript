function read(source: Record<string, number>): number {
    const { /*|*/total } = source;
    return total;
}

if (read({ total: 5, amount: 7 }) !== 5) throw new Error("read");

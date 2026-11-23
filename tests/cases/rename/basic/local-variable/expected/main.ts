function sum(values: number[]): number {
    let total = 0;
    for (const value of values) total += value;
    return total;
}

if (sum([1, 2, 3]) !== 6) throw new Error("sum");

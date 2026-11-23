function sum(values: number[]): number {
    let /*|*/acc = 0;
    for (const value of values) acc += value;
    return acc;
}

if (sum([1, 2, 3]) !== 6) throw new Error("sum");

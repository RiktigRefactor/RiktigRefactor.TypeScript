function count(values: number[]): number {
    let [total] = ((values: number[]): [number] => {
        let total = 0;
        for (const value of values) total += value;
        return [total];
    })(values);
    total *= 10;
    return total;
}

if (count([1, 2]) !== 30) throw new Error(String(count([1, 2])));

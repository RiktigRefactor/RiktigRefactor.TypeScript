function measure(value: string): number;
function measure(value: number[]): number;
function measure(value: string | number[]): number {
    return value.length;
}

if (measure("abc") + measure([1]) !== 4) throw new Error("size");

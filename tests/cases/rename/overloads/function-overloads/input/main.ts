function size(value: string): number;
function /*|*/size(value: number[]): number;
function size(value: string | number[]): number {
    return value.length;
}

if (size("abc") + size([1]) !== 4) throw new Error("size");

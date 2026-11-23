class Ruler {
    measure(value: string): number;
    measure(value: number[]): number;
    measure(value: string | number[]): number {
        return value.length;
    }
}

const ruler = new Ruler();
if (ruler.measure("abc") + ruler.measure([1]) !== 4) throw new Error("size");

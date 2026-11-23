class Ruler {
    /*|*/widthOf(value: string): number;
    widthOf(value: number[]): number;
    widthOf(value: string | number[]): number {
        return value.length;
    }
}

const ruler = new Ruler();
if (ruler.widthOf("abc") + ruler.widthOf([1]) !== 4) throw new Error("size");

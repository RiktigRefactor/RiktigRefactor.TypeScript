class Doubler {
    factor = 2;
    apply(value: number) {
        return ((value: number): number => value * this.factor)(value);
    }
}

if (new Doubler().apply(3) !== 6) throw new Error("apply");

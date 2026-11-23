class Scaler {
    factor = 2;
    apply(values: number[]) {
        return ((values: number[]): number[] => values.map((value) => value * this.factor))(values);
    }
}

if (new Scaler().apply([3]).join() !== "6") throw new Error("apply");

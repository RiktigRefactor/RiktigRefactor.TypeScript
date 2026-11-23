class Scaler {
    factor = 2;
    apply(values: number[]) {
        return /*[*/values.map((value) => value * this.factor)/*]*/;
    }
}

if (new Scaler().apply([3]).join() !== "6") throw new Error("apply");

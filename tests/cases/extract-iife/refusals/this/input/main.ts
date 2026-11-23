class Doubler {
    factor = 2;
    apply(value: number) {
        return /*[*/value * this.factor/*]*/;
    }
}

if (new Doubler().apply(3) !== 6) throw new Error("apply");

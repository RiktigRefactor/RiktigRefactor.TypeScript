function make(start: number) {
    return ((start: number): number => function (this: { value: number }) {
        return this.value;
    }.call({ value: start }))(start);
}

if (make(4) !== 4) throw new Error("make");

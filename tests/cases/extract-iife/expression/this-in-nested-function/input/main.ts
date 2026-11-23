function make(start: number) {
    return /*[*/function (this: { value: number }) {
        return this.value;
    }.call({ value: start })/*]*/;
}

if (make(4) !== 4) throw new Error("make");

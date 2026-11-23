function count(..._values: number[]) {
    return /*[*/arguments.length/*]*/;
}

if (count(1, 2) !== 2) throw new Error("count");

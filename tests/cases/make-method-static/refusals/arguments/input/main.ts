class Counter {
    /*|*/count(..._values: number[]) {
        return arguments.length;
    }
}

if (new Counter().count(1, 2) !== 2) throw new Error("count");

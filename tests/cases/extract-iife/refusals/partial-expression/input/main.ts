function run(a: number, b: number, c: number) {
    return /*[*/a + b/*]*/ * c;
}

if (run(1, 2, 3) !== 7) throw new Error("run");

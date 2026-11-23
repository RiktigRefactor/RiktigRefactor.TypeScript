function run(factor: number) {
    const scale: (value: number) => number = /*[*/(value) => value * factor/*]*/;
    return scale(2);
}

if (run(3) !== 6) throw new Error("run");

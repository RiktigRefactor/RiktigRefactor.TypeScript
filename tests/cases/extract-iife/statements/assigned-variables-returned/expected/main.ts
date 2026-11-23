function step(start: number): string {
    let a = start;
    let b = 0;
    [a, b] = ((a: number, b: number): [number, number] => {
        a++;
        b = a * 2;
        return [a, b];
    })(a, b);
    return `${a},${b}`;
}

if (step(1) !== "2,4") throw new Error(step(1));

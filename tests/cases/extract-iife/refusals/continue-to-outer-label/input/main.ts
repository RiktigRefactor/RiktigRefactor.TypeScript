function odds(values: number[]) {
    const kept: number[] = [];
    outer: for (const value of values) {
        /*[*/for (;;) {
            if (value % 2 === 0) continue outer;
            break;
        }/*]*/
        kept.push(value);
    }
    return kept.join();
}

if (odds([1, 2, 3]) !== "1,3") throw new Error(odds([1, 2, 3]));

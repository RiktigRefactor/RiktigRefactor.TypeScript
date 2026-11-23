function firstEven(values: number[], trace: string[]) {
    /*[*/outer: for (const value of values) {
        for (;;) {
            if (value % 2 === 1) continue outer;
            trace.push(String(value));
            break outer;
        }
    }/*]*/
}

const trace: string[] = [];
firstEven([1, 3, 4, 6], trace);
if (trace.join() !== "4") throw new Error(trace.join());

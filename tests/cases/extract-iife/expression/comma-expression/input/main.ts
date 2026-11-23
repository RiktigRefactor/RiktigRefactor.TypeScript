function last(trace: string[]) {
    const value = (/*[*/trace.push("a"), trace.length/*]*/);
    return value;
}

const trace: string[] = [];
if (last(trace) !== 1 || trace.join() !== "a") throw new Error(trace.join());

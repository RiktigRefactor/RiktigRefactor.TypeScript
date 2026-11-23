function last(trace: string[]) {
    const value = (((trace: string[]): number => (trace.push("a"), trace.length))(trace));
    return value;
}

const trace: string[] = [];
if (last(trace) !== 1 || trace.join() !== "a") throw new Error(trace.join());

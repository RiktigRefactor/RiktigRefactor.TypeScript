function run(trace: string[]) {
    ((trace: string[]): void => {
        const doubled = trace.length * 2;
        let label = `n=${doubled}`;
        label += "!";
        trace.push(label);
    })(trace);
    return trace.join();
}

if (run(["a"]) !== "a,n=2!") throw new Error("run");

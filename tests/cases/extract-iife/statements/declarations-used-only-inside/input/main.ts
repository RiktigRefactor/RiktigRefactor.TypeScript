function run(trace: string[]) {
    /*[*/const doubled = trace.length * 2;
    let label = `n=${doubled}`;
    label += "!";
    trace.push(label);/*]*/
    return trace.join();
}

if (run(["a"]) !== "a,n=2!") throw new Error("run");

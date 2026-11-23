function render(trace: string[], name: string) {
    /*[*/trace.push(`Hello,
${name}`);
    trace.push("done");/*]*/
}

const trace: string[] = [];
render(trace, "Ana");
if (trace.join("|") !== "Hello,\nAna|done") throw new Error(JSON.stringify(trace));

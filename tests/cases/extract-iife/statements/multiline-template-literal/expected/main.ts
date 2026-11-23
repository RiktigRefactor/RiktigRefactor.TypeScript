function render(trace: string[], name: string) {
    ((trace: string[], name: string): void => {
        trace.push(`Hello,
${name}`);
        trace.push("done");
    })(trace, name);
}

const trace: string[] = [];
render(trace, "Ana");
if (trace.join("|") !== "Hello,\nAna|done") throw new Error(JSON.stringify(trace));

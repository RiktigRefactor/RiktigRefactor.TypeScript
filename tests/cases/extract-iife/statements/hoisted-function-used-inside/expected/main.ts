function run(trace: string[]) {
    ((trace: string[]): void => {
        trace.push(twice("a"));
        function twice(text: string) {
            return text + text;
        }
    })(trace);
    return trace.join();
}

if (run([]) !== "aa") throw new Error("run");

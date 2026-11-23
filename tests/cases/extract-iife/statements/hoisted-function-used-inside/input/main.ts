function run(trace: string[]) {
    /*[*/trace.push(twice("a"));
    function twice(text: string) {
        return text + text;
    }/*]*/
    return trace.join();
}

if (run([]) !== "aa") throw new Error("run");

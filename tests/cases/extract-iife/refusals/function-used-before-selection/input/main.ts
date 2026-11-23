function run() {
    const first = twice("a");
    /*[*/function twice(text: string) {
        return text + text;
    }/*]*/
    return first;
}

if (run() !== "aa") throw new Error("run");

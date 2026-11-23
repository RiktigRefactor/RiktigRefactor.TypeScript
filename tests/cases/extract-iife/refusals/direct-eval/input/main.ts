function run() {
    const secret = 41;
    return /*[*/eval("secret") + 1/*]*/;
}

if (run() !== 42) throw new Error("run");

function run() {
    const /*|*/total = 3;
    return eval("total") + total;
}

if (run() !== 6) throw new Error("run");

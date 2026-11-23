function run() {
    const box = { value: 1 };
    return box./*[*/value/*]*/;
}

if (run() !== 1) throw new Error("run");

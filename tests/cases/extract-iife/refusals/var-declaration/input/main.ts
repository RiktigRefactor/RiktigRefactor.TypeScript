function run() {
    /*[*/var count = 1;
    count++;/*]*/
    return 2;
}

if (run() !== 2) throw new Error("run");

function fail(): never {
    throw new Error("fail");
}

function run() {
    let stage = 0;
    try {
        /*[*/stage = 1;
        fail();/*]*/
    } catch {}
    return stage;
}

if (run() !== 1) throw new Error("run");

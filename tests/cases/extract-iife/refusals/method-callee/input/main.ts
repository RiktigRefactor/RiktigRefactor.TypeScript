class Counter {
    count = 0;
    increment() {
        return ++this.count;
    }
}

function run() {
    const counter = new Counter();
    return /*[*/counter.increment/*]*/();
}

if (run() !== 1) throw new Error("run");

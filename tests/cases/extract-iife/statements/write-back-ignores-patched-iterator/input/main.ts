const trace: string[] = [];
const originalIterator = Array.prototype[Symbol.iterator];
Array.prototype[Symbol.iterator] = function () {
    trace.push("iterated");
    return originalIterator.call(this);
};

function step(start: number) {
    let a = start;
    /*[*/a = a * 3;/*]*/
    return a;
}

const result = step(2);
Array.prototype[Symbol.iterator] = originalIterator;
if (result !== 6 || trace.length !== 0) throw new Error(`${result} ${trace.join()}`);

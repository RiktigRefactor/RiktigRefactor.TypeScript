const trace: string[] = [];

function run() {
    let result = "";
    try {
        result = String(read());
    } catch {
        result = trace.join();
    }
    const value = 1;
    function read() {
        return /*[*/(trace.push("read"), value)/*]*/;
    }
    return result;
}

if (run() !== "read") throw new Error(trace.join());

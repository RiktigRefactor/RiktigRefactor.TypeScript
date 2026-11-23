function run(trace: string[]) {
    const record = (entry: string) => trace.push(entry)
    let count = 1
    record("first")
    ;((record: (entry: string) => number, count: number): void => {
        record(String(count))
    })(record, count);
    return trace.join()
}

const result = run([])
if (result !== "first,1") throw new Error(result)

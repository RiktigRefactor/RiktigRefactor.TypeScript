function run(trace: string[]) {
    const record = (entry: string) => trace.push(entry)
    record("first")
    ;((record: (entry: string) => number): (entry: string) => number => record)(record)("second")
    return trace.join()
}

const result = run([])
if (result !== "first,second") throw new Error(result)

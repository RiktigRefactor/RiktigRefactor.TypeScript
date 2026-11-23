interface Line {
    /*|*/total: number;
}

const key = "total";
const line: Line = { [key]: 4 };
if (line.total !== 4) throw new Error("total");

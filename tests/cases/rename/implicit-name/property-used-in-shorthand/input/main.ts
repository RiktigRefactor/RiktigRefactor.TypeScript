interface Line {
    /*|*/total: number;
}

function makeLine(total: number): Line {
    return { total };
}

if (makeLine(3).total !== 3) throw new Error("total");

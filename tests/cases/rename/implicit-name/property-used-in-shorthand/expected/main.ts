interface Line {
    amount: number;
}

function makeLine(total: number): Line {
    return { amount: total };
}

if (makeLine(3).amount !== 3) throw new Error("total");

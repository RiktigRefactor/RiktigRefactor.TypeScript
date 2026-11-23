const y = 1;

function compute(): number {
    const /*|*/x = 2;
    return x * 10 + y;
}

if (compute() !== 21) throw new Error("compute");

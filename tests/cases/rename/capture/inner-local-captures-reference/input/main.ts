function compute(): number {
    const /*|*/x = 1;
    {
        const y = 10;
        return x + y;
    }
}

if (compute() !== 11) throw new Error("compute");

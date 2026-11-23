function point(x: number) {
    const value = ((x: number): { x: number; y: number; } => ({ x, y: x * 2 }))(x);
    return value;
}

if (point(2).y !== 4) throw new Error("point");

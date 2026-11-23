function point(x: number) {
    const value = /*[*/{ x, y: x * 2 }/*]*/;
    return value;
}

if (point(2).y !== 4) throw new Error("point");

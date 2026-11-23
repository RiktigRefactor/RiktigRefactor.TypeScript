class Point {
    x = 1;
}

function make() {
    const point = new /*[*/Point/*]*/();
    return point.x;
}

if (make() !== 1) throw new Error("make");

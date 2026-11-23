class Point {
    x = 1;
}

function make() {
    const point = new (((): typeof Point => Point)())();
    return point.x;
}

if (make() !== 1) throw new Error("make");

function make() {
    const Point = class {
        x = 1;
    };
    const point = new (/*[*/Point/*]*/)();
    return point.x;
}

if (make() !== 1) throw new Error("make");

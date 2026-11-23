interface /*|*/Vector {
    x?: number;
}

interface Point {
    x?: number;
}

const vector: Vector = { x: 1 };
const point: Point = {};
if (vector.x !== 1 || point.x !== undefined) throw new Error("points");

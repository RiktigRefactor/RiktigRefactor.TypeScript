interface Circle {
    /*|*/width: number;
}
interface Square {
    side: number;
}

function area(shape: Circle | Square) {
    if ("width" in shape) return shape.width * shape.width * 3;
    return shape.side * shape.side;
}

if (area({ width: 1 }) !== 3) throw new Error("area");

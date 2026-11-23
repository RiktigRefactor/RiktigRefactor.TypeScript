interface Shape {
    width: number;
}

interface Shape {
    height: number;
}

const box: Shape = { width: 2, height: 3 };
if (box.width * box.height !== 6) throw new Error("area");

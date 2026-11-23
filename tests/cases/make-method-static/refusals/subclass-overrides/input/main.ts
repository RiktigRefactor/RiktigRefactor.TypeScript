class Shape {
    /*|*/name(): string {
        return "shape";
    }
}

class Circle extends Shape {
    override name(): string {
        return "circle";
    }
}

const shape: Shape = new Circle();
if (shape.name() !== "circle") throw new Error(shape.name());

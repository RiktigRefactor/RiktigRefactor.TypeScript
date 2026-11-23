interface Labeled {
    label?(): string;
}

class Box {
    /*|*/label() {
        return "box";
    }
}

const labeled: Labeled = new Box();
if (labeled.label?.() !== "box") throw new Error("label");

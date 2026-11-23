class Base {
    label() {
        return "base";
    }
}

class Derived extends Base {
    /*|*/describe() {
        return super.label() + "!";
    }
}

if (new Derived().describe() !== "base!") throw new Error("describe");

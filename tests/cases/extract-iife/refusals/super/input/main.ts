class Base {
    name() {
        return "base";
    }
}

class Derived extends Base {
    override name() {
        return /*[*/super.name() + "+"/*]*/;
    }
}

if (new Derived().name() !== "base+") throw new Error("name");

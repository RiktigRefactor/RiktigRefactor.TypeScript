class Base {
    static describe() {
        return "base";
    }
}

class Special extends Base {}

class Order {
    static /*|*/describe() {
        return "order";
    }
}

function run() {
    return Special.describe() + Order.describe();
}

if (run() !== "baseorder") throw new Error(run());

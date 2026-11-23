class Greeter {
    greeting = "hi";
    /*|*/greet(name: string) {
        return `${this.greeting} ${name}`;
    }
}

const greeter = new Greeter();
const names = ["a"].map((name) => greeter.greet(name));
const greet = greeter.greet;
if (names.join() !== "hi a" || typeof greet !== "function") throw new Error(names.join());

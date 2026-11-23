class Animal {
    speak(): string {
        return "...";
    }
}

class Dog extends Animal {
    /*|*/bark(): string {
        return "woof";
    }
}

const animal: Animal = new Dog();
if (animal.speak() !== "...") throw new Error(animal.speak());
if (new Dog().bark() !== "woof") throw new Error("bark");

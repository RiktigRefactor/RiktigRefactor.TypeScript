class Animal {
    /*|*/speak(): string {
        return "...";
    }
}

class Dog extends Animal {
    bark(): string {
        return "woof";
    }
}

const animal: Animal = new Dog();
if (animal.speak() !== "...") throw new Error(animal.speak());

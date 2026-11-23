interface Named {
    label(): string;
}

class Animal implements Named {
    label(): string {
        return "animal";
    }
}

class Dog extends Animal {
    override /*|*/label(): string {
        return "dog";
    }
}

const named: Named = new Dog();
if (named.label() !== "dog") throw new Error(named.label());

interface Named {
    describe(): string;
}

class Animal implements Named {
    describe(): string {
        return "animal";
    }
}

class Dog extends Animal {
    override describe(): string {
        return "dog";
    }
}

const named: Named = new Dog();
if (named.describe() !== "dog") throw new Error(named.describe());

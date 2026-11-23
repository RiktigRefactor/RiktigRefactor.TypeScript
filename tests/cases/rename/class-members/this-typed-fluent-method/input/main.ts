class Builder {
    parts: string[] = [];
    /*|*/add(part: string): this {
        this.parts.push(part);
        return this;
    }
}

class LoudBuilder extends Builder {
    shout(): this {
        return this.add("!");
    }
}

const built = new LoudBuilder().add("a").shout().add("b");
if (built.parts.join("") !== "a!b") throw new Error(built.parts.join(""));

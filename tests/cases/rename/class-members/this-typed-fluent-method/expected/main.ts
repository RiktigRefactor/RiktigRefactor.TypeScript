class Builder {
    parts: string[] = [];
    append(part: string): this {
        this.parts.push(part);
        return this;
    }
}

class LoudBuilder extends Builder {
    shout(): this {
        return this.append("!");
    }
}

const built = new LoudBuilder().append("a").shout().append("b");
if (built.parts.join("") !== "a!b") throw new Error(built.parts.join(""));

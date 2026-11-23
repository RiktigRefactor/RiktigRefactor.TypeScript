class Builder {
    parts: string[] = [];
    /*|*/add(part: string): this {
        this.parts.push(part);
        return this;
    }
}

if (new Builder().add("a").add("b").parts.join() !== "a,b") throw new Error("add");

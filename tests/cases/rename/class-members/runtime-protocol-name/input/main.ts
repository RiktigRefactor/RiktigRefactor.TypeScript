class Money {
    constructor(private readonly cents: number) {}
    /*|*/toString(): string {
        return `$${this.cents / 100}`;
    }
}

const text = `${new Money(150)}`;
if (text !== "$1.5") throw new Error(text);

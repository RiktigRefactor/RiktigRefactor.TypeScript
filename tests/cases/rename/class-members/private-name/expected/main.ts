class Counter {
    #total = 0;
    increment() {
        this.#total++;
        return this.#total;
    }
}

const counter = new Counter();
counter.increment();
if (counter.increment() !== 2) throw new Error("count");

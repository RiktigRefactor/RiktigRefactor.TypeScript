class Counter {
    /*|*/#count = 0;
    increment() {
        this.#count++;
        return this.#count;
    }
}

const counter = new Counter();
counter.increment();
if (counter.increment() !== 2) throw new Error("count");

class Counter {
    /*|*/#count = 1;
    read() {
        return this.#count;
    }
}
if (new Counter().read() !== 1) throw new Error("count");

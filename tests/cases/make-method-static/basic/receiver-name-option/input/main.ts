class Counter {
    count = 1;
    /*|*/doubled() {
        return this.count * 2;
    }
}

if (new Counter().doubled() !== 2) throw new Error("doubled");

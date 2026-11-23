class Counter {
    count = 1;
    static doubled(self: Counter) {
        return self.count * 2;
    }
}

if (Counter.doubled(new Counter()) !== 2) throw new Error("doubled");

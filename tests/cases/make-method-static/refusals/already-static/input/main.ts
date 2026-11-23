class Util {
    static /*|*/twice(value: number) {
        return value * 2;
    }
}

if (Util.twice(2) !== 4) throw new Error("twice");

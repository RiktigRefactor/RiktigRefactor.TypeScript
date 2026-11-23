const rate = 3;
function scale(value: number) {
    return value * rate;
}

const scaled = ((): number => scale(2) + rate)();
if (scaled !== 9) throw new Error(String(scaled));

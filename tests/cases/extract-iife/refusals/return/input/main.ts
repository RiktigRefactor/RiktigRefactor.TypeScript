function sign(value: number): string {
    /*[*/if (value < 0) return "negative";/*]*/
    return "non-negative";
}

if (sign(-1) !== "negative") throw new Error("sign");

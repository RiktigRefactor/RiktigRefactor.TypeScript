function firstOver(values: number[], limit: number) {
    let found = -1;
    for (const value of values) {
        /*[*/if (value > limit) {
            found = value;
            break;
        }/*]*/
    }
    return found;
}

if (firstOver([1, 5, 9], 3) !== 5) throw new Error("firstOver");

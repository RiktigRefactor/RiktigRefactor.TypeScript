function next(start: number) {
    let x = start;
    const previous = /*[*/x++/*]*/;
    return `${previous},${x}`;
}

if (next(1) !== "1,2") throw new Error(next(1));

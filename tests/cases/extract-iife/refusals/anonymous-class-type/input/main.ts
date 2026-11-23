function make(start: number) {
    return /*[*/new (class {
        value = start;
    })()/*]*/;
}

if (make(4).value !== 4) throw new Error("make");

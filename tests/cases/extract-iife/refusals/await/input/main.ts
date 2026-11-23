async function load(source: Promise<number>) {
    const value = /*[*/(await source) + 1/*]*/;
    return value;
}

load(Promise.resolve(1)).then((value) => {
    if (value !== 2) throw new Error("load");
});

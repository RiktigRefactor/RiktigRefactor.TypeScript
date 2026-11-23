function size(text: string | undefined): number {
    if (text === undefined) return 0;
    return /*[*/text.length/*]*/;
}

if (size("abc") !== 3 || size(undefined) !== 0) throw new Error("size");
